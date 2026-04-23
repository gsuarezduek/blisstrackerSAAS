const Stripe = require('stripe')

// Si la key no está configurada, devolvemos un objeto nulo para que el servidor
// arranque sin crash — las rutas de billing mostrarán error descriptivo.
const key = process.env.STRIPE_SECRET_KEY || ''
const stripe = key ? new Stripe(key, { apiVersion: '2024-04-10' }) : null

module.exports = stripe
