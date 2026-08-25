// Detecta links de Google Drive (archivo o carpeta) dentro de un texto para
// embeberlos directamente (iframe "preview" que Google sirve para cualquier
// archivo compartido "Cualquiera con el link" — imagen, video, etc. — sin
// necesitar la API de Drive ni credenciales).
const DRIVE_FILE_RE   = /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s"'<>]*/g
const DRIVE_OPEN_RE   = /https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)[^\s"'<>]*/g
const DRIVE_FOLDER_RE = /https?:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)[^\s"'<>]*/g

export function findDriveEmbeds(text) {
  if (!text) return []
  const found = []
  const seen = new Set()
  const patterns = [
    { re: DRIVE_FILE_RE,   type: 'file' },
    { re: DRIVE_OPEN_RE,   type: 'file' },
    { re: DRIVE_FOLDER_RE, type: 'folder' },
  ]
  for (const { re, type } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const id = m[1]
      if (seen.has(id)) continue
      seen.add(id)
      found.push({ id, type })
    }
  }
  return found
}

export function driveEmbedUrl({ id, type }) {
  return type === 'folder'
    ? `https://drive.google.com/embeddedfolderview?id=${id}#grid`
    : `https://drive.google.com/file/d/${id}/preview`
}
