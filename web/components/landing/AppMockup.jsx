/**
 * Maqueta de la app para el hero, cuando no hay video de demo cargado en
 * SuperAdmin → Landing. Copiado tal cual del AppMockup de la SPA: es markup puro sin
 * estado, así que acá queda como server component (cero JavaScript en el cliente).
 */
export default function AppMockup() {
  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-gray-300 border border-gray-200 text-left select-none">
      {/* Browser chrome */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-3">
          <div className="bg-white border border-gray-200 rounded-md px-3 py-1 text-xs text-gray-400 max-w-xs">
            miagencia.blisstracker.app
          </div>
        </div>
      </div>

      {/* App shell */}
      <div className="bg-gray-50 flex" style={{ minHeight: 320 }}>
        {/* Sidebar */}
        <div className="w-44 bg-white border-r border-gray-100 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-5 px-1">
            <img src="/blisstracker_logo.svg" alt="" width={24} height={24} className="w-6 h-6" />
            <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
          </div>
          {[true, false, false, false, false].map((active, i) => (
            <div
              key={i}
              className={`h-8 rounded-lg mb-1 flex items-center px-2 gap-2 ${active ? 'bg-primary-50' : ''}`}
            >
              <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${active ? 'bg-primary-400' : 'bg-gray-200'}`} />
              <div className={`h-2 rounded-full ${active ? 'w-14 bg-primary-300' : 'w-12 bg-gray-200'}`} />
            </div>
          ))}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="h-2 w-10 bg-gray-200 rounded-full mb-2 px-2" />
            {[false, false, false].map((_, i) => (
              <div key={i} className="h-8 rounded-lg mb-1 flex items-center px-2 gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0 bg-gray-100" />
                <div className="h-2 rounded-full w-12 bg-gray-100" />
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 overflow-hidden">
          {/* AI Insight card */}
          <div className="bg-gradient-to-r from-primary-50 to-orange-50 border border-primary-200 rounded-xl p-3 mb-4 flex gap-3">
            <div className="text-xl flex-shrink-0">🤖</div>
            <div className="flex-1 min-w-0">
              <div className="h-2.5 w-28 bg-primary-300 rounded-full mb-2" />
              <div className="h-2 w-full bg-primary-200/70 rounded-full mb-1.5" />
              <div className="h-2 w-4/5 bg-primary-200/70 rounded-full" />
            </div>
          </div>

          {/* Tasks section */}
          <div className="h-2 w-24 bg-gray-200 rounded-full mb-3" />
          {[
            { dot: 'bg-primary-500', label: 'En progreso', w: 'w-48' },
            { dot: 'bg-green-400',   label: 'Completada',  w: 'w-40' },
            { dot: 'bg-gray-300',    label: 'Pendiente',   w: 'w-52' },
            { dot: 'bg-gray-300',    label: 'Pendiente',   w: 'w-36' },
            { dot: 'bg-red-400',     label: 'Bloqueada',   w: 'w-44' },
          ].map((task, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2.5 mb-1.5 shadow-sm"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.dot}`} />
              <div className={`h-2 rounded-full bg-gray-200 flex-1 max-w-xs ${task.w}`} />
              <div className="text-xs text-gray-300 flex-shrink-0 hidden sm:block">{task.label}</div>
              <div className="ml-auto flex gap-1">
                <div className="w-4 h-4 rounded bg-gray-100" />
                <div className="w-4 h-4 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>

        {/* Right panel (visible on wider screens) */}
        <div className="w-52 bg-white border-l border-gray-100 p-3 hidden lg:block flex-shrink-0">
          <div className="h-2.5 w-24 bg-gray-200 rounded-full mb-4" />
          {[70, 45, 85, 55].map((pct, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <div className="h-2 w-16 bg-gray-100 rounded-full" />
                <div className="h-2 w-6 bg-gray-100 rounded-full" />
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="h-2 w-20 bg-gray-200 rounded-full mb-3" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex-shrink-0" />
                <div>
                  <div className="h-1.5 w-16 bg-gray-100 rounded-full mb-1" />
                  <div className="h-1.5 w-10 bg-gray-100 rounded-full" />
                </div>
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
