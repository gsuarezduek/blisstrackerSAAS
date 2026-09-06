const express = require('express')
const router = express.Router()
const blog = require('../controllers/blog.controller')

// Sin auth — blog público de la landing (blisstracker.app/blog)
router.get('/blog/:slug/meta', blog.getMeta) // metadata liviana para Open Graph (Vercel)
router.get('/blog/:slug', blog.getBySlug)
router.get('/blog', blog.list)
router.get('/blog-cover/:id', blog.serveCover)

module.exports = router
