/**
 * Corre el seed de avatares solo si la tabla Avatar está vacía.
 * Diseñado para ejecutarse en el script "start" de Railway.
 */

const { PrismaClient } = require('@prisma/client')
const path = require('path')
const fs   = require('fs')

const prisma = new PrismaClient()

const AVATARS = [
  { filename: '1babee.png',         label: 'Baby Bee',        order: 1  },
  { filename: '2bee.png',           label: 'Bee',             order: 2  },
  { filename: '10beemate.png',      label: 'Bee Mate',        order: 3  },
  { filename: '11beeartist.png',    label: 'Bee Artista',     order: 4  },
  { filename: '12beecoffee.png',    label: 'Bee Coffee',      order: 5  },
  { filename: '13beecorp.png',      label: 'Bee Corp',        order: 6  },
  { filename: '14beefitness.png',   label: 'Bee Fitness',     order: 7  },
  { filename: '15futbee.png',       label: 'Fut Bee',         order: 8  },
  { filename: '16beeloween.png',    label: 'Bee-loween',      order: 9  },
  { filename: '17beepunk.png',      label: 'Bee Punk',        order: 10 },
  { filename: '18golfbee.png',      label: 'Golf Bee',        order: 11 },
  { filename: '19beenfluencer.png', label: 'Bee-nfluencer',   order: 12 },
  { filename: '20beecypher.png',    label: 'Bee Cypher',      order: 13 },
  { filename: '21beegamer.png',     label: 'Bee Gamer',       order: 14 },
  { filename: '22beehacker.png',    label: 'Bee Hacker',      order: 15 },
  { filename: '23beeJ.png',         label: 'Bee J',           order: 16 },
  { filename: '30harleybee.png',    label: 'Harley Bee',      order: 17 },
  { filename: '31beezen.png',       label: 'Bee Zen',         order: 18 },
  { filename: '32beezombie.png',    label: 'Bee Zombie',      order: 19 },
  { filename: '33darthbee.png',     label: 'Darth Bee',       order: 20 },
  { filename: '34beeBorg.png',      label: 'Bee Borg',        order: 21 },
  { filename: '35beempire.png',     label: 'Bee-mpire',       order: 22 },
  { filename: '36beecodelica.png',  label: 'Bee-codelica',    order: 23 },
]

// Las imágenes están en prisma/seeds/perfiles/ para que estén disponibles en Railway
const IMAGES_DIR = path.join(__dirname, 'perfiles')

async function run() {
  const count = await prisma.avatar.count()
  if (count > 0) {
    console.log(`[avatar-seed] Tabla ya poblada (${count} avatares). Saltando.`)
    return
  }

  if (!fs.existsSync(IMAGES_DIR)) {
    console.warn(`[avatar-seed] Directorio de imágenes no encontrado: ${IMAGES_DIR}. Saltando seed.`)
    return
  }

  console.log('[avatar-seed] Tabla vacía, insertando avatares...')
  let created = 0
  let skipped = 0

  for (const meta of AVATARS) {
    const imgPath = path.join(IMAGES_DIR, meta.filename)

    if (!fs.existsSync(imgPath)) {
      console.warn(`[avatar-seed]   ⚠  Archivo no encontrado, saltando: ${meta.filename}`)
      skipped++
      continue
    }

    const imageData = fs.readFileSync(imgPath)
    const ext = path.extname(meta.filename).toLowerCase()
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
    const mimeType = mimeMap[ext] ?? 'image/png'

    await prisma.avatar.upsert({
      where:  { filename: meta.filename },
      create: { filename: meta.filename, label: meta.label, order: meta.order, active: true, imageData, mimeType },
      update: { label: meta.label, order: meta.order, imageData, mimeType },
    })

    console.log(`[avatar-seed]   ✓  ${meta.filename}`)
    created++
  }

  console.log(`[avatar-seed] Listo: ${created} avatares insertados, ${skipped} saltados.`)
}

run()
  .catch(e => {
    // No matar el proceso — el seed es opcional, el servidor debe arrancar igual
    console.error('[avatar-seed] Error (no crítico):', e.message)
  })
  .finally(() => prisma.$disconnect())
