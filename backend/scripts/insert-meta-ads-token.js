/**
 * Script de uso único para insertar un System User Token de Meta Ads
 * directamente en la DB (sin pasar por OAuth).
 *
 * Uso:
 *   SYSTEM_TOKEN=<token> AD_ACCOUNT_ID=act_<id> PROJECT_ID=<id> node scripts/insert-meta-ads-token.js
 *
 * Ejemplo:
 *   SYSTEM_TOKEN=EAABwzLixnjYBO... AD_ACCOUNT_ID=act_123456789 PROJECT_ID=62 node scripts/insert-meta-ads-token.js
 */

require('dotenv').config()
const prisma      = require('../src/lib/prisma')
const { encrypt } = require('../src/lib/encryption')

async function main() {
  const token       = process.env.SYSTEM_TOKEN
  const adAccountId = process.env.AD_ACCOUNT_ID  // con prefijo "act_"
  const projectId   = Number(process.env.PROJECT_ID)

  // Sin PROJECT_ID → listar proyectos disponibles
  if (!projectId) {
    const projects = await prisma.project.findMany({
      select: { id: true, name: true, workspaceId: true },
      orderBy: { id: 'asc' },
    })
    console.log('Proyectos disponibles:')
    projects.forEach(p => console.log(`  ID: ${p.id} | workspaceId: ${p.workspaceId} | nombre: ${p.name}`))
    return
  }

  if (!token || !adAccountId) {
    console.error('Faltan variables: SYSTEM_TOKEN, AD_ACCOUNT_ID')
    process.exit(1)
  }

  // System User Tokens no vencen → expiresAt lejano
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  const project = await prisma.project.findUnique({
    where:  { id: projectId },
    select: { id: true, workspaceId: true },
  })
  if (!project) { console.error(`Proyecto ${projectId} no encontrado`); process.exit(1) }

  const result = await prisma.projectIntegration.upsert({
    where:  { projectId_type: { projectId, type: 'meta_ads' } },
    update: {
      workspaceId: project.workspaceId,
      status:      'active',
      propertyId:  adAccountId,
      accessToken: encrypt(token),
      refreshToken: null,
      expiresAt,
      scopes:      'ads_read',
      connectedAt: new Date(),
    },
    create: {
      projectId,
      workspaceId:  project.workspaceId,
      type:         'meta_ads',
      status:       'active',
      propertyId:   adAccountId,
      accessToken:  encrypt(token),
      refreshToken: null,
      expiresAt,
      scopes:       'ads_read',
      connectedAt:  new Date(),
    },
  })

  console.log('Integración Meta Ads insertada:')
  console.log('  projectId:  ', result.projectId)
  console.log('  propertyId: ', result.propertyId)
  console.log('  status:     ', result.status)
  console.log('  expiresAt:  ', result.expiresAt)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
