import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntitySummaryCards from '../../components/finanzas/EntitySummaryCards'

function entity(over = {}) {
  return {
    issuerId: 3, name: 'Bliss SRL', cuit: '30712345678', active: true,
    invoiced: '1000', invoiceCount: 2, income: '800', expense: '300', net: '500',
    pendingChecks: { amount: '0', count: 0 }, accounts: [{ id: 1, name: 'Galicia' }], crossCount: 0,
    ...over,
  }
}

const cross = {
  movementId: 77, date: '2026-11-10T12:00:00Z', amount: '250', currency: 'ARS', itemName: 'Pastiza', pendingCheck: false,
  account: { id: 2, name: 'Mercado Pago', issuerId: 4, issuerName: 'Fulano Monotributo' },
  invoice: { id: 9, number: 'FC A 0001-00000009', kind: 'invoice', issuerId: 3, issuerName: 'Bliss SRL' },
}

describe('Resumen: tarjetas por entidad', () => {
  it('muestra facturado, ingresos, egresos y la diferencia de cada entidad', () => {
    render(<EntitySummaryCards currency="ARS" data={{ entities: [entity(), entity({ issuerId: null, name: 'Sin entidad', cuit: null, accounts: [] })], crossCollections: [] }} />)
    expect(screen.getByText('Bliss SRL')).toBeTruthy()
    expect(screen.getByText('Sin entidad')).toBeTruthy()
    expect(screen.getAllByText('Facturó')).toHaveLength(2)
    expect(screen.getByText('Cuentas: Galicia')).toBeTruthy()
    expect(screen.queryByText(/en la cuenta de otra entidad/)).toBeNull()
  })

  it('avisa los cobros cruzados y abre el movimiento al tocarlo', () => {
    const onOpen = vi.fn()
    render(<EntitySummaryCards currency="ARS" onOpenMovement={onOpen}
      data={{ entities: [entity({ crossCount: 1 })], crossCollections: [cross] }} />)
    expect(screen.getByText(/Un cobro entró en la cuenta de otra entidad/)).toBeTruthy()
    expect(screen.getByText(/entró en Mercado Pago/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pastiza/ }))
    expect(onOpen).toHaveBeenCalledWith(77)
  })

  it('una entidad sin cuentas dice dónde asociarlas', () => {
    render(<EntitySummaryCards currency="ARS" data={{ entities: [entity({ accounts: [] })], crossCollections: [] }} />)
    expect(screen.getByText(/se asocian en Configuración/)).toBeTruthy()
  })
})
