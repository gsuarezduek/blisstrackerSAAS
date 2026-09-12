import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { connectSocket } from '../lib/socket'

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
// Fuera de alcance a propósito (ver plan): sin TURN server (solo STUN público —
// alcanza para redes normales, puede fallar en NATs corporativos restrictivos),
// sin reconexión transparente de peers (una reconexión de socket simplemente
// re-hace voice:join y reconstruye todo desde cero).
export function VoiceCallProvider({ children }) {
  const { user } = useAuth()
  const [activeCall, setActiveCall] = useState(null) // { channelId, channelSlug, channelName, muted, participants: [{socketId,userId,name,muted}] } | null
  const [voicePresence, setVoicePresence] = useState(new Map()) // channelId -> [{userId,name}], independiente de estar en la llamada
  const [remoteStreams, setRemoteStreams] = useState(new Map()) // socketId -> MediaStream, para los <audio> ocultos

  const activeCallRef = useRef(null)
  const peersRef = useRef(new Map()) // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null)
  const pendingIceRef = useRef(new Map()) // socketId -> RTCIceCandidate[] buffereados hasta tener remoteDescription

  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])

  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId)
    if (pc) { pc.close(); peersRef.current.delete(socketId) }
    pendingIceRef.current.delete(socketId)
    setRemoteStreams(prev => {
      if (!prev.has(socketId)) return prev
      const next = new Map(prev)
      next.delete(socketId)
      return next
    })
  }, [])

  const cleanupCall = useCallback(() => {
    for (const socketId of peersRef.current.keys()) cleanupPeer(socketId)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setActiveCall(null)
  }, [cleanupPeer])

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
      setRemoteStreams(prev => {
        const next = new Map(prev)
        next.set(socketId, e.streams[0])
        return next
      })
    }
    return pc
  }, [])

  const joinCall = useCallback(async (channel) => {
    if (activeCallRef.current?.channelId === channel.id) return
    if (activeCallRef.current) cleanupCall()

    const socket = connectSocket()
    if (!socket) return

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert('No pudimos acceder a tu micrófono. Revisá los permisos del navegador.')
      return
    }

    setActiveCall({ channelId: channel.id, channelSlug: channel.slug, channelName: channel.name, muted: false, participants: [] })
    socket.emit('voice:join', channel.id)
  }, [cleanupCall])

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
    function onConnect() {
      const call = activeCallRef.current
      if (call) socket.emit('voice:join', call.channelId)
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
  }, [user?.id, getOrCreatePeer, cleanupPeer])

  return (
    <VoiceCallContext.Provider value={{ activeCall, voicePresence, joinCall, leaveCall, toggleMute }}>
      {children}
      {/* Elementos <audio> ocultos, uno por peer remoto — viven en la raíz del árbol
          (no dentro del panel condicional de ChatWidget) para sobrevivir intactos
          a que el panel de chat se cierre o el usuario navegue a otra ruta. */}
      {[...remoteStreams.entries()].map(([socketId, stream]) => (
        <audio
          key={socketId}
          autoPlay
          style={{ display: 'none' }}
          ref={el => { if (el && el.srcObject !== stream) el.srcObject = stream }}
        />
      ))}
    </VoiceCallContext.Provider>
  )
}

export const useVoiceCall = () => useContext(VoiceCallContext)
