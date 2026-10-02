import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import api from '../../api/client'
import { resolveRrhhNav, rrhhSections } from '../../pages/rrhh/rrhhNav'
import { businessDays, buildApprovalItems, urgencyFor, ApprovalRow } from '../../pages/rrhh/approvals'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))

describe('rrhhNav', () => {
  it('sin tab cae en Hoy sin reescribir la URL', () => {
    expect(resolveRrhhNav({})).toEqual({ tab: 'hoy', view: null, changed: false })
  })

  it('mapea las pestañas del panel anterior', () => {
    expect(resolveRrhhNav({ tab: 'licencias' })).toEqual({ tab: 'ausencias', view: 'solicitudes', changed: true })
    expect(resolveRrhhNav({ tab: 'beneficios' })).toMatchObject({ tab: 'ausencias', view: 'saldos' })
    expect(resolveRrhhNav({ tab: 'ausencias', view: 'vacaciones' })).toMatchObject({ view: 'saldos', changed: true })
    expect(resolveRrhhNav({ tab: 'legajos' })).toMatchObject({ tab: 'personas', view: null })
    expect(resolveRrhhNav({ tab: 'ingresos' })).toMatchObject({ tab: 'asistencia' })
    expect(resolveRrhhNav({ tab: 'dashboard' })).toMatchObject({ tab: 'hoy', changed: true })
  })

  it('completa la vista por defecto y descarta vistas inválidas', () => {
    expect(resolveRrhhNav({ tab: 'ausencias' })).toMatchObject({ view: 'calendario', changed: true })
    expect(resolveRrhhNav({ tab: 'ausencias', view: 'saldos' })).toMatchObject({ view: 'saldos', changed: false })
    expect(resolveRrhhNav({ tab: 'personas', view: 'x' })).toMatchObject({ view: null, changed: true })
  })

  it('oculta Productividad si el workspace la apagó', () => {
    expect(rrhhSections({ productivityEnabled: false }).map(s => s.id)).not.toContain('productividad')
    expect(resolveRrhhNav({ tab: 'productividad' }, { productivityEnabled: false })).toMatchObject({ tab: 'hoy', changed: true })
  })
})

describe('cola de aprobaciones', () => {
  const ana = { id: 1, name: 'Ana Pérez', avatar: 'a.png' }
  const beto = { id: 2, name: 'Beto Gómez', avatar: 'b.png' }

  it('cuenta días hábiles como el backend (sin fines de semana)', () => {
    expect(businessDays('2026-10-02', '2026-10-06')).toBe(3) // vie, lun, mar
  })

  it('une licencias y beneficios, ordena por fecha de inicio y calcula saldo y superposiciones', () => {
    const items = buildApprovalItems({
      leaves: [{ id: 10, user: ana, type: 'vacaciones', startDate: '2026-10-12', endDate: '2026-10-16', createdAt: '2026-10-01' }],
      benefits: [{ id: 20, user: beto, bank: 'dias_home', amount: 1, date: '2026-10-05', createdAt: '2026-10-01' }],
      approvedLeaves: [{ id: 99, user: beto, startDate: '2026-10-15', endDate: '2026-10-20' }],
      usersById: { 1: { vacationDays: 4 }, 2: { homeDaysBalance: 3 } },
    })
    expect(items.map(i => i.key)).toEqual(['benefit-20', 'leave-10'])
    const leave = items[1]
    expect(leave.amount).toBe('5 días hábiles')
    expect(leave.balance).toMatchObject({ from: 4, to: -1 })
    expect(leave.overlaps).toEqual(['Beto Gómez'])
    expect(items[0].balance).toMatchObject({ from: 3, to: 2 })
  })

  it('marca la urgencia según cuándo empieza', () => {
    expect(urgencyFor('2026-10-01', '2026-10-02').label).toBe('Ya empezó')
    expect(urgencyFor('2026-10-03', '2026-10-02').label).toBe('Mañana')
    expect(urgencyFor(null)).toBeNull()
  })
})

describe('ApprovalRow', () => {
  const item = {
    key: 'leave-10', kind: 'leave', id: 10, user: { id: 1, name: 'Ana Pérez', avatar: 'a.png' },
    title: 'Vacaciones', when: '12 – 16 oct 2026', startDate: '2099-01-01', amount: '5 días hábiles',
    balance: { from: 10, to: 5, unit: 'días de vacaciones' }, note: null, overlaps: [],
  }
  beforeEach(() => { api.patch.mockReset() })

  it('aprueba con un click', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const onDecided = vi.fn()
    render(<ul><ApprovalRow item={item} onDecided={onDecided} /></ul>)
    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(item, 'approved'))
    expect(api.patch).toHaveBeenCalledWith('/vacation/admin/requests/10', { status: 'approved', reviewNote: '' })
  })

  it('rechazar exige un motivo antes de llamar al backend', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const onDecided = vi.fn()
    render(<ul><ApprovalRow item={item} onDecided={onDecided} /></ul>)
    fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }))
    expect(api.patch).not.toHaveBeenCalled()
    expect(screen.getByText(/Contale el motivo/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Cierre de mes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }))
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(item, 'rejected'))
    expect(api.patch).toHaveBeenCalledWith('/vacation/admin/requests/10', { status: 'rejected', reviewNote: 'Cierre de mes' })
  })

  it('si otra persona ya la resolvió (409), la saca de la cola igual', async () => {
    api.patch.mockRejectedValue({ response: { status: 409 } })
    const onDecided = vi.fn()
    render(<ul><ApprovalRow item={item} onDecided={onDecided} /></ul>)
    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(item, null))
  })
})
