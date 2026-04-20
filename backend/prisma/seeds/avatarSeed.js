/**
 * Seed de avatares: lee los archivos PNG de frontend/public/perfiles/
 * y los inserta en la tabla Avatar de la DB.
 *
 * Uso: node prisma/seeds/avatarSeed.js
 *
 * Idempotente: si un avatar ya existe (por filename), lo actualiza solo si la imagen cambió.
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

// Ruta al directorio de imágenes (relativo al repo root)
const IMAGES_DIR = path.join(__dirname, '../../../frontend/public/perfiles')

async function run() {
  console.log('Seeding avatares...')
  let created = 0
  let skipped = 0

  for (const meta of AVATARS) {
    const imgPath = path.join(IMAGES_DIR, meta.filename)

    if (!fs.existsSync(imgPath)) {
      console.warn(`  ⚠  Archivo no encontrado, saltando: ${meta.filename}`)
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

    console.log(`  ✓  ${meta.filename} (${meta.label})`)
    created++
  }

  console.log(`\nListo: ${created} avatares insertados/actualizados, ${skipped} saltados.`)
}

run()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
