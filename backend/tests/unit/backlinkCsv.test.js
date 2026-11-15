const {
  parseBacklinkCsv, detectCsvFormat, detectSeparator, parseCsv, linkTypeFromRow,
} = require('../../src/lib/backlinksCsv')

describe('CSV — el parser crudo', () => {
  it('respeta las comas que están dentro de un campo citado', () => {
    // El caso más común y el que rompe el `split(',')` ingenuo: los títulos de
    // nota llevan comas.
    const rows = parseCsv('a,b\n"uno, con coma",dos\n', ',')
    expect(rows[1]).toEqual(['uno, con coma', 'dos'])
  })

  it('entiende la comilla escapada como doble comilla', () => {
    const rows = parseCsv('a\n"dijo ""hola"" fuerte"\n', ',')
    expect(rows[1][0]).toBe('dijo "hola" fuerte')
  })

  it('soporta un salto de línea DENTRO de un campo citado', () => {
    const rows = parseCsv('a,b\n"primera\nsegunda",x\n', ',')
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('primera\nsegunda')
  })

  it('trata CRLF igual que LF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n', ',')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('no inventa una fila con la línea vacía del final', () => {
    expect(parseCsv('a,b\n1,2\n\n', ',')).toHaveLength(2)
  })

  it('cierra la última fila aunque no termine en salto de línea', () => {
    expect(parseCsv('a,b\n1,2', ',')).toHaveLength(2)
  })

  it('conserva los campos vacíos, que son posición en la fila', () => {
    expect(parseCsv('a,b,c\n1,,3\n', ',')[1]).toEqual(['1', '', '3'])
  })
})

describe('CSV — separador', () => {
  it('detecta el punto y coma del Excel en español', () => {
    expect(detectSeparator('Referring page URL;Anchor;DR')).toBe(';')
  })

  it('detecta el tab', () => {
    expect(detectSeparator('Source url\tAnchor\tDR')).toBe('\t')
  })

  it('no se deja engañar por las comas de un título citado', () => {
    // Si contara las comas de adentro de las comillas, elegiría `,` sobre el `;`
    // real y leería todo el archivo en una sola columna.
    expect(detectSeparator('"Nota, con coma";Anchor;DR')).toBe(';')
  })

  it('con una sola columna cae a la coma sin romper', () => {
    expect(detectSeparator('Referring page URL')).toBe(',')
  })
})

describe('CSV — qué export es', () => {
  it('reconoce Ahrefs por su columna de página de referencia', () => {
    expect(detectCsvFormat(['Referring page URL', 'Target URL', 'Anchor', 'DR'])).toBe('ahrefs')
  })

  it('reconoce Semrush por su columna de source url', () => {
    expect(detectCsvFormat(['Source url', 'Target url', 'Anchor', 'Page ascore'])).toBe('semrush')
  })

  it('reconoce Search Console, que NO trae URL de origen', () => {
    expect(detectCsvFormat(['Sitio de origen', 'Enlaces entrantes'])).toBe('gsc')
    expect(detectCsvFormat(['Source site', 'Incoming links'])).toBe('gsc')
  })

  it('un export de Ahrefs que además traiga "Source site" no se confunde con GSC', () => {
    // GSC se decide por la AUSENCIA de URL de origen, no sólo por su columna.
    expect(detectCsvFormat(['Referring page URL', 'Source site'])).toBe('ahrefs')
  })

  it('tolera mayúsculas, tildes y guiones en los encabezados', () => {
    expect(detectCsvFormat(['URL de la página de referencia'])).toBe('ahrefs')
  })

  it('cualquier otro CSV con algo parecido a una URL entra como genérico', () => {
    expect(detectCsvFormat(['dominio', 'notas'])).toBe('generico')
  })

  it('sin ninguna columna reconocible devuelve null en vez de adivinar', () => {
    expect(detectCsvFormat(['nombre', 'apellido', 'telefono'])).toBeNull()
  })
})

describe('CSV — filas de Ahrefs', () => {
  const csv = [
    'Referring page URL,Target URL,Anchor,Domain rating,Domain traffic,First seen,Nofollow,Language',
    'https://www.diario.com/nota/,https://cliente.com/x,"la agencia",62,"12,500",2026-03-14,false,es',
    'https://blog.otro.com/review,https://cliente.com/y,reseña,45,800,2026-05-02,true,es',
  ].join('\n')

  it('normaliza la URL de origen y saca el dominio', () => {
    const { rows } = parseBacklinkCsv(csv)
    expect(rows[0].sourceUrl).toBe('https://diario.com/nota')
    expect(rows[0].sourceDomain).toBe('diario.com')
  })

  it('lee el DR, el tráfico con separador de miles y la fecha', () => {
    const { rows } = parseBacklinkCsv(csv)
    expect(rows[0]).toMatchObject({ domainRating: 62, traffic: 12500, language: 'es' })
    expect(rows[0].firstSeenAt.toISOString().slice(0, 10)).toBe('2026-03-14')
  })

  it('traduce la columna Nofollow a nuestro linkType', () => {
    const { rows } = parseBacklinkCsv(csv)
    expect(rows[0].linkType).toBe('follow')
    expect(rows[1].linkType).toBe('nofollow')
  })

  it('las filas de un export de enlaces son verificables', () => {
    expect(parseBacklinkCsv(csv).rows.every(r => r.verifiable)).toBe(true)
  })
})

describe('CSV — filas de Semrush', () => {
  const csv = [
    'Source url;Target url;Anchor;Page ascore;Nofollow;Sponsored;Ugc;First seen',
    'https://medio.com/post;https://cliente.com/;"nota sobre marketing";38;true;false;false;14/03/2026',
    'https://pago.com/aviso;https://cliente.com/;publicidad;20;true;true;false;02/05/2026',
  ].join('\n')

  it('lee el punto y coma y el Authority Score como DR', () => {
    const { format, rows } = parseBacklinkCsv(csv)
    expect(format).toBe('semrush')
    expect(rows[0].domainRating).toBe(38)
  })

  it('un enlace pago gana sobre el nofollow: lo que importa es que es pago', () => {
    expect(parseBacklinkCsv(csv).rows[1].linkType).toBe('sponsored')
  })

  it('entiende la fecha en formato DD/MM/YYYY', () => {
    const d = parseBacklinkCsv(csv).rows[0].firstSeenAt
    expect(d.toISOString().slice(0, 10)).toBe('2026-03-14')
  })
})

describe('CSV — Search Console, que agrega por dominio', () => {
  const csv = 'Sitio de origen,Enlaces entrantes\ndiario.com,42\nblog.otro.com,7\n'

  it('arma una URL sintética con el dominio, porque el reporte no trae la página', () => {
    const { format, rows } = parseBacklinkCsv(csv)
    expect(format).toBe('gsc')
    expect(rows[0]).toMatchObject({ sourceUrl: 'https://diario.com', sourceDomain: 'diario.com' })
  })

  it('nacen NO verificables: verificar la home daría "perdido" en casi todas', () => {
    expect(parseBacklinkCsv(csv).rows.every(r => r.verifiable === false)).toBe(true)
  })

  it('guarda cuántos enlaces reportó Google en la nota, que es el dato que sí trae', () => {
    expect(parseBacklinkCsv(csv).rows[0].notes).toContain('42')
  })

  it('no inventa un linkType que el reporte no informa', () => {
    expect(parseBacklinkCsv(csv).rows[0].linkType).toBe('unknown')
  })
})

describe('CSV — lo que no entra, y por qué', () => {
  it('una fila sin URL de origen se saltea con su número de línea', () => {
    const { rows, skipped } = parseBacklinkCsv('Referring page URL,Anchor\n,"sin url"\nhttps://x.com/a,ok\n')
    expect(rows).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ line: 2, reason: 'sin_url' })
  })

  it('una URL que no se puede parsear se informa con el valor que vino', () => {
    const { skipped } = parseBacklinkCsv('Referring page URL\njavascript:alert(1)\n')
    expect(skipped[0]).toMatchObject({ reason: 'url_invalida', value: 'javascript:alert(1)' })
  })

  it('respeta el tope de filas y reporta el resto como tope', () => {
    const lines = ['Referring page URL']
    for (let i = 0; i < 520; i++) lines.push(`https://sitio${i}.com/nota`)
    const { rows, skipped } = parseBacklinkCsv(lines.join('\n'), { target: 'own' })
    expect(rows).toHaveLength(500)
    expect(skipped.filter(s => s.reason === 'tope')).toHaveLength(20)
  })

  it('el tope de prospectos es más alto que el de enlaces propios', () => {
    const lines = ['Referring page URL']
    for (let i = 0; i < 600; i++) lines.push(`https://sitio${i}.com/nota`)
    expect(parseBacklinkCsv(lines.join('\n'), { target: 'prospects' }).rows).toHaveLength(600)
  })

  it('un archivo vacío devuelve un error legible, no una excepción', () => {
    expect(parseBacklinkCsv('   ').error).toMatch(/vacío/i)
  })

  it('un CSV sin columnas reconocibles explica qué falta y devuelve los encabezados', () => {
    const r = parseBacklinkCsv('nombre,apellido\nAna,Pérez\n')
    expect(r.error).toMatch(/columnas/i)
    expect(r.unmappedHeaders).toEqual(['nombre', 'apellido'])
  })

  it('informa las columnas que no supimos leer', () => {
    // Es la señal de que un export nuevo trae algo útil que no estamos usando.
    const r = parseBacklinkCsv('Referring page URL,Columna Rara\nhttps://x.com/a,valor\n')
    expect(r.unmappedHeaders).toEqual(['Columna Rara'])
  })
})

describe('CSV — detalles que vienen de los exports reales', () => {
  it('saca el BOM que escribe Excel', () => {
    const { format } = parseBacklinkCsv('﻿Referring page URL,Anchor\nhttps://x.com/a,y\n')
    expect(format).toBe('ahrefs')
  })

  it('un DR fuera de 0–100 es una columna mal mapeada: mejor null que un número falso', () => {
    const { rows } = parseBacklinkCsv('Referring page URL,DR\nhttps://x.com/a,99999\n')
    expect(rows[0].domainRating).toBeNull()
  })

  it('sin ninguna columna del rel el tipo queda en unknown, no en follow', () => {
    // Asumir follow mostraría autoridad que nadie verificó.
    const { rows } = parseBacklinkCsv('Referring page URL,Anchor\nhttps://x.com/a,y\n')
    expect(rows[0].linkType).toBe('unknown')
  })

  it('lee el tráfico escrito a la europea (1.234)', () => {
    const { rows } = parseBacklinkCsv('Referring page URL;Domain traffic\nhttps://x.com/a;1.234\n')
    expect(rows[0].traffic).toBe(1234)
  })

  it('el formato se puede forzar cuando la detección no acierta', () => {
    const r = parseBacklinkCsv('dominio,notas\ndiario.com,x\n', { format: 'gsc' })
    expect(r.format).toBe('gsc')
    expect(r.rows[0].sourceDomain).toBe('diario.com')
  })
})

describe('CSV — linkTypeFromRow aislado', () => {
  it('la columna Type con texto también sirve', () => {
    expect(linkTypeFromRow(['nofollow'], { linkTypeRaw: 0 })).toBe('nofollow')
    expect(linkTypeFromRow(['dofollow'], { linkTypeRaw: 0 })).toBe('follow')
  })

  it('un Nofollow vacío no decide nada', () => {
    expect(linkTypeFromRow([''], { nofollow: 0 })).toBe('unknown')
  })

  it('acepta "sí" y "1" como verdadero (exports en español)', () => {
    expect(linkTypeFromRow(['sí'], { nofollow: 0 })).toBe('nofollow')
    expect(linkTypeFromRow(['1'], { nofollow: 0 })).toBe('nofollow')
  })
})
