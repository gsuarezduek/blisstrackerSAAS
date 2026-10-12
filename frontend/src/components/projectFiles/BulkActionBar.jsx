// ─── Barra de acciones en lote — reemplaza la explicación de tamaño mientras haya selección ───

export default function BulkActionBar({ count, downloading, onDownload, onMove, onDelete, onCancel }) {
  return (
    <div className="flex items-center gap-3 text-sm bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-3 py-2">
      <span className="text-primary-700 dark:text-primary-300 font-medium">{count} seleccionado{count > 1 ? 's' : ''}</span>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="text-gray-600 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
      >{downloading ? 'Preparando…' : '⬇️ Descargar'}</button>
      <button
        onClick={onMove}
        className="text-gray-600 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-300"
      >Mover</button>
      <button
        onClick={onDelete}
        className="text-red-600 dark:text-red-400 hover:text-red-700"
      >Eliminar</button>
      <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Cancelar</button>
    </div>
  )
}
