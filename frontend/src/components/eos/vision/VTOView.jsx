import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import api from '../../../api/client'
import { isHtml, currentQuarterStr, quarterLabel, formatDateLabel } from './visionHelpers'
import { printVTO } from './printVTO'

// ─── VTO View ────────────────────────────────────────────────────────────────

function VTOBox({ title, accent, children, className = '' }) {
  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ${className}`}>
      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${accent}`}>
        {title}
      </div>
      <div className="px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 min-h-[60px]">
        {children}
      </div>
    </div>
  )
}

function VTOList({ items, empty = 'No definido' }) {
  if (!items || items.length === 0) return <span className="text-gray-400 italic text-xs">{empty}</span>
  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          <span className="text-gray-400 shrink-0 mt-0.5">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function CoreValuesVTOList({ items, empty = 'No definido' }) {
  if (!items || items.length === 0) return <span className="text-gray-400 italic text-xs">{empty}</span>
  return (
    <ul className="space-y-1.5">
      {items.map((v, i) => {
        const name = typeof v === 'string' ? v : v?.name ?? ''
        const desc = typeof v === 'object' && v?.description ? v.description : ''
        return (
          <li key={i} className="text-xs leading-snug">
            <div className="flex items-start gap-1.5">
              <span className="text-gray-400 shrink-0 mt-0.5">·</span>
              <span className="font-semibold">{name}</span>
            </div>
            {desc && <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 ml-3">{desc}</p>}
          </li>
        )
      })}
    </ul>
  )
}

function VTOText({ value, empty = 'No definido' }) {
  if (!value?.trim()) return <span className="text-gray-400 italic text-xs">{empty}</span>
  if (isHtml(value)) {
    return (
      <div
        className="situation-content text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
      />
    )
  }
  return <p className="text-xs leading-relaxed whitespace-pre-wrap">{value}</p>
}

export default function VTOView({ data, workspaceName, onClose }) {
  const [rocks,  setRocks]   = useState([])
  const [issues, setIssues]  = useState([])
  const [members, setMembers] = useState([])
  const quarter = currentQuarterStr()

  useEffect(() => {
    Promise.all([
      api.get(`/eos/traction/rocks?quarter=${quarter}`),
      api.get('/eos/issues'),
    ]).then(([rocksRes, issuesRes]) => {
      setRocks(rocksRes.data.rocks)
      setMembers(rocksRes.data.members)
      setIssues(issuesRes.data.issues.filter(i => i.status === 'open' && i.type === 'weekly'))
    }).catch(() => {})
  }, [quarter])

  const accentBlue = 'bg-blue-600 text-white'
  const accentGray = 'bg-gray-700 text-white'

  function ownerName(ownerId) {
    const m = members.find(m => m.id === ownerId)
    return m ? m.name.split(' ')[0] : ''
  }

  const activeRocks = rocks.filter(r => r.status !== 'complete')

  // ── Página 1: Tracción ── (Plan a 1 año · Rocas · Asuntos)
  const traccionPage = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

      {/* Plan a 1 Año */}
      <VTOBox title="Plan a 1 Año" accent={accentBlue}>
        <div className="space-y-1.5">
          {(data?.oneYearDate || data?.oneYearRevenue || data?.oneYearProfit) && (
            <div className="flex flex-wrap gap-3 text-xs pb-1 border-b border-gray-100 dark:border-gray-700">
              {data?.oneYearDate    && <span><span className="text-gray-400">Fecha de realización:</span> {formatDateLabel(data.oneYearDate)}</span>}
              {data?.oneYearRevenue && <span><span className="text-gray-400">Ingresos:</span> {data.oneYearRevenue}</span>}
              {data?.oneYearProfit  && <span><span className="text-gray-400">Rentabilidad:</span> {data.oneYearProfit}</span>}
            </div>
          )}
          <VTOList items={data?.oneYearGoals} empty="Sin metas anuales" />
        </div>
      </VTOBox>

      {/* Rocas */}
      <VTOBox title={`Rocas · ${quarterLabel(quarter)}`} accent={accentGray}>
        {activeRocks.length === 0 ? (
          <span className="text-gray-400 italic text-xs">Sin rocas para este trimestre</span>
        ) : (
          <ul className="space-y-1">
            {activeRocks.map(rock => (
              <li key={rock.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  rock.status === 'on_track'  ? 'bg-green-500' :
                  rock.status === 'off_track' ? 'bg-red-500'   : 'bg-gray-400'
                }`} />
                <span className="flex-1">{rock.title}</span>
                {rock.ownerId && <span className="text-gray-400">{ownerName(rock.ownerId)}</span>}
              </li>
            ))}
          </ul>
        )}
      </VTOBox>

      {/* Asuntos */}
      <VTOBox title="Asuntos" accent={accentGray}>
        {issues.length === 0 ? (
          <span className="text-gray-400 italic text-xs">Sin issues abiertos</span>
        ) : (
          <ul className="space-y-0.5">
            {issues.slice(0, 12).map(issue => (
              <li key={issue.id} className="flex items-start gap-1.5 text-xs">
                <span className={`shrink-0 mt-0.5 text-[8px] font-bold ${
                  issue.priority === 'high' ? 'text-red-500' :
                  issue.priority === 'medium' ? 'text-yellow-500' : 'text-gray-400'
                }`}>●</span>
                <span>{issue.title}</span>
              </li>
            ))}
            {issues.length > 12 && <li className="text-xs text-gray-400 pl-3">+{issues.length - 12} más</li>}
          </ul>
        )}
      </VTOBox>

    </div>
  )

  // ── Página 2: Visión ── (col izq 70%: Valores · Foco · 10 años · Marketing | col der 30%: Imagen a 3 años)
  const visionPage = (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-3">

      {/* Columna izquierda (70%) */}
      <div className="lg:col-span-7 space-y-3">

        {/* Valores Medulares */}
        <VTOBox title="Valores Medulares" accent={accentBlue}>
          <CoreValuesVTOList items={data?.coreValues} empty="Sin valores definidos" />
        </VTOBox>

        {/* Enfoque Medular (Foco) */}
        <VTOBox title="Enfoque Medular" accent={accentBlue}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Propósito</p>
              <VTOText value={data?.purpose} empty="Sin definir" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Nicho</p>
              <VTOText value={data?.niche} empty="Sin definir" />
            </div>
          </div>
        </VTOBox>

        {/* Meta a 10 Años */}
        <VTOBox title="Meta a 10 Años™" accent={accentGray}>
          <VTOText value={data?.tenYearTarget} empty="Sin meta a 10 años" />
        </VTOBox>

        {/* Estrategia de Marketing */}
        <VTOBox title="Estrategia de Marketing" accent={accentGray}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Cliente Ideal</p>
              <VTOText value={data?.marketingTarget} empty="Sin definir" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">3 Diferenciadores</p>
              <VTOList items={data?.marketingUniques} empty="Sin diferenciadores" />
            </div>
            {data?.marketingProcess && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Proceso Probado</p>
                <VTOText value={data.marketingProcess} />
              </div>
            )}
            {data?.marketingGuarantee && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Garantía</p>
                <VTOText value={data.marketingGuarantee} />
              </div>
            )}
          </div>
        </VTOBox>

      </div>

      {/* Columna derecha (30%) — Imagen a 3 años */}
      <div className="lg:col-span-3">
        <VTOBox title="Imagen a 3 Años™" accent={accentBlue} className="h-full">
          <div className="space-y-1.5">
            {(data?.threeYearRevenue || data?.threeYearProfit || data?.threeYearHeadcount) && (
              <div className="flex flex-col gap-0.5 text-xs pb-1.5 mb-1 border-b border-gray-100 dark:border-gray-700">
                {data?.threeYearRevenue   && <span><span className="text-gray-400">Ingresos:</span> {data.threeYearRevenue}</span>}
                {data?.threeYearProfit    && <span><span className="text-gray-400">Rentabilidad:</span> {data.threeYearProfit}</span>}
                {data?.threeYearHeadcount && <span><span className="text-gray-400">Equipo:</span> {data.threeYearHeadcount}</span>}
              </div>
            )}
            <VTOText value={data?.threeYearDescription} empty="Sin descripción" />
            {data?.threeYearGoals?.length > 0 && (
              <VTOList items={data.threeYearGoals} />
            )}
          </div>
        </VTOBox>
      </div>

    </div>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Vision/Traction Organizer™</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{workspaceName} · {new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => printVTO(data, workspaceName, rocks, members, issues, quarter)}
            title="Imprimir / Exportar PDF"
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H6Zm7-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ✏️ Editar
          </button>
        </div>
      </div>

      {/* Tracción arriba, Visión abajo — todo junto */}
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Tracción</h3>
          {traccionPage}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Visión</h3>
          {visionPage}
        </section>
      </div>
    </div>
  )
}
