/**
 * Carga el artículo de ejemplo del blog (`BlogPost`), para que /blog y /blog/:slug del
 * sitio público tengan contenido real con el que verificarse.
 *
 * El blog no es Markdown en el repo: los artículos viven en la DB y se editan desde
 * SuperAdmin → Landing → Blog. Por eso el "artículo de ejemplo" es una fila, y esto es
 * un script de uso único como el resto de scripts/.
 *
 * Es idempotente: si el slug ya existe, lo actualiza en vez de crear un duplicado.
 *
 * Uso: DATABASE_URL="..." node scripts/seed-blog-example.js
 */

require('dotenv').config()
const prisma = require('../src/lib/prisma')

const SLUG = 'como-separar-el-sitio-publico-de-la-app'

const CONTENT_HTML = `
<p>Durante mucho tiempo, la landing de BlissTracker, las páginas de producto y la aplicación vivieron en el mismo lugar: una sola aplicación de React que se descargaba entera, sin importar si el visitante venía a leer qué hacemos o a trabajar en sus tareas del día.</p>

<h2>Por qué eso es un problema</h2>

<p>Para una persona, la diferencia se nota como lentitud: hay que descargar y ejecutar el código de todo el sistema antes de ver el primer título. Para un buscador, el problema es más grave: lo que recibe es un documento casi vacío, porque el texto aparece recién cuando el navegador ejecuta el JavaScript.</p>

<p>El resultado es que una página que para una persona está llena de contenido, para un buscador tiene unas pocas palabras. Y si todas las direcciones comparten el mismo título y la misma descripción, no hay forma de que ninguna compita por una búsqueda concreta.</p>

<h2>Qué cambiamos</h2>

<ul>
  <li><strong>El sitio público se renderiza en el servidor.</strong> El HTML sale armado, con su título, su descripción y su contenido ya escritos.</li>
  <li><strong>Cada página tiene su propia identidad.</strong> Título, descripción y dirección canónica propios, en lugar de una copia de la home.</li>
  <li><strong>La aplicación quedó en su propio subdominio.</strong> Sigue siendo una aplicación de una sola página, que es lo correcto para una herramienta de trabajo.</li>
  <li><strong>Las direcciones que no existen devuelven un error 404 de verdad</strong>, en lugar de llevar silenciosamente a la portada.</li>
</ul>

<h2>Lo que aprendimos</h2>

<p>La conclusión que nos llevamos no es técnica sino de encuadre: un sitio público y una aplicación de trabajo tienen exigencias opuestas. Al sitio público se le pide que la primera visita sea instantánea y que un buscador lo entienda sin ejecutar nada. A la aplicación se le pide que, una vez que entrás, moverse entre secciones no recargue la página.</p>

<p>Querer cumplir las dos cosas con la misma pieza de software es lo que nos tenía con una landing lenta y mal indexada. Separarlas no fue sumar complejidad: fue dejar de pedirle a cada parte algo que no le corresponde.</p>
`.trim()

async function main() {
  const data = {
    title:       'Cómo separamos el sitio público de la aplicación (y por qué importaba)',
    excerpt:     'La landing y la app vivían en el mismo lugar, y eso las perjudicaba a las dos. Qué cambiamos, por qué, y qué aprendimos en el camino.',
    contentHtml: CONTENT_HTML,
    status:      'published',
    metaTitle:   'Cómo separamos el sitio público de la aplicación',
    metaDescription: 'La landing y la app vivían en la misma aplicación de React y eso perjudicaba a las dos. Qué cambiamos para que el sitio público cargue rápido y Google lo entienda.',
    authorName:  'Equipo BlissTracker',
  }

  const existing = await prisma.blogPost.findUnique({ where: { slug: SLUG } })

  if (existing) {
    const post = await prisma.blogPost.update({
      where: { slug: SLUG },
      // publishedAt no se pisa: se fija la primera vez que el post pasa a publicado.
      data,
    })
    console.log('Artículo actualizado:', post.id, post.slug)
  } else {
    const post = await prisma.blogPost.create({
      data: { ...data, slug: SLUG, publishedAt: new Date() },
    })
    console.log('Artículo creado:', post.id, post.slug)
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
