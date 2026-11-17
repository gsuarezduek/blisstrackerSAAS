// La tarjeta "Autoridad y enlaces" del informe al cliente. Dos cosas que se afirman
// acá: que el Domain Rating se cuenta en PUNTOS (no en porcentaje, que es lo que hace
// DeltaChip con todo lo demás) y que la tarjeta no publica nada del trabajo interno.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthorityCard } from '../../components/marketing/ReportViewerSections'

const a = (over = {}) => ({
  domainRating: 44, avgDomainRating: 38.2, referringDomains: 40,
  activeLinks: 52, followLinks: 30, newLinks: 5, lostLinks: 1,
  delta: null, ...over,
})

describe('tarjeta de autoridad — los números', () => {
  it('muestra el DR, los dominios y lo ganado y perdido del período', () => {
    render(<AuthorityCard a={a()} />)
    expect(screen.getByText('Autoridad y enlaces')).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('Enlaces nuevos')).toBeInTheDocument()
    expect(screen.getByText('Enlaces perdidos')).toBeInTheDocument()
  })

  it('sin Domain Rating no deja un KPI vacío en la grilla', () => {
    // Un proyecto sin la key de Ahrefs no tiene DR. Un "—" grande al lado de los otros
    // tres números se lee como "el DR es cero", que es lo peor que podría decir.
    render(<AuthorityCard a={a({ domainRating: null })} />)
    expect(screen.queryByText('Domain Rating')).not.toBeInTheDocument()
  })

  it('aclara cuántos de los enlaces transfieren autoridad', () => {
    render(<AuthorityCard a={a()} />)
    expect(screen.getByText(/30 de 52 transfieren autoridad/)).toBeInTheDocument()
  })
})

describe('tarjeta de autoridad — la variación del Domain Rating', () => {
  it('la expresa en puntos y no en porcentaje', () => {
    // El DR es una escala 0–100: "+7,3%" sobre 41 no le dice nada a nadie.
    render(<AuthorityCard a={a({ delta: { domainRating: 3, referringDomains: 25, activeLinks: 30 } })} />)
    expect(screen.getByText(/subió/)).toBeInTheDocument()
    expect(screen.getByText('3 puntos')).toBeInTheDocument()
  })

  it('usa el singular con un solo punto', () => {
    render(<AuthorityCard a={a({ delta: { domainRating: 1 } })} />)
    expect(screen.getByText('1 punto')).toBeInTheDocument()
  })

  it('dice que bajó cuando bajó', () => {
    render(<AuthorityCard a={a({ delta: { domainRating: -2 } })} />)
    expect(screen.getByText(/bajó/)).toBeInTheDocument()
    expect(screen.getByText('2 puntos')).toBeInTheDocument()
  })

  it('sin variación no escribe una línea que diga nada', () => {
    render(<AuthorityCard a={a({ delta: { domainRating: 0 } })} />)
    expect(screen.queryByText(/El Domain Rating/)).not.toBeInTheDocument()
  })
})

describe('tarjeta de autoridad — lo que no se le muestra al cliente', () => {
  it('ignora cualquier dato de prospectos que llegue en el objeto', () => {
    // La garantía la da el backend (el builder no los lee), pero si alguien algún día
    // le mete el pipeline al payload, la tarjeta tampoco lo pinta.
    render(<AuthorityCard a={a({
      pipelineStatus: 'negociando', cost: 45000, verdictReason: 'NO-PUBLICAR',
      reportedDomains: 412,
    })} />)
    expect(screen.queryByText(/NO-PUBLICAR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/negociando/)).not.toBeInTheDocument()
    expect(screen.queryByText(/45000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/412/)).not.toBeInTheDocument()
  })

  it('describe los enlaces como los que seguimos, no como el perfil completo', () => {
    // Nuestro inventario casi nunca es todo el perfil del sitio: si la tarjeta dijera
    // "tus backlinks", un cliente que mira Ahrefs creería que el número está mal.
    render(<AuthorityCard a={a()} />)
    expect(screen.getByText(/seguimos y verificamos/)).toBeInTheDocument()
  })
})
