import { useState } from 'react'
import Navbar from '../components/Navbar'
import VisionTab from '../components/eos/VisionTab'
import PersonasTab from '../components/eos/PersonasTab'
import DatosTab from '../components/eos/DatosTab'
import ProcesosTab from '../components/eos/ProcesosTab'
import AsuntosTab from '../components/eos/AsuntosTab'
import TraccionTab from '../components/eos/TraccionTab'

const TABS = [
  {
    id: 'vision',
    label: '🧭 Visión',
    title: 'Visión',
    description: 'Define hacia dónde va la empresa: propósito, valores, metas a 10 años, estrategia y objetivos a 1 año.',
  },
  {
    id: 'personas',
    label: '👥 Personas',
    title: 'Personas',
    description: 'Las personas correctas en los roles correctos. Evaluación del equipo según valores y responsabilidades.',
  },
  {
    id: 'datos',
    label: '📊 Datos',
    title: 'Datos',
    description: 'Scorecard semanal con métricas clave. Cada número tiene un responsable y un objetivo.',
  },
  {
    id: 'asuntos',
    label: '🔍 Asuntos',
    title: 'Asuntos',
    description: 'Lista de issues identificados. Se priorizan, discuten y resuelven en las reuniones de liderazgo.',
  },
  {
    id: 'procesos',
    label: '⚙️ Procesos',
    title: 'Procesos',
    description: 'Documentación y seguimiento de los procesos centrales del negocio.',
  },
  {
    id: 'traccion',
    label: '🚀 Tracción',
    title: 'Tracción',
    description: 'Reuniones, Rocks trimestrales y revisión semanal del pulso del equipo.',
  },
]

export default function EOS() {
  const [tab, setTab] = useState('vision')
  const current = TABS.find(t => t.id === tab)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">EOS</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sistema Operativo Empresarial · basado en <em>Traction</em> de Gino Wickman
          </p>
        </div>

        {/* Tabs — select en mobile, botones en desktop */}
        <div className="mb-6">
          {/* Mobile */}
          <select
            className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={tab}
            onChange={e => setTab(e.target.value)}
          >
            {TABS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          {/* Desktop */}
          <div className="hidden sm:flex flex-wrap gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        {tab === 'vision'   && <VisionTab />}
        {tab === 'personas' && <PersonasTab />}
        {tab === 'datos'    && <DatosTab />}
        {tab === 'procesos' && <ProcesosTab />}
        {tab === 'asuntos'  && <AsuntosTab />}
        {tab === 'traccion' && <TraccionTab />}

        {tab !== 'vision' && tab !== 'personas' && tab !== 'datos' && tab !== 'procesos' && tab !== 'asuntos' && tab !== 'traccion' && current && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
            <p className="text-5xl mb-4">{current.label.split(' ')[0]}</p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{current.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-6">{current.description}</p>
            <span className="inline-block px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
              Próximamente
            </span>
          </div>
        )}

      </main>
    </div>
  )
}
