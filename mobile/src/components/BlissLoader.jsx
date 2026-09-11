import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, G, Path } from 'react-native-svg'
import { BLISS_PATHS } from '../lib/blissLogoPaths'

// Réplica exacta (mismos paths/gradientes/keyframes) del loader animado de
// BlissTracker en la web (frontend/public/logo-loading.svg, componente
// LoadingSpinner.jsx) — 4 facetas hexagonales que rotan 360° en 1.8s con un
// "dip" de escala al 88% a mitad de camino (mismo efecto rotate+pulso que en
// CSS, portado con Animated de React Native ya que react-native-svg no
// interpreta <style>/@keyframes embebidos en un SVG importado como imagen).
const PATHS = BLISS_PATHS

const AnimatedG = Animated.createAnimatedComponent(G)

export default function BlissLoader({ size = 64 }) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
        useNativeDriver: false, // anima un prop `transform` string de SVG, no soportado por el native driver
      })
    )
    loop.start()
    return () => loop.stop()
  }, [progress])

  // Mismos 3 keyframes que `.bliss-spin` en CSS: 0%/50%/100% → rotate
  // 0/180/360deg, scale 1/0.88/1. El easing ya aplicado al `progress` (arriba)
  // reproduce la misma curva de aceleración que el cubic-bezier original.
  //
  // `rotation`/`scaleX`/`scaleY`/`originX`/`originY` (props numéricas propias
  // de react-native-svg), NO el prop `transform` con un string SVG armado a
  // mano: con la Nueva Arquitectura (Fabric, default desde SDK 53) el
  // `transform` de <G> espera un array de matriz numérica del lado nativo —
  // pasarle un string interpolado crashea la app entera al montar
  // (`ClassCastException: String cannot be cast to ReadableArray` en
  // RNSVGGroupManagerDelegate, visto en logcat real en un dispositivo).
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 360] })
  const scale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.88, 1] })

  return (
    <Svg width={size} height={size} viewBox="0 0 1080 1080">
      <Defs>
        {PATHS.map((p, i) => (
          <LinearGradient key={i} id={`bliss-g${i}`} x1={p.grad[0]} y1={p.grad[1]} x2={p.grad[2]} y2={p.grad[3]} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#f39200" />
            <Stop offset="1" stopColor="#f35a00" />
          </LinearGradient>
        ))}
      </Defs>
      <AnimatedG rotation={rotate} scaleX={scale} scaleY={scale} originX={540} originY={540}>
        {PATHS.map((p, i) => (
          <Path key={i} fill={`url(#bliss-g${i})`} d={p.d} />
        ))}
      </AnimatedG>
    </Svg>
  )
}
