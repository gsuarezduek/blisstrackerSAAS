

export const PALETTE = [
  { hex: '#FFAE5C', name: 'Orange Light' },
  { hex: '#FF8C2E', name: 'Orange Primary' },
  { hex: '#E67A1F', name: 'Orange Deep' },
  { hex: '#8A4E1C', name: 'Amber Dark' },
  { hex: '#3B2618', name: 'Brown Text' },
  { hex: '#140E0A', name: 'Background Dark', border: true },
  { hex: '#FFF4E6', name: 'Cream Text', border: true },
  { hex: '#FFFFFF', name: 'Check / Highlight', border: true },
]

export function LogoPreviewRow({ dark, sizes, src, label }) {
  return (
    <div className={`rounded-xl p-5 flex items-center gap-6 flex-wrap ${dark ? 'bg-[#140E0A]' : 'bg-[#F5EFE6]'}`}>
      {sizes.map(s => (
        <div key={s} className="flex flex-col items-center gap-2">
          <img src={src} width={s} height={s} alt={`${label} ${s}px`} className="block" />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-[#B8A896]' : 'text-[#7A6B5E]'}`}>{s} px</span>
        </div>
      ))}
    </div>
  )
}

export function BrandNote({ children, green }) {
  return (
    <div className={`border-l-2 pl-4 py-2 rounded-r-lg text-xs leading-relaxed ${
      green
        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
        : 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300'
    }`}>
      {children}
    </div>
  )
}

export function BrandCard({ title, subtitle, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function CodeBlock({ children }) {
  return (
    <pre className="bg-[#1F1812] text-[#E8DFD3] rounded-xl p-5 overflow-x-auto text-xs leading-relaxed font-mono max-h-72 overflow-y-auto">
      {children}
    </pre>
  )
}

// ─── Anuncios ─────────────────────────────────────────────────────────────────

export function SectionBrandManual() {
  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manual de Marca</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sistema de logo completo: variantes, tipografía, monocromas, design tokens y narrativa.
        </p>
      </div>

      {/* ── Variante A ── */}
      <BrandCard
        title="Variante A — Minimalista"
        subtitle="Hexágono único con check grueso. Fondo transparente — funciona sobre cualquier superficie."
      >
        <LogoPreviewRow src="/blisstracker_logo.svg" sizes={[16, 32, 64, 128, 256]} label="Variante A" />
        <LogoPreviewRow src="/blisstracker_logo.svg" sizes={[16, 32, 64, 128, 256]} label="Variante A" dark />
        <BrandNote>
          <strong>Por qué funciona:</strong> a 16 px el check sigue visible porque el trazo fue engrosado a 44 y se mantiene la silueta hexagonal reconocible. Ideal para favicon, badge de notificación y app icon. Si necesitás un "contenedor" para iOS/Android, la plataforma lo agrega automáticamente.
        </BrandNote>
      </BrandCard>

      {/* ── Variante B ── */}
      <BrandCard
        title="Variante B — Panal Sutil"
        subtitle="Panal completo con fondo transparente. Hexágonos exteriores en ámbar oscuro que funcionan sobre fondos claros y oscuros."
      >
        <LogoPreviewRow src="/logo-honeycomb.svg" sizes={[32, 64, 128, 256, 384]} label="Variante B" />
        <LogoPreviewRow src="/logo-honeycomb.svg" sizes={[32, 64, 128, 256, 384]} label="Variante B" dark />
        <BrandNote>
          <strong>Nota:</strong> no usar a menos de 48 px — a ese tamaño los detalles del panal exterior se pierden; usá la Variante A. Los hexágonos exteriores usan <code>#C46F29 → #8A4E1C</code> con suficiente contraste en claro y oscuro.
        </BrandNote>
      </BrandCard>

      {/* ── Variante B Loading ── */}
      <BrandCard
        title="Variante B — Loading Animation"
        subtitle="Los hexágonos exteriores se iluminan en secuencia rotativa para indicar que la app está procesando."
      >
        <div className="rounded-xl p-6 bg-[#F5EFE6] flex items-center gap-10 flex-wrap">
          {[['64', 'spinner inline'], ['128', 'loading modal'], ['192', 'splash screen']].map(([s, lbl]) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <img src="/logo-loading.svg" width={+s} height={+s} alt={`Loading ${s}px`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7A6B5E]">{s} px · {lbl}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-6 bg-[#140E0A] flex items-center gap-10 flex-wrap">
          {[['64', 'spinner inline'], ['128', 'loading modal'], ['192', 'splash screen']].map(([s, lbl]) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <img src="/logo-loading.svg" width={+s} height={+s} alt={`Loading ${s}px`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#B8A896]">{s} px · {lbl}</span>
            </div>
          ))}
        </div>

        {/* En contexto */}
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 pt-2">En contexto</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Phone splash */}
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg,#1F1812 0%,#140E0A 100%)', aspectRatio: '9/16', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px' }}>
              <img src="/logo-loading.svg" width={80} height={80} alt="Loading" />
              <span style={{ color: '#FFF4E6', fontWeight: 700, fontSize: 16, letterSpacing: '-0.5px' }}>BlissTracker</span>
              <span style={{ color: '#B8A896', fontSize: 12 }}>Sincronizando tus tareas…</span>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Splash / carga inicial</p>
          </div>
          {/* Card inline */}
          <div className="flex flex-col gap-2 justify-center">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">Tareas de hoy</p>
              <div className="flex items-center gap-3">
                <img src="/logo-loading.svg" width={36} height={36} alt="Cargando" />
                <span className="text-sm text-gray-400 dark:text-gray-500">Cargando tus tareas…</span>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Spinner inline en interfaz</p>
          </div>
          {/* Button */}
          <div className="flex flex-col gap-2 justify-center">
            <div className="flex justify-center">
              <button disabled className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: '#E67A1F', boxShadow: '0 4px 12px rgba(230,122,31,0.3)', cursor: 'default' }}>
                <img src="/logo-loading.svg" width={18} height={18} alt="" />
                Guardando cambios
              </button>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Estado de botón activo</p>
          </div>
        </div>

        <BrandNote green>
          <strong>Archivo:</strong> <code>logo-loading.svg</code> — un único archivo autónomo con CSS inline. Funciona en &lt;img&gt;, &lt;object&gt;, inline SVG y como background-image. No requiere JavaScript.
        </BrandNote>
        <BrandNote>
          <strong>Especificaciones:</strong> ciclo de 1.6 s, easing <code>cubic-bezier(0.4, 0, 0.2, 1)</code>, delay incremental de 130 ms. Respeta <code>prefers-reduced-motion</code> — los usuarios con esa preferencia verán los hexágonos estáticos al 50% de opacidad.
        </BrandNote>
      </BrandCard>

      {/* ── Variante C ── */}
      <BrandCard
        title="Variante C — Lockup Horizontal (Isotipo + Wordmark)"
        subtitle='Para headers, material impreso, firmas de email y landing page. Incluye versión clara y oscura.'
      >
        <div className="rounded-xl p-8 bg-[#F5EFE6] flex items-center justify-center">
          <img src="/logo-lockup.svg" alt="BlissTracker lockup versión clara" className="h-14 w-auto" />
        </div>
        <div className="rounded-xl p-8 bg-[#140E0A] flex items-center justify-center">
          <img src="/logo-lockup-dark.svg" alt="BlissTracker lockup versión oscura" className="h-14 w-auto" />
        </div>
        <BrandNote>
          "Bliss" en bold y naranja da énfasis, "Tracker" en regular actúa como descriptor funcional. El isotipo y el wordmark comparten la misma altura visual. El espacio entre mark y texto equivale al ancho de una "o" — patrón clásico de lockup.
        </BrandNote>
      </BrandCard>

      {/* ── Tipografía ── */}
      <BrandCard
        title="Tipografía"
        subtitle="Fuente principal del wordmark en la Variante C. Inter es una sans-serif optimizada para interfaces."
      >
        <div className="rounded-xl p-4 bg-[#F5EFE6] flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7A6B5E]">Font stack:</span>
          <code className="text-sm text-[#2A1F17]">'Inter', 'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif</code>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="p-6 pb-4" style={{ fontFamily: "'Inter','SF Pro Display','Segoe UI',system-ui,sans-serif", fontSize: 64, fontWeight: 700, color: '#E67A1F', letterSpacing: -2, lineHeight: 1 }}>Bliss</div>
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900/50 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Peso</span><span>700 · Bold</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Uso</span><span>Primer tramo del wordmark</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Color</span><span><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{background:'#E67A1F'}}/>&#x200B;#E67A1F</span></div>
            </div>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="p-6 pb-4" style={{ fontFamily: "'Inter','SF Pro Display','Segoe UI',system-ui,sans-serif", fontSize: 64, fontWeight: 400, color: '#3B2618', letterSpacing: -2, lineHeight: 1 }}>Tracker</div>
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900/50 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Peso</span><span>400 · Regular</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Uso</span><span>Descriptor funcional</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Color</span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1 border border-gray-200" style={{background:'#3B2618'}}/>&#x200B;#3B2618 claro &nbsp;·&nbsp;
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1 border border-gray-400" style={{background:'#FFF4E6'}}/>&#x200B;#FFF4E6 oscuro
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['Propiedad', 'Valor', 'Notas'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {[
                ['font-family', 'Inter', 'Fallback a SF Pro Display, Segoe UI, system-ui'],
                ['font-size', '240 (viewBox)', 'Cap-height ≈ altura del hexágono (187 px)'],
                ['font-weight "Bliss"', '700', 'Énfasis principal de la marca'],
                ['font-weight "Tracker"', '400', 'Descriptor secundario, menos peso visual'],
                ['letter-spacing', '-6', '≈ -0.025em, tight spacing para lockup compacto'],
                ['Baseline', 'y = 253.53', 'Alineada al borde inferior del hexágono'],
              ].map(([prop, val, note]) => (
                <tr key={prop} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-mono">{prop}</td>
                  <td className="px-4 py-2.5"><code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{val}</code></td>
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BrandNote>
          <strong>Por qué Inter:</strong> diseñada específicamente para pantallas, tiene un x-height alto, formas geométricas limpias que combinan bien con el hexágono, y es gratuita (SIL Open Font License). Disponible en <a href="https://fonts.google.com/specimen/Inter" target="_blank" rel="noreferrer" className="underline">Google Fonts</a>.
        </BrandNote>
        <BrandNote green>
          <strong>Alternativas:</strong> SF Pro Display en Apple, Segoe UI en Windows, Roboto/system-ui en Android. Todas comparten métricas similares y mantendrán el lockup equilibrado.
        </BrandNote>
      </BrandCard>

      {/* ── Paleta ── */}
      <BrandCard
        title="Paleta de colores"
        subtitle="Tokens coherentes entre las tres variantes."
      >
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {PALETTE.map(({ hex, name, border }) => (
            <div key={hex} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-12 h-12 rounded-xl ${border ? 'border border-gray-200 dark:border-gray-600' : ''}`}
                style={{ background: hex }}
              />
              <code className="text-[10px] text-gray-500 dark:text-gray-400">{hex}</code>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight">{name}</span>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Narrativa ── */}
      <BrandCard
        title="Narrativa del Logo"
        subtitle="La historia que cuenta cada elemento — para que la marca se explique sola."
      >
        <BrandNote>
          <strong>BlissTracker</strong> ayuda a las personas a gestionar sus tareas sin perder el foco. El logo traduce esa idea en tres símbolos: un <strong>hexágono</strong> (foco), un <strong>check</strong> (logro) y un <strong>panal</strong> (sistema). Juntos comunican claridad, progreso visible y un entorno que se organiza a tu alrededor.
        </BrandNote>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: 'Hexágono', body: 'Es la forma más eficiente de la naturaleza para cubrir espacio sin desperdiciar nada — igual que una tarea bien definida. El flat-top refuerza estabilidad; no es una forma caprichosa, es una estructura.' },
            { title: 'Check', body: 'El símbolo universal del "hecho". Lo dejamos ligeramente grueso (stroke 44) y con caps redondeados para que se sienta amable, no burocrático. Es la recompensa visual que todo usuario persigue.' },
            { title: 'Panal (Variante B)', body: 'Cada tarea no vive sola — pertenece a un sistema mayor. Los seis hexágonos exteriores representan las otras piezas del día; el central es la que estás enfocando ahora. El loader anima esa idea.' },
            { title: 'Gradiente naranja', body: 'Del #FFAE5C al #E67A1F: un naranja cálido, no agresivo, que sugiere energía y optimismo. La intensidad crece hacia la base del hexágono, dando peso y tracción visual.' },
            { title: 'Wordmark bi-peso', body: '"Bliss" en bold, "Tracker" en regular. El nombre se acentúa en el lado emocional; "tracker" queda como descriptor funcional. Sin espacio entre palabras: una sola marca, una sola promesa.' },
            { title: 'Por qué funciona en 16 px', body: 'El hexágono + check es legible hasta 16 px porque no depende del color para funcionar: la silueta sola ya comunica. Es la prueba de un buen isotipo — sobrevive a la compresión extrema.' },
          ].map(({ title, body }) => (
            <div key={title} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Zona de exclusión ── */}
      <BrandCard
        title="Zona de Exclusión (Clear Space)"
        subtitle="El espacio mínimo que debe rodear al logo para que respire."
      >
        <BrandNote>
          <strong>Regla:</strong> deja un margen libre igual a <code>x = 0.25 × altura del isotipo</code> en cada uno de los cuatro lados. Ningún otro elemento puede invadir esa zona. El valor es el <strong>mínimo</strong>, no el objetivo.
        </BrandNote>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Tamaños mínimos</p>
        <div className="flex items-end gap-6 flex-wrap bg-[#F5EFE6] rounded-xl p-5">
          {[
            { src: '/blisstracker_logo.svg', w: 24, h: 24, label: 'Isotipo · Digital', sub: '24 × 24 px' },
            { src: '/blisstracker_logo.svg', w: 40, h: 40, label: 'Isotipo · Cómodo', sub: '40 × 40 px' },
            { src: '/logo-lockup.svg', w: null, h: 36, label: 'Lockup · Digital', sub: 'ancho ≥ 120 px' },
            { src: '/logo-lockup.svg', w: null, h: 52, label: 'Lockup · Impreso', sub: 'ancho ≥ 25 mm' },
          ].map(({ src, w, h, label, sub }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <img src={src} width={w ?? undefined} height={h} style={w ? {} : { height: h, width: 'auto' }} alt={label} />
              <span className="text-[10px] font-semibold text-[#7A6B5E]">{label}</span>
              <span className="text-[10px] text-[#7A6B5E] opacity-70">{sub}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">Debajo de estos tamaños el check empieza a romperse. Si necesitás ir más chico, usá solo el hexágono en silueta sólida.</p>
      </BrandCard>

      {/* ── Don'ts ── */}
      <BrandCard
        title="Usos Incorrectos (Don'ts)"
        subtitle="Cosas que rompen la marca. Evitalas incluso cuando 'quedan bien'."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'No estires ni comprimas', sub: 'Mantené siempre las proporciones originales', style: { transform: 'scaleX(1.5)' } },
            { label: 'No rotes el isotipo', sub: 'El flat-top siempre horizontal', style: { transform: 'rotate(30deg)' } },
            { label: 'No agregues sombras', sub: 'El gradiente ya aporta dimensión', style: { filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.6))' } },
            { label: 'No uses bajo contraste', sub: 'Elegí la variante apropiada al fondo', bg: '#E67A1F' },
          ].map(({ label, sub, style, bg }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className={`rounded-xl flex items-center justify-center p-5 h-24 relative overflow-hidden ${!bg ? 'bg-[#F5EFE6]' : ''}`} style={bg ? { background: bg } : {}}>
                <div className="relative" style={{ border: '2px dashed #E67A1F', borderRadius: 8, padding: 6 }}>
                  <img src="/blisstracker_logo.svg" width={40} height={40} alt="" style={style || {}} />
                  <span className="absolute -top-2 -right-2 text-red-500 text-lg font-bold leading-none">✕</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'No agregues contornos', sub: 'El logo tiene forma propia', style: { outline: '3px solid #E67A1F', outlineOffset: 4, borderRadius: 4 } },
            { label: 'No recompongás el lockup', sub: 'Usá siempre la Variante C oficial' },
          ].map(({ label, sub, style }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="rounded-xl flex items-center justify-center p-5 h-24 bg-[#F5EFE6] relative overflow-hidden">
                <div className="relative" style={{ border: '2px dashed #E67A1F', borderRadius: 8, padding: 6 }}>
                  <img src="/blisstracker_logo.svg" width={40} height={40} alt="" style={style || {}} />
                  <span className="absolute -top-2 -right-2 text-red-500 text-lg font-bold leading-none">✕</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Monocromas ── */}
      <BrandCard
        title="Variantes Monocromas"
        subtitle="Para impresión a una tinta, grabados, merchandising o interfaces con restricciones de color."
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#F5EFE6] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-black.svg" className="h-16 w-auto" alt="Negro + check blanco" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Negro + check blanco</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#140E0A] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-white.svg" className="h-16 w-auto" alt="Blanco + check negro" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Blanco + check negro</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#F5EFE6] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-orange.svg" className="h-16 w-auto" alt="Naranja + check blanco" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Naranja + check blanco</p>
          </div>
        </div>
        <BrandNote>
          <strong>Cuándo usar monocromas:</strong> merchandising a dos tintas, grabados, stamps, headers de documentos formales, o cualquier contexto donde el gradiente naranja no esté disponible. Cada versión está pensada para un tipo de fondo distinto.
        </BrandNote>
      </BrandCard>

      {/* ── Design Tokens ── */}
      <BrandCard
        title="Design Tokens"
        subtitle="Una sola fuente de verdad para colores, tipografía y espaciado — consumible desde código."
      >
        <BrandNote>
          <strong>Por qué importa:</strong> cuando la app crezca, vas a tener decenas de lugares donde aparece el naranja de marca. Con tokens, cambiás <code>--bt-color-brand-primary</code> una vez y todo se actualiza. Los tokens están disponibles en CSS (para el frontend) y en JSON (para Figma / Style Dictionary).
        </BrandNote>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="/brand-tokens.css" download className="flex items-center gap-3 bg-[#F5EFE6] dark:bg-gray-700/50 rounded-xl px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">CSS</span>
            <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono">tokens.css</p><p className="text-xs text-gray-400">CSS Custom Properties · importable</p></div>
          </a>
          <a href="/brand-tokens.json" download className="flex items-center gap-3 bg-[#F5EFE6] dark:bg-gray-700/50 rounded-xl px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">JSON</span>
            <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono">tokens.json</p><p className="text-xs text-gray-400">Formato DTCG · para Figma / Style Dictionary</p></div>
          </a>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Ejemplo — CSS</p>
        <CodeBlock>{`/* Importá una vez en tu hoja principal */
@import "./tokens/tokens.css";

/* Usalos en cualquier componente */
.btn-primary {
  background:    var(--bt-color-brand-primary);
  color:         var(--bt-color-white);
  font-family:   var(--bt-font-family-base);
  font-weight:   var(--bt-font-weight-semibold);
  padding:       var(--bt-space-3) var(--bt-space-6);
  border-radius: var(--bt-radius-lg);
  box-shadow:    var(--bt-shadow-md);
  transition:    all var(--bt-duration-base) var(--bt-easing-standard);
}
.btn-primary:hover {
  background: var(--bt-color-orange-400);
  box-shadow: var(--bt-shadow-glow-md);
}`}</CodeBlock>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Categorías incluidas</p>
        <div className="flex flex-wrap gap-2">
          {['--bt-color-*', '--bt-font-*', '--bt-space-*', '--bt-radius-*', '--bt-shadow-*', '--bt-duration-*', '--bt-easing-*', '--bt-z-*', '--bt-breakpoint-*'].map(t => (
            <code key={t} className="text-xs bg-[#F5EFE6] dark:bg-gray-700 text-[#2A1F17] dark:text-gray-300 px-3 py-1.5 rounded-lg">{t}</code>
          ))}
        </div>
        <BrandNote green>
          <strong>Dark mode incluido:</strong> el archivo CSS activa automáticamente los colores oscuros cuando el sistema está en dark (<code>@media (prefers-color-scheme: dark)</code>) o si ponés <code>data-theme="dark"</code> en <code>&lt;html&gt;</code>.
        </BrandNote>
      </BrandCard>

      {/* ── Guía de uso ── */}
      <BrandCard title="Recomendación de Uso por Variante">
        <div className="space-y-2">
          {[
            { variant: 'Variante A', uses: 'App icon, favicon, badges, redes sociales (avatar), usos ≤ 128 px', icon: '/blisstracker_logo.svg', square: true },
            { variant: 'Variante B', uses: 'Splash screen, about page, merchandising, usos ≥ 256 px con espacio narrativo', icon: '/logo-honeycomb.svg', square: true },
            { variant: 'Variante B (loading)', uses: 'Estados de carga, skeletons, transiciones entre pantallas', icon: '/logo-loading.svg', square: true },
            { variant: 'Variante C', uses: 'Headers web, documentos, firmas de email, material impreso, lockup horizontal', icon: '/logo-lockup.svg', square: false },
            { variant: 'Monocromas', uses: 'Merchandising a dos tintas, headers de documentos, contextos sin gradiente', icon: '/logo-mono-black.svg', square: true },
          ].map(row => (
            <div key={row.variant} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <img src={row.icon} className={row.square ? 'w-9 h-9' : 'h-6 w-auto'} alt={row.variant} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.variant}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{row.uses}</p>
              </div>
            </div>
          ))}
        </div>
      </BrandCard>
    </div>
  )
}

// ─── Section: Avatares ────────────────────────────────────────────────────────

