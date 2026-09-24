const { normalizeBrief, sanitizeBriefing, briefingToPrompt, SECTION_KEYS } = require('../../src/lib/proposalBrief')

describe('normalizeBrief', () => {
  it('tolera basura y devuelve todas las secciones del catálogo incluidas por defecto', () => {
    const b = normalizeBrief(null)
    expect(b.questions).toEqual([])
    expect(b.sections.map(s => s.key)).toEqual(SECTION_KEYS)
    expect(b.sections.every(s => s.include)).toBe(true)
  })

  it('descarta preguntas sin texto o con menos de 2 opciones, y topea a 6', () => {
    const q = (i, extra = {}) => ({ id: `q${i}`, question: `¿P${i}?`, kind: 'single', options: ['a', 'b'], ...extra })
    const b = normalizeBrief({
      questions: [q(1), q(2, { question: '' }), q(3, { options: ['solo una'] }), ...[4, 5, 6, 7, 8, 9, 10].map(i => q(i))],
    })
    expect(b.questions).toHaveLength(6)
    expect(b.questions.map(x => x.id)).not.toContain('q2')
    expect(b.questions.map(x => x.id)).not.toContain('q3')
  })

  it('una pregunta de texto no lleva opciones y "recommended" debe ser una de las options', () => {
    const b = normalizeBrief({ questions: [
      { question: 'Libre', kind: 'text', options: ['x', 'y'] },
      { question: 'Elegir', kind: 'single', options: ['a', 'b'], recommended: 'inventada' },
      { question: 'Elegir 2', kind: 'single', options: ['a', 'b'], recommended: 'b' },
    ] })
    expect(b.questions[0].options).toEqual([])
    expect(b.questions[1].recommended).toEqual([])
    expect(b.questions[2].recommended).toEqual(['b'])
  })

  it('respeta include:false de la IA y descarta claves fuera del catálogo', () => {
    const b = normalizeBrief({ sections: [{ key: 'mix', include: false, reason: 'sin redes' }, { key: 'hack', include: false }] })
    expect(b.sections.find(s => s.key === 'mix')).toMatchObject({ include: false, reason: 'sin redes' })
    expect(b.sections.find(s => s.key === 'hack')).toBeUndefined()
    expect(b.sections.find(s => s.key === 'challenge').include).toBe(true)
  })
})

describe('sanitizeBriefing / briefingToPrompt', () => {
  it('devuelve null si no hay nada útil', () => {
    expect(sanitizeBriefing(null)).toBeNull()
    expect(sanitizeBriefing({ answers: [{ question: 'x', answer: '' }] })).toBeNull()
  })

  it('filtra secciones inválidas y una sección no puede estar incluida y excluida a la vez', () => {
    const b = sanitizeBriefing({ includeSections: ['mix', 'hack'], excludeSections: ['mix', 'expansion'] })
    expect(b.excludeSections).toEqual(['mix', 'expansion'])
    expect(b.includeSections).toEqual([])
  })

  it('arma el bloque de prompt con decisiones y secciones', () => {
    const t = briefingToPrompt(sanitizeBriefing({
      answers: [{ question: '¿Ángulo?', answer: 'Elaboración propia' }],
      excludeSections: ['expansion'],
    }))
    expect(t).toContain('¿Ángulo?')
    expect(t).toContain('Elaboración propia')
    expect(t).toContain('NO debe tener')
    expect(t).toContain('Historia de expansión')
  })
})
