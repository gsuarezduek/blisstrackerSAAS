import { describe, it, expect } from 'vitest'
import { initialBriefState, buildBriefing } from '../../components/ventas/ProposalBriefStep'

const brief = {
  questions: [
    { id: 'q1', question: '¿Plan?', kind: 'single', options: ['Inicial', 'Crecimiento'], recommended: ['Crecimiento'] },
    { id: 'q2', question: '¿Tono?', kind: 'multi', options: ['Barrial', 'Premium'], recommended: [] },
  ],
  sections: [
    { key: 'challenge', label: 'Desafío', include: true },
    { key: 'expansion', label: 'Expansión', include: false },
    { key: 'mix', label: 'Mix', include: true },
  ],
}

describe('initialBriefState', () => {
  it('preselecciona la opción recomendada y respeta include de cada sección', () => {
    const st = initialBriefState(brief)
    expect(st.answers.q1.selected).toEqual(['Crecimiento'])
    expect(st.answers.q2.selected).toEqual([])
    expect(st.sections).toEqual({ challenge: true, expansion: false, mix: true })
  })
})

describe('buildBriefing', () => {
  it('solo manda respuestas con contenido y combina opción + aclaración', () => {
    const st = initialBriefState(brief)
    st.answers.q1.text = 'con foco en apertura'
    const b = buildBriefing(brief, st)
    expect(b.answers).toEqual([{ question: '¿Plan?', answer: 'Crecimiento — con foco en apertura' }])
  })

  it('agrega la información adicional como una respuesta más', () => {
    const st = initialBriefState(brief)
    st.extra = 'Tienen 4 locales'
    expect(buildBriefing(brief, st).answers.at(-1)).toEqual({ question: 'Información adicional del ejecutivo comercial', answer: 'Tienen 4 locales' })
  })

  it('include solo lleva lo que el usuario prendió contra la IA; exclude lo que apagó', () => {
    const st = initialBriefState(brief)
    st.sections.expansion = true // la IA lo había descartado
    st.sections.mix = false // el usuario lo apaga
    const b = buildBriefing(brief, st)
    expect(b.includeSections).toEqual(['expansion'])
    expect(b.excludeSections).toEqual(['mix'])
  })
})
