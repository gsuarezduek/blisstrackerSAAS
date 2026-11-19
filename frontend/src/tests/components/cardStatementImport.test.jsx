import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const post = vi.fn()
const get = vi.fn()
vi.mock('../../api/client', () => ({ default: { post: (...a) => post(...a), get: (...a) => get(...a), delete: vi.fn() } }))

import CardStatementImport from '../../components/finanzas/CardStatementImport'

const pesos = { id: 3, name: 'Patagonia $', currency: 'ARS', active: true }
const dolares = { id: 4, name: 'Patagonia U$S', currency: 'USD', active: true }
const categories = [
  { id: 21, name: 'Publicidad', type: 'expense', active: true },
  { id: 23, name: 'Software', type: 'expense', active: true },
  { id: 22, name: 'Reintegros', type: 'income', active: true },
]
const items = [{ id: 11, name: 'Facebook Ads', categoryId: 21, category: { type: 'expense' }, active: true }]
const card = { id: 7, name: 'Visa Signature', last4: '6436', arsAccountId: 3, usdAccountId: 4 }

const line = (fingerprint, date, description, amount, currency, kind = 'purchase') => ({ fingerprint, date, description, amount, currency, kind, voucher: null, installment: null, merchantKey: description.split(' ')[0].toUpperCase() })
const PREVIEW = {
  card,
  statement: { bank: 'Banco Patagonia', closingDate: '2026-10-22', dueDate: '2026-11-02', last4: '6436', encrypted: false },
  checks: [{ currency: 'ARS', ok: true }, { currency: 'USD', ok: true }],
  groups: [
    { id: 'FACEBK|ARS|expense', merchantKey: 'FACEBK', currency: 'ARS', type: 'expense', total: '50000.00',
      lines: [line('a'.repeat(40), '2026-09-25', 'FACEBK *N7RA', '30000.00', 'ARS'), line('b'.repeat(40), '2026-09-27', 'FACEBK *W9SF', '20000.00', 'ARS')],
      suggestion: { itemId: 11, categoryId: 21, newItemName: null, source: 'card' } },
    { id: 'ANTHROPIC|USD|expense', merchantKey: 'ANTHROPIC', currency: 'USD', type: 'expense', total: '20.07',
      lines: [line('c'.repeat(40), '2026-09-24', 'ANTHROPIC', '20.07', 'USD')],
      suggestion: { itemId: null, categoryId: 21, newItemName: 'Anthropic', source: 'ai' } },
  ],
  payments: [line('d'.repeat(40), '2026-10-02', 'SU PAGO EN PESOS', '100000.00', 'ARS', 'payment')],
  alreadyImported: [],
  droppedLines: 0,
}

function setup() {
  const onSaved = vi.fn()
  const view = render(<CardStatementImport accounts={[pesos, dolares]} categories={categories} items={items} onClose={vi.fn()} onSaved={onSaved} />)
  return { ...view, onSaved }
}

async function uploadAndRead(container) {
  await screen.findByRole('option', { name: /Visa Signature/ })
  const file = new File(['%PDF-1.4'], 'resumen.pdf', { type: 'application/pdf' })
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Leer resumen' }))
}

describe('Cargar → Tarjeta', () => {
  beforeEach(() => {
    post.mockReset(); get.mockReset()
    get.mockImplementation(async (url) => (url === '/finanzas/cards' ? { data: [card] } : { data: [] }))
  })

  it('pide la clave cuando el PDF la tiene', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Este PDF tiene clave. Ingresala para poder leerlo.', code: 'PDF_PASSWORD_REQUIRED' } } })
    const { container } = setup()
    await uploadAndRead(container)
    expect(await screen.findByText(/Este PDF tiene clave/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/Generalmente es tu DNI/)).toBeTruthy()
  })

  it('muestra los grupos con su sugerencia y manda lo que el usuario dejó al importar', async () => {
    post.mockImplementation(async (url) => (url === '/finanzas/card-statements/parse' ? { data: PREVIEW } : { data: { movements: 2 } }))
    const { container, onSaved } = setup()
    await uploadAndRead(container)

    expect(await screen.findByText('Recordado')).toBeTruthy()
    expect(screen.getByText('Sugerido')).toBeTruthy()
    expect(screen.getByText('Crear «Anthropic»')).toBeTruthy()
    expect(screen.getByText(/cierran con el saldo del resumen/)).toBeTruthy()

    // El usuario corrige la categoría de Anthropic: Software en vez de Publicidad.
    const categorySelects = screen.getAllByRole('combobox', { name: 'Categoría' })
    fireEvent.change(categorySelects[1], { target: { value: '23' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, fd] = post.mock.calls[1]
    expect(url).toBe('/finanzas/card-statements')
    const payload = JSON.parse(fd.get('payload'))
    expect(payload).toMatchObject({ cardId: 7, arsAccountId: 3, usdAccountId: 4, dateMode: 'due', dueDate: '2026-11-02' })
    expect(payload.groups).toEqual([
      expect.objectContaining({ currency: 'ARS', itemId: 11, newItemName: null, categoryId: 21 }),
      expect.objectContaining({ currency: 'USD', itemId: null, newItemName: 'Anthropic', categoryId: 23 }),
    ])
    expect(fd.get('file')).toBeTruthy()
  })

  it('un grupo destildado no se importa', async () => {
    post.mockImplementation(async (url) => (url === '/finanzas/card-statements/parse' ? { data: PREVIEW } : { data: {} }))
    const { container } = setup()
    await uploadAndRead(container)
    await screen.findByText('Recordado')
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Importar' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    const payload = JSON.parse(post.mock.calls[1][1].get('payload'))
    expect(payload.groups).toHaveLength(1)
    expect(payload.groups[0].currency).toBe('ARS')
  })

  it('sin tarjetas arranca con el alta de una', async () => {
    get.mockImplementation(async () => ({ data: [] }))
    setup()
    expect(await screen.findByText('Nueva tarjeta')).toBeTruthy()
  })
})
