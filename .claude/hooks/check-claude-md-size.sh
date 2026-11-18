#!/bin/sh
# Hook PostToolUse (Edit/Write): si se acaba de editar un CLAUDE.md y quedó por
# encima de su presupuesto, se lo avisa a Claude (exit 2 = el stderr le llega).
# Los CLAUDE.md se cargan solos en cada sesión y se pagan en tokens en cada
# mensaje; el detalle va en docs/claude/*.md. Ver "Dónde se documenta lo nuevo"
# en el CLAUDE.md raíz.

input=$(cat)
case "$input" in
  *CLAUDE.md*) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
status=0
check() {
  f="$root/$1"; max=$2
  [ -f "$f" ] || return
  size=$(wc -c < "$f" | tr -d ' ')
  if [ "$size" -gt "$max" ]; then
    echo "$1 pesa $((size / 1024)) KB y su presupuesto es $((max / 1024)) KB. Se carga en cada sesión: mové el detalle a docs/claude/<tema>.md y dejá acá solo una línea con el puntero." >&2
    status=2
  fi
}
check CLAUDE.md 25600
check backend/CLAUDE.md 15360
check frontend/CLAUDE.md 12288
exit $status
