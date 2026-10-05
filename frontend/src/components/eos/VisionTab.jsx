import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useWorkspace } from '../../context/WorkspaceContext'
import RichTextEditor from '../RichTextEditor'
import VTOView from './vision/VTOView'
import { HelpModal, SectionCard, SubField, InlineField, ItemsList } from './vision/VisionFormUI'
import { useDebouncedField, useDebouncedList } from './vision/useDebouncedField'
import {
  CoreValuesHelp, EnfoqueMedularHelp, TenYearHelp, MarketingHelp, ThreeYearHelp, OneYearHelp,
} from './vision/VisionHelpContent'
import CoreValuesSection from './vision/CoreValuesSection'

// ═══════════════════════════════════════════════════════════════════════════════
// VisionTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function VisionTab({ vtoMode = false, setVtoMode = () => {} }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [showHelp, setShowHelp] = useState(null)

  const { workspace } = useWorkspace()
  const workspaceName = workspace?.name || 'Mi Empresa'

  useEffect(() => {
    api.get('/eos')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function saveFields(fields) {
    const res = await api.patch('/eos', fields)
    setData(prev => ({ ...prev, ...res.data }))
    return res.data
  }

  // ── Valores Medulares
  const coreValues = useDebouncedList(data?.coreValues ?? [], 'coreValues', saveFields)

  // ── Enfoque Medular
  const purpose = useDebouncedField(data?.purpose ?? '', 'purpose', saveFields)
  const niche   = useDebouncedField(data?.niche   ?? '', 'niche',   saveFields)

  // ── Meta a 10 años
  const tenYearTarget = useDebouncedField(data?.tenYearTarget ?? '', 'tenYearTarget', saveFields)

  // ── Estrategia de Marketing
  const marketingTarget    = useDebouncedField(data?.marketingTarget    ?? '', 'marketingTarget',    saveFields)
  const marketingUniques   = useDebouncedList( data?.marketingUniques   ?? [], 'marketingUniques',   saveFields)
  const marketingProcess   = useDebouncedField(data?.marketingProcess   ?? '', 'marketingProcess',   saveFields)
  const marketingGuarantee = useDebouncedField(data?.marketingGuarantee ?? '', 'marketingGuarantee', saveFields)

  // ── Imagen a 3 años
  const threeYearRevenue     = useDebouncedField(data?.threeYearRevenue     ?? '', 'threeYearRevenue',     saveFields)
  const threeYearProfit      = useDebouncedField(data?.threeYearProfit      ?? '', 'threeYearProfit',      saveFields)
  const threeYearHeadcount   = useDebouncedField(data?.threeYearHeadcount   ?? '', 'threeYearHeadcount',   saveFields)
  const threeYearDescription = useDebouncedField(data?.threeYearDescription ?? '', 'threeYearDescription', saveFields)
  const threeYearGoals       = useDebouncedList( data?.threeYearGoals       ?? [], 'threeYearGoals',       saveFields)

  // ── Plan a 1 año
  const oneYearDate    = useDebouncedField(data?.oneYearDate    ?? '', 'oneYearDate',    saveFields)
  const oneYearRevenue = useDebouncedField(data?.oneYearRevenue ?? '', 'oneYearRevenue', saveFields)
  const oneYearProfit  = useDebouncedField(data?.oneYearProfit  ?? '', 'oneYearProfit',  saveFields)
  const oneYearGoals   = useDebouncedList( data?.oneYearGoals   ?? [], 'oneYearGoals',   saveFields)

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (vtoMode) {
    return <VTOView data={data} workspaceName={workspaceName} onClose={() => setVtoMode(false)} />
  }

  const progress = [
    { label: 'Valores Medulares',       done: coreValues.items.length >= 3 },
    { label: 'Enfoque Medular',         done: !!(purpose.value.trim() || niche.value.trim()) },
    { label: 'Meta a 10 años',          done: !!tenYearTarget.value.trim() },
    { label: 'Estrategia de Marketing', done: !!(marketingTarget.value.trim() || marketingUniques.items.length > 0) },
    { label: 'Imagen a 3 años',         done: !!(threeYearDescription.value.trim() || threeYearGoals.items.length > 0) },
    { label: 'Plan a 1 año',            done: oneYearGoals.items.length > 0 },
  ]
  const doneCount = progress.filter(s => s.done).length

  return (
    <div className="space-y-6">


      {/* ── Progreso ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Progreso del V/TO</p>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{doneCount} / {progress.length} secciones</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.map(s => (
            <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              s.done
                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── 1. Valores Medulares ── */}
      <SectionCard
        title="Valores Medulares"
        desc="Los principios rectores vitales y trascendentes que definen la cultura y quiénes son como personas."
        saving={coreValues.saving} saved={coreValues.saved}
        onHelp={() => setShowHelp('coreValues')}
      >
        <CoreValuesSection items={coreValues.items} onChange={coreValues.handleChange} />
      </SectionCard>

      {/* ── 2. Enfoque Medular ── */}
      <SectionCard
        title="Enfoque Medular"
        desc="El punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie."
        saving={purpose.saving || niche.saving} saved={purpose.saved || niche.saved}
        onHelp={() => setShowHelp('enfoque')}
      >
        <div className="space-y-5">
          <SubField
            label="Propósito / Causa / Pasión"
            hint="¿Cuál es el propósito, causa o pasión de tu organización?"
            value={purpose.value} onChange={purpose.handleChange} onBlur={purpose.handleBlur}
            placeholder="Ej: Ayudar a las empresas a alcanzar su máximo potencial a través de la tecnología."
          />
          <SubField
            label="Nicho"
            hint="¿Cuál es el nicho de tu organización?"
            value={niche.value} onChange={niche.handleChange} onBlur={niche.handleBlur}
            placeholder="Ej: Agencia de marketing digital para e-commerce de moda en LATAM."
          />
        </div>
      </SectionCard>

      {/* ── 3. Meta a 10 años ── */}
      <SectionCard
        title="Meta a 10 años"
        desc="¿Dónde querés que esté tu organización dentro de una década?"
        saving={tenYearTarget.saving} saved={tenYearTarget.saved}
        onHelp={() => setShowHelp('tenYear')}
      >
        <SubField
          label="" hint=""
          value={tenYearTarget.value} onChange={tenYearTarget.handleChange} onBlur={tenYearTarget.handleBlur}
          rows={4} maxLength={1000}
          placeholder="Ej: Ser la agencia de marketing digital líder en LATAM, con presencia en 5 países y 200 clientes activos."
        />
      </SectionCard>

      {/* ── 4. Estrategia de Marketing ── */}
      <SectionCard
        title="Estrategia de Marketing"
        desc="Define a quién le hablás, qué te hace único, cómo entregás y qué prometés."
        saving={marketingTarget.saving || marketingUniques.saving || marketingProcess.saving || marketingGuarantee.saving}
        saved={marketingTarget.saved  || marketingUniques.saved  || marketingProcess.saved  || marketingGuarantee.saved}
        onHelp={() => setShowHelp('marketing')}
      >
        <div className="space-y-6">
          <SubField
            label="La Lista / Cliente Ideal"
            hint="¿Quién es exactamente tu cliente ideal?"
            value={marketingTarget.value} onChange={marketingTarget.handleChange} onBlur={marketingTarget.handleBlur}
            rows={3} maxLength={1000}
            placeholder="Ej: Dueños de PyMEs de servicios con 5 a 30 empleados en Argentina, que quieren sistematizar su gestión."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Tres Diferenciadores</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Las 3 cosas que te hacen diferente y mejor a tu competencia. Exactamente 3.</p>
            <ItemsList
              items={marketingUniques.items} onChange={marketingUniques.handleChange}
              maxItems={3} minItems={3} placeholder="Ej: Resultados garantizados en 90 días…"
              emptyMsg="Agregá exactamente 3 diferenciadores."
            />
          </div>

          <SubField
            label="Proceso Probado"
            hint="Los pasos que seguís para entregar tus resultados."
            value={marketingProcess.value} onChange={marketingProcess.handleChange} onBlur={marketingProcess.handleBlur}
            rows={3} maxLength={2000}
            placeholder="Ej: 1. Diagnóstico → 2. Estrategia → 3. Implementación → 4. Optimización → 5. Reporte mensual."
          />

          <SubField
            label="Garantía"
            hint="¿Qué le prometés al cliente que, si no se cumple, corregís o devolvés?"
            value={marketingGuarantee.value} onChange={marketingGuarantee.handleChange} onBlur={marketingGuarantee.handleBlur}
            rows={2} maxLength={500}
            placeholder='Ej: "Si no ves resultados medibles en 90 días, devolvemos el dinero."'
          />
        </div>
      </SectionCard>

      {/* ── 5. Imagen a 3 años ── */}
      <SectionCard
        title="Imagen a 3 años"
        desc="Una descripción vívida y específica de cómo se ve tu negocio en tres años."
        saving={threeYearRevenue.saving || threeYearProfit.saving || threeYearHeadcount.saving || threeYearDescription.saving || threeYearGoals.saving}
        saved={threeYearRevenue.saved  || threeYearProfit.saved  || threeYearHeadcount.saved  || threeYearDescription.saved  || threeYearGoals.saved}
        onHelp={() => setShowHelp('threeYear')}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InlineField label="Ingresos objetivo" value={threeYearRevenue.value}   onChange={threeYearRevenue.handleChange}   onBlur={threeYearRevenue.handleBlur}   onKeyDown={threeYearRevenue.handleKeyDown}   placeholder="Ej: $2M anuales" />
            <InlineField label="Rentabilidad"       value={threeYearProfit.value}    onChange={threeYearProfit.handleChange}    onBlur={threeYearProfit.handleBlur}    onKeyDown={threeYearProfit.handleKeyDown}    placeholder="Ej: 25% margen neto" />
            <InlineField label="N.° de empleados"   value={threeYearHeadcount.value} onChange={threeYearHeadcount.handleChange} onBlur={threeYearHeadcount.handleBlur} onKeyDown={threeYearHeadcount.handleKeyDown} placeholder="Ej: 20 personas" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Descripción general</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">¿Cómo se ve, se siente y actúa la organización en 3 años? Arrastrá el borde inferior para agrandar.</p>
            <RichTextEditor
              defaultContent={threeYearDescription.value}
              onChange={threeYearDescription.handleChange}
              onBlur={threeYearDescription.handleBlur}
              autoFocus={false}
              resizable
              minHeight={280}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Objetivos específicos</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Metas concretas y medibles que confirman que llegaste a la imagen.</p>
            <ItemsList
              items={threeYearGoals.items} onChange={threeYearGoals.handleChange}
              maxItems={7} placeholder="Ej: 80 clientes activos recurrentes…"
              emptyMsg="Agregá entre 3 y 7 objetivos específicos."
            />
          </div>
        </div>
      </SectionCard>

      {/* ── 6. Plan a 1 año ── */}
      <SectionCard
        title="Plan a 1 año"
        desc="Las prioridades más importantes para los próximos 12 meses, alineadas con la Imagen a 3 años."
        saving={oneYearDate.saving || oneYearRevenue.saving || oneYearProfit.saving || oneYearGoals.saving}
        saved={oneYearDate.saved  || oneYearRevenue.saved  || oneYearProfit.saved  || oneYearGoals.saved}
        onHelp={() => setShowHelp('oneYear')}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de realización</label>
              <input
                type="date"
                value={oneYearDate.value}
                onChange={e => oneYearDate.handleChange(e.target.value)}
                onBlur={oneYearDate.handleBlur}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <InlineField label="Ingresos objetivo del año" value={oneYearRevenue.value} onChange={oneYearRevenue.handleChange} onBlur={oneYearRevenue.handleBlur} onKeyDown={oneYearRevenue.handleKeyDown} placeholder="Ej: $800K" />
            <InlineField label="Rentabilidad objetivo"     value={oneYearProfit.value}  onChange={oneYearProfit.handleChange}  onBlur={oneYearProfit.handleBlur}  onKeyDown={oneYearProfit.handleKeyDown}  placeholder="Ej: 20% margen neto" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Prioridades del año (Rocks)</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Entre 3 y 7 proyectos o cambios que deben ocurrir este año sí o sí.</p>
            <ItemsList
              items={oneYearGoals.items} onChange={oneYearGoals.handleChange}
              maxItems={7} placeholder="Ej: Lanzar producto X en Q2…"
              emptyMsg="Agregá entre 3 y 7 Rocks para este año."
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Modales de ayuda ── */}
      {showHelp === 'coreValues' && <HelpModal title="¿Cómo definir los Valores Medulares?"   onClose={() => setShowHelp(null)}><CoreValuesHelp /></HelpModal>}
      {showHelp === 'enfoque'    && <HelpModal title="¿Cómo definir el Enfoque Medular?"       onClose={() => setShowHelp(null)}><EnfoqueMedularHelp /></HelpModal>}
      {showHelp === 'tenYear'    && <HelpModal title="¿Cómo fijar una Meta a 10 años?"         onClose={() => setShowHelp(null)}><TenYearHelp /></HelpModal>}
      {showHelp === 'marketing'  && <HelpModal title="¿Cómo definir la Estrategia de Marketing?" onClose={() => setShowHelp(null)}><MarketingHelp /></HelpModal>}
      {showHelp === 'threeYear'  && <HelpModal title="¿Cómo construir la Imagen a 3 años?"    onClose={() => setShowHelp(null)}><ThreeYearHelp /></HelpModal>}
      {showHelp === 'oneYear'    && <HelpModal title="¿Cómo armar el Plan a 1 año?"           onClose={() => setShowHelp(null)}><OneYearHelp /></HelpModal>}

    </div>
  )
}
