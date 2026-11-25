import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Revalidación on-demand. La dispara el backend cuando se guarda algo que el sitio
 * público muestra (copy de la landing, precios, legales, un post del blog) — ver
 * backend/src/services/revalidateSite.service.js.
 *
 * Sin esto habría que esperar la ventana de ISR (de 5 minutos a 1 hora según la página)
 * para ver un cambio hecho en SuperAdmin. El ISR igual queda puesto: este webhook es la
 * mejora, no el único camino, así que si falla el sitio se actualiza solo más tarde.
 *
 * Body: { secret, tags?: string[], paths?: string[] }
 * El secreto va en el body y no en la URL para que no quede en los logs del edge.
 */
export async function POST(request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return Response.json({ error: 'REVALIDATE_SECRET no configurado' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (body.secret !== secret) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tags  = Array.isArray(body.tags)  ? body.tags.slice(0, 20)  : []
  const paths = Array.isArray(body.paths) ? body.paths.slice(0, 20) : []

  for (const tag of tags) revalidateTag(String(tag))
  for (const path of paths) revalidatePath(String(path))

  return Response.json({ revalidated: true, tags, paths, now: Date.now() })
}
