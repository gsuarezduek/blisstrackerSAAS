jest.mock('../../src/lib/prisma', () => ({
  workspaceMember:          { findMany: jest.fn() },
  vacationRequest:          { findMany: jest.fn() },
  task:                     { findMany: jest.fn() },
  calendarEventParticipant: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { getBusyBlocks, findCommonFreeSlots, DEFAULT_TASK_BLOCK_MINS } = require('../../src/services/availability.service')

function resetAll() {
  Object.values(prisma).forEach(model => Object.values(model).forEach(fn => fn.mockReset?.()))
  prisma.workspaceMember.findMany.mockResolvedValue([])
  prisma.vacationRequest.findMany.mockResolvedValue([])
  prisma.task.findMany.mockResolvedValue([])
  prisma.calendarEventParticipant.findMany.mockResolvedValue([])
}

beforeEach(resetAll)

const WS = 1

describe('getBusyBlocks', () => {
  it('sin WorkspaceMember configurado, workStart/workEnd quedan null (todo el día libre)', async () => {
    const result = await getBusyBlocks({ workspaceId: WS, userIds: [1], fromDate: '2026-09-20', toDate: '2026-09-20' })
    expect(result[1]).toEqual({ workStart: null, workEnd: null, fullDayOff: new Set(), blocks: [] })
  })

  it('ubica una tarea ya activada (scheduledFor null) por la fecha de su WorkDay', async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: 10, userId: 1, description: 'Llamar al cliente', scheduledFor: null,
        scheduledTime: '15:00', scheduledDurationMins: null,
        workDay: { date: '2026-09-20' },
      },
    ])
    const result = await getBusyBlocks({ workspaceId: WS, userIds: [1], fromDate: '2026-09-20', toDate: '2026-09-20' })
    expect(result[1].blocks).toEqual([
      { date: '2026-09-20', start: '15:00', end: '15:30', kind: 'task', tentative: false, refId: 10, title: 'Llamar al cliente', projectId: null },
    ])
  })

  it('usa DEFAULT_TASK_BLOCK_MINS cuando la tarea no tiene scheduledDurationMins', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 11, userId: 1, description: 'x', scheduledFor: '2026-09-21', scheduledTime: '10:00', scheduledDurationMins: null, workDay: null },
    ])
    const result = await getBusyBlocks({ workspaceId: WS, userIds: [1], fromDate: '2026-09-21', toDate: '2026-09-21' })
    expect(result[1].blocks[0].end).toBe('10:' + String(DEFAULT_TASK_BLOCK_MINS).padStart(2, '0'))
  })

  it('expande un rango de licencia aprobada a fullDayOff, recortado al rango pedido', async () => {
    prisma.vacationRequest.findMany.mockResolvedValue([
      { userId: 1, startDate: '2026-09-19', endDate: '2026-09-23' },
    ])
    const result = await getBusyBlocks({ workspaceId: WS, userIds: [1], fromDate: '2026-09-20', toDate: '2026-09-21' })
    expect([...result[1].fullDayOff].sort()).toEqual(['2026-09-20', '2026-09-21'])
  })

  it('marca tentative:true un CalendarEvent pending y false uno accepted', async () => {
    prisma.calendarEventParticipant.findMany.mockResolvedValue([
      { userId: 1, status: 'pending', event: { id: 1, date: '2026-09-20', startTime: '11:00', durationMins: 30, title: 'Sync', projectId: null } },
      { userId: 1, status: 'accepted', event: { id: 2, date: '2026-09-20', startTime: '14:00', durationMins: 60, title: 'Demo', projectId: 5 } },
    ])
    const result = await getBusyBlocks({ workspaceId: WS, userIds: [1], fromDate: '2026-09-20', toDate: '2026-09-20' })
    const [pending, accepted] = result[1].blocks
    expect(pending.tentative).toBe(true)
    expect(accepted.tentative).toBe(false)
    expect(accepted.end).toBe('15:00')
  })
})

describe('findCommonFreeSlots', () => {
  it('intersecta el horario laboral de dos personas y descuenta sus bloques no tentativos', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '18:00' },
      { userId: 2, workStartTime: '10:00', workEndTime: '17:00' },
    ])
    prisma.calendarEventParticipant.findMany.mockResolvedValue([
      { userId: 1, status: 'accepted', event: { id: 1, date: '2026-09-20', startTime: '10:00', durationMins: 60, title: 'x', projectId: null } },
    ])
    const slots = await findCommonFreeSlots({ workspaceId: WS, userIds: [1, 2], date: '2026-09-20', durationMins: 30 })
    // Ventana común 10:00-17:00, menos el bloque de la persona 1 (10:00-11:00)
    expect(slots).toEqual([{ start: '11:00', end: '17:00' }])
  })

  it('una invitación pending no bloquea la búsqueda de huecos comunes', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '12:00' },
    ])
    prisma.calendarEventParticipant.findMany.mockResolvedValue([
      { userId: 1, status: 'pending', event: { id: 1, date: '2026-09-20', startTime: '09:30', durationMins: 60, title: 'x', projectId: null } },
    ])
    const slots = await findCommonFreeSlots({ workspaceId: WS, userIds: [1], date: '2026-09-20', durationMins: 30 })
    expect(slots).toEqual([{ start: '09:00', end: '12:00' }])
  })

  it('una licencia aprobada deja a la persona sin huecos ese día', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '18:00' },
    ])
    prisma.vacationRequest.findMany.mockResolvedValue([
      { userId: 1, startDate: '2026-09-20', endDate: '2026-09-20' },
    ])
    const slots = await findCommonFreeSlots({ workspaceId: WS, userIds: [1], date: '2026-09-20', durationMins: 30 })
    expect(slots).toEqual([])
  })

  it('sin horario configurado se trata como día completo disponible (00:00-24:00)', async () => {
    const slots = await findCommonFreeSlots({ workspaceId: WS, userIds: [1], date: '2026-09-20', durationMins: 30 })
    expect(slots).toEqual([{ start: '00:00', end: '24:00' }])
  })

  it('descarta huecos más cortos que la duración pedida', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '09:20' },
    ])
    const slots = await findCommonFreeSlots({ workspaceId: WS, userIds: [1], date: '2026-09-20', durationMins: 30 })
    expect(slots).toEqual([])
  })
})
