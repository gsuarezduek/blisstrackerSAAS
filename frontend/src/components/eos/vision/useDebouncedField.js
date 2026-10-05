import { useState, useEffect, useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// Hook: guarda al perder el foco (blur) o al presionar Enter (inputs de una línea)
// ═══════════════════════════════════════════════════════════════════════════════

export function useDebouncedField(initial, fieldKey, onSave) {
  const [value,  setValue]  = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const dirty = useRef(false)

  useEffect(() => { setValue(initial) }, [initial])

  function handleChange(next) {
    setValue(next)
    dirty.current = true
    setSaved(false)
  }

  async function commit(val) {
    if (!dirty.current) return
    dirty.current = false
    setSaving(true)
    try {
      await onSave({ [fieldKey]: val })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  function handleBlur()    { commit(value) }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); commit(value) } }

  return { value, handleChange, handleBlur, handleKeyDown, saving, saved }
}

// Lista con auto-save inmediato (se modifica con botones, no con escritura)
export function useDebouncedList(initial, fieldKey, onSave) {
  const [items,  setItems]  = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => { setItems(initial) }, [initial])   // eslint-disable-line

  async function handleChange(next) {
    setItems(next)
    setSaved(false)
    setSaving(true)
    try {
      await onSave({ [fieldKey]: next })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  return { items, handleChange, saving, saved }
}
