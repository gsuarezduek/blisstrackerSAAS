const prisma = require('../../lib/prisma')
const { getTaskWithAccess } = require('../comments.controller')
const { getOrCreateWorkDay } = require('../../lib/workDay')
const { todayString } = require('../../utils/dates')
const { taskInclude } = require('./_shared')
const { MAX_ITEMS_PER_TASK, cleanText, parseChecklistInput } = require('../../lib/taskChecklist')

// Subtareas de una tarea (checklist). Ver Task.checklist en schema.prisma: son ítems de
// texto con tilde, NO Task — si lo fueran habría que excluirlas a mano de cada consulta
// que lista o cuenta tareas (resumen del día, Reportes/Productividad, insight diario,
// tiempo de agente facturable), y lo que se escape cuenta doble en silencio.
//
// Acceso: el mismo criterio "equipo = etiqueta, no barrera" que los comentarios
// (getTaskWithAccess solo scopea por workspace, con la excepción de los proyectos
// privados). Cualquier miembro activo del workspace puede agregar y tildar ítems.
//
// Tildar NO notifica a nadie a propósito: un checklist de 4 ítems serían 4 campanazos.
// El progreso se ve donde se ve la tarea (badge "2/4" en TaskCard, lista en NowCard).

const ITEM_SELECT = {
  id: true,
  text: true,
  done: true,
  doneAt: true,
  doneById: true,
  order: true,
}

// Siempre se devuelve la lista completa (como toggleReaction devuelve el comentario
// entero): el frontend reemplaza el array y no tiene que reconciliar de a un ítem.
function listItems(taskId) {
  return prisma.taskChecklistItem.findMany({
    where: { taskId },
    select: ITEM_SELECT,
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
}

// El detalle de la tarea lo abren varias pantallas (perfil, ficha del proyecto, buscador,
// Seguimiento) y no todas arman un taskInclude con `checklist`, así que el modal pide la
// lista por su cuenta — mismo patrón que GET /tasks/:id/attachments.
async function listChecklist(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })
    res.json(await listItems(taskId))
  } catch (err) { next(err) }
}

async function addItem(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    // Un solo campo acepta tanto "una subtarea" como una lista pegada de varias líneas.
    const texts = parseChecklistInput(req.body?.text)
    if (texts.length === 0) return res.status(400).json({ error: 'Escribí la subtarea' })

    const count = await prisma.taskChecklistItem.count({ where: { taskId } })
    if (count + texts.length > MAX_ITEMS_PER_TASK) {
      return res.status(400).json({
        error: `Una tarea admite hasta ${MAX_ITEMS_PER_TASK} subtareas. Si necesitás más, conviene partirla en varias tareas.`,
      })
    }

    const last = await prisma.taskChecklistItem.findFirst({
      where: { taskId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const base = (last?.order ?? -1) + 1

    await prisma.taskChecklistItem.createMany({
      data: texts.map((text, i) => ({ taskId, text, order: base + i })),
    })

    res.status(201).json(await listItems(taskId))
  } catch (err) { next(err) }
}

async function updateItem(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const itemId = Number(req.params.itemId)
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const item = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId } })
    if (!item) return res.status(404).json({ error: 'Subtarea no encontrada' })

    const data = {}
    if (req.body?.text !== undefined) {
      const text = cleanText(req.body.text)
      if (!text) return res.status(400).json({ error: 'El texto no puede quedar vacío' })
      data.text = text
    }
    if (req.body?.done !== undefined) {
      if (typeof req.body.done !== 'boolean') return res.status(400).json({ error: 'done tiene que ser booleano' })
      data.done = req.body.done
      // Destildar borra el rastro: si vuelve a tildarse, lo hace quien lo tildó esta vez.
      data.doneAt = req.body.done ? new Date() : null
      data.doneById = req.body.done ? req.user.userId : null
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada que actualizar' })

    await prisma.taskChecklistItem.update({ where: { id: itemId }, data })
    res.json(await listItems(taskId))
  } catch (err) { next(err) }
}

async function removeItem(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const itemId = Number(req.params.itemId)
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const { count } = await prisma.taskChecklistItem.deleteMany({ where: { id: itemId, taskId } })
    if (count === 0) return res.status(404).json({ error: 'Subtarea no encontrada' })

    res.json(await listItems(taskId))
  } catch (err) { next(err) }
}

// Reordenar: se mandan los ids en el orden deseado. Los que no vengan quedan al final
// con su orden relativo (no se pierde nada si el cliente manda una lista parcial).
async function reorderItems(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : []
    if (ids.length === 0) return res.status(400).json({ error: 'ids requerido' })

    const own = await prisma.taskChecklistItem.findMany({ where: { taskId }, select: { id: true } })
    const ownIds = new Set(own.map(i => i.id))
    const ordered = ids.filter(id => ownIds.has(id))

    await prisma.$transaction(
      ordered.map((id, i) => prisma.taskChecklistItem.update({ where: { id }, data: { order: i } }))
    )
    res.json(await listItems(taskId))
  } catch (err) { next(err) }
}

// "Convertir en tarea": la válvula de escape del tope de ítems. Una subtarea que creció
// (necesita su propio tiempo, su propio responsable, quedar bloqueada) deja de ser un
// tilde y pasa a ser una Task de verdad en el mismo proyecto, del mismo responsable, en
// la jornada de hoy. El ítem se borra del checklist en la misma transacción: si quedara
// tildado, el progreso "3/4" diría que algo se hizo cuando en realidad recién empieza.
async function convertItemToTask(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const itemId = Number(req.params.itemId)
    const workspaceId = req.workspace.id
    const task = await getTaskWithAccess(req, taskId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const item = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId } })
    if (!item) return res.status(404).json({ error: 'Subtarea no encontrada' })

    // La tarea nueva es del mismo responsable que la original (no de quien aprieta el
    // botón): la subtarea era parte de SU trabajo. Por eso la jornada que se busca/crea
    // es la de esa persona, igual que al crear una tarea para otro.
    const workDay = await getOrCreateWorkDay(prisma, {
      userId: task.userId,
      workspaceId,
      date: todayString(req.workspace.timezone),
    })
    if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada laboral. Recargá la página.' })

    const created = await prisma.$transaction(async tx => {
      const newTask = await tx.task.create({
        data: {
          description: item.text,
          projectId: task.projectId,
          userId: task.userId,
          workDayId: workDay.id,
          createdById: task.userId !== req.user.userId ? req.user.userId : null,
          // Hereda el depósito: una subtarea de una tarea de backlog no debería
          // aparecer de golpe en la lista de hoy de otra persona.
          isBacklog: task.isBacklog,
        },
        include: taskInclude,
      })
      await tx.taskChecklistItem.delete({ where: { id: itemId } })
      return newTask
    })

    res.status(201).json({ task: created, checklist: await listItems(taskId) })
  } catch (err) { next(err) }
}

module.exports = {
  listChecklist, addItem, updateItem, removeItem, reorderItems, convertItemToTask, listItems,
}
