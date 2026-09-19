const express = require('express')
const router = express.Router()
const { getSharedFolder, searchSharedFolder, downloadSharedFile } = require('../controllers/publicFiles.controller')

// Sin auth — link público de solo lectura para compartir una carpeta de
// Archivos (mismo criterio que /api/public/proposal/:token): quien tiene el
// link navega/descarga su contenido y el de sus subcarpetas, nunca nada fuera
// de ese subárbol (ver isWithinSharedTree en el controller).
router.get('/shared-folder/:token',                  getSharedFolder)
router.get('/shared-folder/:token/search',            searchSharedFolder)
router.get('/shared-folder/:token/download/:fileId',  downloadSharedFile)

module.exports = router
