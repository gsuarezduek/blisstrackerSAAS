/**
 * Catálogo de Feature Flags de BlissTracker.
 *
 * Agregar un nuevo flag aquí es suficiente: al arrancar el servidor se hace
 * upsert automático en la DB. Desde el panel SuperAdmin se gestiona qué
 * workspaces tienen acceso — nunca es necesario "crear" un flag manualmente.
 *
 * Campos:
 *   key         — identificador único (snake_case), usado en useFeatureFlag('key')
 *   name        — nombre legible para el panel SuperAdmin
 *   description — qué hace esta funcionalidad
 */
const FEATURE_FLAGS = [
  {
    key: 'marketing',
    name: 'Sección Marketing',
    description: 'Módulos de marketing asociados a proyectos: GEO (optimización para motores IA), SEO, anuncios y más.',
  },
  {
    key: 'eos',
    name: 'Sección EOS',
    description: 'Sistema Entrepreneurial Operating System basado en el libro Traction de Gino Wickman. Incluye Visión, Personas, Datos, Asuntos, Procesos y Tracción.',
  },
]

module.exports = { FEATURE_FLAGS }
