/**
 * Lista blanca de consultas a GA4 ("Preguntale a tus datos").
 *
 * Lo que se afirma acá es la frontera de seguridad de la feature: la consulta
 * que termina en Google se reconstruye desde el catálogo, así que una dimensión,
 * una métrica, un filtro o un orden que no estén en la lista NO pueden pasar —
 * por más que el modelo los pida. El error vuelve como texto (para que el modelo
 * corrija y reintente), nunca como excepción.
 */
const {
  validateGa4Query, toRunReportBody, buildCatalogPrompt, DIMENSIONS, METRICS, MAX_LIMIT,
} = require('../../src/lib/ga4QueryCatalog')

const base = { metrics: ['sessions'], startDate: '2026-01-01', endDate: '2026-11-13' }

describe('validateGa4Query — lo que se acepta', () => {
  test('consulta mínima: una métrica y un rango', () => {
    const { ok, query } = validateGa4Query(base)
    expect(ok).toBe(true)
    expect(query.metrics).toEqual(['sessions'])
    expect(query.dimensions).toEqual([])
    expect(query.limit).toBe(10)
  })

  test('fechas relativas de GA4', () => {
    expect(validateGa4Query({ ...base, startDate: '365daysAgo', endDate: 'today' }).ok).toBe(true)
    expect(validateGa4Query({ ...base, startDate: '7daysAgo', endDate: 'yesterday' }).ok).toBe(true)
  })

  test('filtro por país con varios valores', () => {
    const { ok, query } = validateGa4Query({ ...base, dimensions: ['country'], filters: [{ dimension: 'country', operator: 'exact', values: ['Chile', 'Argentina'] }] })
    expect(ok).toBe(true)
    expect(query.filters[0].values).toEqual(['Chile', 'Argentina'])
  })

  test('el límite se topea y nunca queda en 0', () => {
    expect(validateGa4Query({ ...base, limit: 5000 }).query.limit).toBe(MAX_LIMIT)
    expect(validateGa4Query({ ...base, limit: 0 }).query.limit).toBe(10)
    expect(validateGa4Query({ ...base, limit: 'muchas' }).query.limit).toBe(10)
  })
})

describe('validateGa4Query — lo que se rechaza', () => {
  test('dimensión fuera del catálogo', () => {
    const r = validateGa4Query({ ...base, dimensions: ['userEmail'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/userEmail/)
  })

  test('métrica fuera del catálogo', () => {
    expect(validateGa4Query({ ...base, metrics: ['revenueDeLaCompetencia'] }).ok).toBe(false)
  })

  test('sin métricas', () => {
    expect(validateGa4Query({ startDate: 'today', endDate: 'today' }).ok).toBe(false)
    expect(validateGa4Query({ ...base, metrics: [] }).ok).toBe(false)
  })

  test('fecha con cualquier otra forma', () => {
    expect(validateGa4Query({ ...base, startDate: '13/11/2026' }).ok).toBe(false)
    expect(validateGa4Query({ ...base, startDate: '2026-01-01; DROP TABLE' }).ok).toBe(false)
    expect(validateGa4Query({ ...base, endDate: 'siempre' }).ok).toBe(false)
  })

  test('rango invertido', () => {
    expect(validateGa4Query({ ...base, startDate: '2026-11-13', endDate: '2026-01-01' }).ok).toBe(false)
  })

  test('filtro sobre una dimensión que no existe, u operador inventado', () => {
    expect(validateGa4Query({ ...base, filters: [{ dimension: 'secretKey', values: ['x'] }] }).ok).toBe(false)
    expect(validateGa4Query({ ...base, filters: [{ dimension: 'country', operator: 'regex', values: ['x'] }] }).ok).toBe(false)
  })

  test('filtro sin valores', () => {
    expect(validateGa4Query({ ...base, filters: [{ dimension: 'country', values: [] }] }).ok).toBe(false)
  })

  test('ordenar por algo que no se pidió', () => {
    expect(validateGa4Query({ ...base, orderBy: { metric: 'conversions' } }).ok).toBe(false)
    expect(validateGa4Query({ ...base, orderBy: { dimension: 'country' } }).ok).toBe(false)
  })

  test('nunca lanza: entradas basura devuelven ok:false', () => {
    for (const bad of [null, undefined, 'hola', 42, []]) {
      expect(() => validateGa4Query(bad)).not.toThrow()
      expect(validateGa4Query(bad).ok).toBe(false)
    }
  })
})

describe('orden por default', () => {
  test('un "top N" ordena por la primera métrica, de mayor a menor', () => {
    const { query } = validateGa4Query({ ...base, dimensions: ['country'], metrics: ['sessions', 'activeUsers'] })
    expect(query.orderBy).toEqual({ metric: 'sessions', desc: true })
  })

  test('una serie temporal ordena cronológicamente, no por volumen', () => {
    expect(validateGa4Query({ ...base, dimensions: ['yearMonth'] }).query.orderBy).toEqual({ dimension: 'yearMonth', desc: false })
    expect(validateGa4Query({ ...base, dimensions: ['date'] }).query.orderBy).toEqual({ dimension: 'date', desc: false })
  })
})

describe('toRunReportBody', () => {
  test('un solo valor exacto → stringFilter insensible a mayúsculas', () => {
    const { query } = validateGa4Query({ ...base, dimensions: ['country'], filters: [{ dimension: 'country', operator: 'exact', values: ['Chile'] }] })
    const body = toRunReportBody(query)
    expect(body.dimensionFilter.filter.fieldName).toBe('country')
    expect(body.dimensionFilter.filter.stringFilter).toEqual({ matchType: 'EXACT', value: 'Chile', caseSensitive: false })
  })

  test('varios valores exactos → inListFilter', () => {
    const { query } = validateGa4Query({ ...base, filters: [{ dimension: 'country', operator: 'exact', values: ['Chile', 'Perú'] }] })
    expect(toRunReportBody(query).dimensionFilter.filter.inListFilter.values).toEqual(['Chile', 'Perú'])
  })

  test('dos filtros se combinan con AND', () => {
    const { query } = validateGa4Query({
      ...base,
      filters: [
        { dimension: 'country', operator: 'exact', values: ['Chile'] },
        { dimension: 'deviceCategory', operator: 'exact', values: ['mobile'] },
      ],
    })
    expect(toRunReportBody(query).dimensionFilter.andGroup.expressions).toHaveLength(2)
  })

  test('siempre pide el total del período (la respuesta de la IA suele ser un solo número)', () => {
    expect(toRunReportBody(validateGa4Query(base).query).metricAggregations).toEqual(['TOTAL'])
  })

  test('sin dimensiones no manda la clave `dimensions` (GA4 rechaza un array vacío)', () => {
    expect(toRunReportBody(validateGa4Query(base).query)).not.toHaveProperty('dimensions')
  })
})

describe('buildCatalogPrompt', () => {
  test('el prompt se arma del mapa: no hay una segunda lista que mantener', () => {
    const prompt = buildCatalogPrompt()
    for (const key of Object.keys(DIMENSIONS)) expect(prompt).toContain(key)
    for (const key of Object.keys(METRICS)) expect(prompt).toContain(key)
  })
})
