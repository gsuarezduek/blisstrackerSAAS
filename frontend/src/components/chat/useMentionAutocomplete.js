import { useState, useCallback } from 'react'

// Autocompletado de @menciones para el input del chat — mismo patrón que ya usa
// TaskCommentsModal.jsx (sin librería externa), generalizado para recibir
// cualquier lista de miembros (acá: todo el workspace, no solo el proyecto).
export function useMentionAutocomplete({ text, setText, textareaRef, members }) {
  const [mentionQuery, setMentionQuery] = useState(null) // null = inactivo
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIdx, setMentionIdx] = useState(0)

  const mentionMatches = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : []

  const selectMention = useCallback((member) => {
    const cursorPos = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, mentionStart)
    const after = text.slice(cursorPos)
    const newText = `${before}@${member.name} ${after}`
    setText(newText)
    setMentionQuery(null)
    setMentionStart(-1)
    const newCursor = mentionStart + member.name.length + 2
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [text, mentionStart, setText, textareaRef])

  function handleTextChange(e) {
    const val = e.target.value
    const pos = e.target.selectionStart
    setText(val)
    const before = val.slice(0, pos)
    const atIdx = before.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = before.slice(atIdx + 1)
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionQuery(afterAt)
        setMentionStart(atIdx)
        setMentionIdx(0)
        return
      }
    }
    setMentionQuery(null)
    setMentionStart(-1)
  }

  // Devuelve true si consumió la tecla (así el caller no la procesa de nuevo, ej. Enter para enviar).
  function handleMentionKeyDown(e) {
    if (mentionQuery === null || mentionMatches.length === 0) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1)); return true }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionMatches[mentionIdx]); return true }
    if (e.key === 'Escape') { setMentionQuery(null); return true }
    return false
  }

  return { mentionQuery, mentionMatches, mentionIdx, handleTextChange, handleMentionKeyDown, selectMention }
}
