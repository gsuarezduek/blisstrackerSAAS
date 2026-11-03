import { useState } from 'react'
import { moveItems } from './projectFilesHelpers'

// Tipo propio en el dataTransfer: Firefox no arranca un drag sin datos, y al no
// ser `text/plain` soltarlo sobre el buscador no pega nada.
const DRAG_MIME = 'application/x-bliss-project-files'
const ROOT_KEY = 'root'

// Arrastrar elementos de la grilla para moverlos a otra carpeta. Los destinos
// son las carpetas de la grilla y la ruta de arriba (sin eso no habría forma de
// sacar algo de una carpeta arrastrando). `targetId` null = la raíz.
export function useFileDragMove({ projectId, folderId, selectedItems, onMoved, onError }) {
  const [draggingItems, setDraggingItems] = useState(null)
  const [overKey, setOverKey] = useState(null)

  function stopDragging() {
    setDraggingItems(null)
    setOverKey(null)
  }

  // Las subcarpetas de un elemento arrastrado nunca están a la vista (la grilla
  // muestra hermanos y la ruta, ancestros), así que acá solo hay que descartar
  // la carpeta actual y soltar algo sobre sí mismo.
  function canDropOn(targetId) {
    if (!draggingItems || (targetId ?? null) === (folderId ?? null)) return false
    return !draggingItems.some(it => it.id === targetId)
  }

  async function drop(targetId) {
    const items = draggingItems
    stopDragging()
    onError('')
    const { moved, error } = await moveItems(projectId, items, targetId)
    if (moved.length > 0) onMoved(moved)
    if (error) onError(error)
  }

  // Arrastrar un elemento seleccionado se lleva toda la selección; uno que no
  // está seleccionado se mueve solo y la selección queda como estaba.
  function dragSourceProps(item) {
    return {
      onDragStart: e => {
        const inSelection = selectedItems.some(it => it.id === item.id)
        const items = inSelection ? selectedItems : [item]
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(DRAG_MIME, items.map(it => it.id).join(','))
        setDraggingItems(items)
      },
      onDragEnd: stopDragging,
    }
  }

  // Sin drag interno no se toca el evento: un archivo del sistema soltado sobre
  // una carpeta se sigue subiendo a la carpeta actual, vía el handler del contenedor.
  function dropTargetProps(targetId) {
    return {
      onDragOver: e => {
        if (!canDropOn(targetId)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setOverKey(targetId ?? ROOT_KEY)
      },
      // dragleave también dispara al pasar a un hijo del destino: sin este
      // chequeo el resaltado parpadea al recorrer la tarjeta.
      onDragLeave: e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOverKey(null)
      },
      onDrop: e => {
        if (!canDropOn(targetId)) return
        e.preventDefault()
        e.stopPropagation()
        drop(targetId)
      },
    }
  }

  return {
    isDragging: !!draggingItems,
    isItemDragging: item => !!draggingItems?.some(it => it.id === item.id),
    isDropTarget: targetId => overKey === (targetId ?? ROOT_KEY),
    dragSourceProps,
    dropTargetProps,
  }
}
