import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { connectSocket } from '../lib/socket'
import { createSpeakingMonitor } from '../lib/audioLevel'
import {
  SUPPORTS_OUTPUT_SELECTION,
  getAudioInputPref, setAudioInputPref,
  getAudioOutputPref, setAudioOutputPref,
} from '../lib/audioDevicePrefs'
import { saveVoiceCallSession, getVoiceCallSession, clearVoiceCallSession } from '../lib/voiceCallSession'

const VoiceCallContext = createContext(null)

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

// Canales de voz (mesh WebRTC): cada participante conecta directo con los demás,
// el socket ya montado por ChatContext hace de señalización. Contexto HERMANO de
// ChatContext, no anidado adentro — no comparte nada de su estado (canales,
// contadores, sonido) y mezclar RTCPeerConnection/streams ahí infla una
// responsabilidad con un dominio totalmente distinto.
//
// Vive montado en la raíz del árbol (App.jsx) para sobrevivir a que el panel de
// ChatWidget se cierre: la llamada sigue activa mientras el usuario navega el
// resto de la app, con VoiceCallIndicator (FloatingDock.jsx) como acceso rápido.
//
// Fuera de alcance a propósito: sin TURN server (solo STUN público — alcanza para
// redes normales, puede fallar en NATs corporativos restrictivos), sin reconexión
// transparente de peers (una reconexión de socket simplemente re-hace voice:join y
// reconstruye todo desde cero — sí se ofrece un rejoin MANUAL tras recargar la
// página completa, ver pendingReconnect/acceptReconnect más abajo).
export function VoiceCallProvider({ children }) {
  const { user } = useAuth()
  const [activeCall, setActiveCall] = useState(null) // { channelId, channelSlug, channelName, muted, participants: [{socketId,userId,name,muted}] } | null
  const [voicePresence, setVoicePresence] = useState(new Map()) // channelId -> [{userId,name}], independiente de estar en la llamada
  const [remoteStreams, setRemoteStreams] = useState(new Map()) // socketId -> MediaStream, para los <audio> ocultos
  const [speakingIds, setSpeakingIds] = useState(new Set()) // 'self' | socketId — quién tiene el mic activo ahora mismo
  const [connectionIssues, setConnectionIssues] = useState(new Set()) // socketId con la conexión P2P caída
  const [inputDeviceId, setInputDeviceId] = useState(null) // deviceId preferido de micrófono, o null = predeterminado
  const [outputDeviceId, setOutputDeviceId] = useState(null) // ídem, salida de audio (setSinkId)
  const [pendingReconnect, setPendingReconnect] = useState(null) // { channelId, channelSlug, channelName } | null

  const activeCallRef = useRef(null)
  const peersRef = useRef(new Map()) // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null)
  const pendingIceRef = useRef(new Map()) // socketId -> RTCIceCandidate[] buffereados hasta tener remoteDescription
  const speakingMonitorsRef = useRef(new Map()) // 'self' | socketId -> { stop() }
  const restartAttemptedRef = useRef(new Set()) // socketId — para no encadenar restartIce() en loop
  const audioElsRef = useRef(new Map()) // socketId -> HTMLAudioElement, para poder aplicarles setSinkId

  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])

  // Preferencias de dispositivo: se leen recién con user.id disponible (localStorage
  // es por usuario, igual que chatSound.js).
  useEffect(() => {
    if (!user?.id) return
    setInputDeviceId(getAudioInputPref(user.id))
    setOutputDeviceId(getAudioOutputPref(user.id))
  }, [user?.id])

  // Al montar con un usuario ya logueado (típicamente tras un F5 completo, que mata
  // todo este estado de React): si había una llamada en curso en esta pestaña, ofrecer
  // reconectar en vez de reactivar el micrófono solo y sin avisar.
  useEffect(() => {
    if (!user?.id || activeCallRef.current) return
    const session = getVoiceCallSession(user.id)
    if (session) setPendingReconnect(session)
  }, [user?.id])

  const setSpeaking = useCallback((id, isSpeaking) => {
    setSpeakingIds(prev => {
      if (isSpeaking === prev.has(id)) return prev
      const next = new Set(prev)
      if (isSpeaking) next.add(id); else next.delete(id)
      return next
    })
  }, [])

  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId)
    if (pc) { pc.close(); peersRef.current.delete(socketId) }
    pendingIceRef.current.delete(socketId)
    speakingMonitorsRef.current.get(socketId)?.stop()
    speakingMonitorsRef.current.delete(socketId)
    restartAttemptedRef.current.delete(socketId)
    setSpeaking(socketId, false)
    setConnectionIssues(prev => {
      if (!prev.has(socketId)) return prev
      const next = new Set(prev)
      next.delete(socketId)
      return next
    })
    setRemoteStreams(prev => {
      if (!prev.has(socketId)) return prev
      const next = new Map(prev)
      next.delete(socketId)
      return next
    })
  }, [setSpeaking])

  // Cierra y descarta TODAS las RTCPeerConnection remotas sin tocar el mic local ni
  // `activeCall` — usada tanto al colgar (cleanupCall) como al reconectar el socket
  // (onConnect más abajo), donde los peers viejos quedan huérfanos igual.
  const cleanupAllPeers = useCallback(() => {
    for (const socketId of peersRef.current.keys()) cleanupPeer(socketId)
  }, [cleanupPeer])

  const cleanupCall = useCallback(() => {
    cleanupAllPeers()
    speakingMonitorsRef.current.get('self')?.stop()
    speakingMonitorsRef.current.delete('self')
    setSpeaking('self', false)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setActiveCall(null)
    clearVoiceCallSession(user?.id)
  }, [cleanupAllPeers, setSpeaking, user?.id])

  // Crea (si falta) la RTCPeerConnection de un peer, con los tracks locales ya
  // agregados y el manejo de ICE candidates propio hacia ese peer.
  const getOrCreatePeer = useCallback((socketId) => {
    let pc = peersRef.current.get(socketId)
    if (pc) return pc
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peersRef.current.set(socketId, pc)

    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const socket = connectSocket()
      socket?.emit('voice:signal', { to: socketId, signal: { type: 'ice', candidate: e.candidate } })
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      setRemoteStreams(prev => {
        const next = new Map(prev)
        next.set(socketId, stream)
        return next
      })
      speakingMonitorsRef.current.get(socketId)?.stop()
      speakingMonitorsRef.current.set(socketId, createSpeakingMonitor(stream, isSpeaking => setSpeaking(socketId, isSpeaking)))
    }
    // Un intento automático de restartIce() por episodio de falla — si vuelve a
    // reconectar y falla de nuevo más tarde, se permite un nuevo intento (no es
    // "una sola vez para siempre", es "una vez por caída").
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setConnectionIssues(prev => new Set(prev).add(socketId))
        if (!restartAttemptedRef.current.has(socketId)) {
          restartAttemptedRef.current.add(socketId)
          pc.restartIce()
        }
      } else if (pc.connectionState === 'connected') {
        restartAttemptedRef.current.delete(socketId)
        setConnectionIssues(prev => {
          if (!prev.has(socketId)) return prev
          const next = new Set(prev)
          next.delete(socketId)
          return next
        })
      }
    }
    return pc
  }, [setSpeaking])

  const joinCall = useCallback(async (channel) => {
    if (activeCallRef.current?.channelId === channel.id) return
    if (activeCallRef.current) cleanupCall()

    const socket = connectSocket()
    if (!socket) return

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      })
    } catch {
      alert('No pudimos acceder a tu micrófono. Revisá los permisos del navegador.')
      return
    }
    speakingMonitorsRef.current.set('self', createSpeakingMonitor(localStreamRef.current, isSpeaking => setSpeaking('self', isSpeaking)))

    setActiveCall({ channelId: channel.id, channelSlug: channel.slug, channelName: channel.name, muted: false, participants: [] })
    saveVoiceCallSession(user?.id, { channelId: channel.id, channelSlug: channel.slug, channelName: channel.name })
    setPendingReconnect(null) // si venía de aceptar un reconnect, ya se resolvió
    socket.emit('voice:join', channel.id)
  }, [cleanupCall, setSpeaking, inputDeviceId, user?.id])

  const leaveCall = useCallback(() => {
    const call = activeCallRef.current
    if (!call) return
    const socket = connectSocket()
    socket?.emit('voice:leave', call.channelId)
    cleanupCall()
  }, [cleanupCall])

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current
    if (!call || !localStreamRef.current) return
    const nextMuted = !call.muted
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextMuted })
    const socket = connectSocket()
    socket?.emit('voice:mute', { channelId: call.channelId, muted: nextMuted })
    setActiveCall(prev => (prev ? { ...prev, muted: nextMuted } : prev))
  }, [])

  // Cambia el micrófono EN VIVO sin cortar la llamada: reemplaza el track en cada
  // RTCPeerConnection (`replaceTrack`) en vez de salir y volver a entrar. Si no hay
  // llamada activa, solo persiste la preferencia para la próxima vez que se una.
  const setAudioInputDevice = useCallback(async (deviceId) => {
    setInputDeviceId(deviceId)
    setAudioInputPref(user?.id, deviceId)
    if (!activeCallRef.current) return
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
    const newTrack = newStream.getAudioTracks()[0]
    newTrack.enabled = !activeCallRef.current.muted // replaceTrack no hereda el estado de mute
    for (const pc of peersRef.current.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (sender) await sender.replaceTrack(newTrack)
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = newStream
    speakingMonitorsRef.current.get('self')?.stop()
    speakingMonitorsRef.current.set('self', createSpeakingMonitor(newStream, isSpeaking => setSpeaking('self', isSpeaking)))
  }, [user?.id, setSpeaking])

  // Salida de audio: persiste la preferencia; el efecto de renderizado de <audio>
  // (más abajo) es quien aplica setSinkId a cada elemento ya montado.
  const setAudioOutputDevice = useCallback((deviceId) => {
    setOutputDeviceId(deviceId)
    setAudioOutputPref(user?.id, deviceId)
  }, [user?.id])

  // Reconexión manual tras F5 — nunca automática/silenciosa: aceptar vuelve a pedir
  // getUserMedia (mic apagado hasta ese click), descartar solo limpia el aviso.
  const acceptReconnect = useCallback(() => {
    if (pendingReconnect) {
      joinCall({ id: pendingReconnect.channelId, slug: pendingReconnect.channelSlug, name: pendingReconnect.channelName })
    }
  }, [pendingReconnect, joinCall])

  const dismissReconnect = useCallback(() => {
    clearVoiceCallSession(user?.id)
    setPendingReconnect(null)
  }, [user?.id])

  // Al deslogearse: cortar cualquier llamada en curso (no dejar el micrófono
  // abierto). No hace falta disconnectSocket() acá — ChatContext ya lo hace.
  useEffect(() => {
    if (!user) cleanupCall()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    const socket = connectSocket()
    if (!socket) return

    function onPresence({ channelId, participants } = {}) {
      if (channelId == null) return
      setVoicePresence(prev => {
        const next = new Map(prev)
        next.set(channelId, participants || [])
        return next
      })
    }
    function onPresenceSnapshot(rows = []) {
      setVoicePresence(new Map(rows.map(r => [r.channelId, r.participants || []])))
    }

    // Yo soy quien se acaba de unir: recibo el roster existente y le ofrezco (offer)
    // a cada uno — regla fija para evitar glare (dos ofertas cruzándose) en un mesh.
    async function onRoster({ channelId, participants } = {}) {
      if (activeCallRef.current?.channelId !== channelId) return
      setActiveCall(prev => (prev ? { ...prev, participants: participants.map(p => ({ ...p })) } : prev))
      for (const p of participants) {
        const pc = getOrCreatePeer(p.socketId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('voice:signal', { to: p.socketId, signal: { type: 'offer', sdp: offer } })
      }
    }

    function onPeerJoined(p) {
      if (!activeCallRef.current) return
      // No crea la RTCPeerConnection acá — la crea quien se une (onRoster de ese
      // peer), yo solo espero su offer.
      setActiveCall(prev => (prev ? { ...prev, participants: [...prev.participants, p] } : prev))
    }

    async function onSignal({ from, signal } = {}) {
      if (!activeCallRef.current || !signal) return
      const pc = getOrCreatePeer(from)
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        for (const c of pendingIceRef.current.get(from) || []) await pc.addIceCandidate(c)
        pendingIceRef.current.delete(from)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('voice:signal', { to: from, signal: { type: 'answer', sdp: answer } })
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        for (const c of pendingIceRef.current.get(from) || []) await pc.addIceCandidate(c)
        pendingIceRef.current.delete(from)
      } else if (signal.type === 'ice') {
        const candidate = new RTCIceCandidate(signal.candidate)
        if (pc.remoteDescription) await pc.addIceCandidate(candidate)
        else pendingIceRef.current.set(from, [...(pendingIceRef.current.get(from) || []), candidate])
      }
    }

    function onPeerLeft({ socketId } = {}) {
      cleanupPeer(socketId)
      setActiveCall(prev => (prev ? { ...prev, participants: prev.participants.filter(p => p.socketId !== socketId) } : prev))
    }

    function onPeerMuted({ socketId, muted } = {}) {
      setActiveCall(prev => (prev ? { ...prev, participants: prev.participants.map(p => (p.socketId === socketId ? { ...p, muted } : p)) } : prev))
    }

    // Reconexión de socket: el servidor perdió el estado de la sala anterior en el
    // disconnect — corte breve, no transparente. Rejoin completo si había llamada.
    // Los peers que teníamos quedan huérfanos (del otro lado, cada participante
    // reconectado tiene un socket.id NUEVO, así que jamás va a llegar un
    // voice:peer-left para el viejo): se cierran acá antes de re-unirse, si no
    // quedan RTCPeerConnection zombies + audio congelado de la sesión anterior.
    function onConnect() {
      const call = activeCallRef.current
      if (!call) return
      cleanupAllPeers()
      socket.emit('voice:join', call.channelId)
    }

    socket.on('voice:presence', onPresence)
    socket.on('voice:presence:snapshot', onPresenceSnapshot)
    socket.on('voice:roster', onRoster)
    socket.on('voice:peer-joined', onPeerJoined)
    socket.on('voice:signal', onSignal)
    socket.on('voice:peer-left', onPeerLeft)
    socket.on('voice:peer-muted', onPeerMuted)
    socket.on('connect', onConnect)
    return () => {
      socket.off('voice:presence', onPresence)
      socket.off('voice:presence:snapshot', onPresenceSnapshot)
      socket.off('voice:roster', onRoster)
      socket.off('voice:peer-joined', onPeerJoined)
      socket.off('voice:signal', onSignal)
      socket.off('voice:peer-left', onPeerLeft)
      socket.off('voice:peer-muted', onPeerMuted)
      socket.off('connect', onConnect)
    }
  }, [user?.id, getOrCreatePeer, cleanupPeer, cleanupAllPeers])

  // Reaplica setSinkId a los <audio> ya montados cuando cambia la preferencia de
  // salida (sin esto, solo se aplicaría a elementos nuevos vía el callback ref).
  useEffect(() => {
    if (!SUPPORTS_OUTPUT_SELECTION) return
    for (const el of audioElsRef.current.values()) {
      el.setSinkId?.(outputDeviceId || '').catch(() => {})
    }
  }, [outputDeviceId])

  // Media Session API: le avisa al navegador que hay "audio en curso" mientras dura
  // la llamada — en Chrome/Android esto es lo que evita que el sistema operativo
  // mate la pestaña en background para ahorrar batería (soporte parcial en iOS
  // Safari, pero declarar la metadata no rompe nada donde no aplique). Depende solo
  // de `channelId`/`channelName` (no del objeto `activeCall` completo, que cambia de
  // referencia en cada mute/participante nuevo) para no reescribir esto de más.
  const callChannelId = activeCall?.channelId ?? null
  const callChannelName = activeCall?.channelName ?? null
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (callChannelId != null) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Llamada de voz · ${callChannelName || ''}`,
        artist: 'BlissTracker',
      })
      navigator.mediaSession.playbackState = 'playing'
    } else {
      navigator.mediaSession.playbackState = 'none'
      navigator.mediaSession.metadata = null
    }
  }, [callChannelId, callChannelName])

  return (
    <VoiceCallContext.Provider value={{
      activeCall, voicePresence, speakingIds, connectionIssues,
      joinCall, leaveCall, toggleMute,
      inputDeviceId, outputDeviceId, setAudioInputDevice, setAudioOutputDevice,
      supportsOutputSelection: SUPPORTS_OUTPUT_SELECTION,
      pendingReconnect, acceptReconnect, dismissReconnect,
    }}>
      {children}
      {/* Elementos <audio> ocultos, uno por peer remoto — viven en la raíz del árbol
          (no dentro del panel condicional de ChatWidget) para sobrevivir intactos
          a que el panel de chat se cierre o el usuario navegue a otra ruta. */}
      {[...remoteStreams.entries()].map(([socketId, stream]) => (
        <audio
          key={socketId}
          autoPlay
          style={{ display: 'none' }}
          ref={el => {
            if (!el) { audioElsRef.current.delete(socketId); return }
            audioElsRef.current.set(socketId, el)
            if (el.srcObject !== stream) el.srcObject = stream
            if (SUPPORTS_OUTPUT_SELECTION && outputDeviceId) el.setSinkId?.(outputDeviceId).catch(() => {})
          }}
        />
      ))}
    </VoiceCallContext.Provider>
  )
}

export const useVoiceCall = () => useContext(VoiceCallContext)
