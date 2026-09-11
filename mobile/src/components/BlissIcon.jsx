import Svg, { Defs, LinearGradient, Stop, G, Path } from 'react-native-svg'
import { BLISS_PATHS } from '../lib/blissLogoPaths'

// Isotipo estático de BlissTracker (mismos paths que BlissLoader, sin
// animación) — para headers/cards donde no corresponde el spinner de carga.
export default function BlissIcon({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1080 1080">
      <Defs>
        {BLISS_PATHS.map((p, i) => (
          <LinearGradient key={i} id={`bliss-icon-g${i}`} x1={p.grad[0]} y1={p.grad[1]} x2={p.grad[2]} y2={p.grad[3]} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#f39200" />
            <Stop offset="1" stopColor="#f35a00" />
          </LinearGradient>
        ))}
      </Defs>
      <G>
        {BLISS_PATHS.map((p, i) => (
          <Path key={i} fill={`url(#bliss-icon-g${i})`} d={p.d} />
        ))}
      </G>
    </Svg>
  )
}
