/**
 * Retorna la URL para mostrar un avatar de perfil.
 * Las imágenes se sirven desde el backend (almacenadas en DB).
 *
 * Uso: avatarUrl(user.avatar)  →  http://localhost:3001/api/avatars/img/2bee.png
 */
const API_URL = import.meta.env.VITE_API_URL || ''

export function avatarUrl(filename) {
  return `${API_URL}/api/avatars/img/${filename ?? '2bee.png'}`
}
