/**
 * Cuentas publicitarias de una integración de Meta Ads.
 *
 * Una conexión `meta_ads` puede tener más de una cuenta (ej. un cliente con dos
 * sucursales, cada una con su cuenta de ads, que comparten Instagram). Las cuentas
 * viven en `ProjectIntegration.adAccounts` (JSON [{ id, name, currency }]); cuando
 * es null es el caso de siempre: una sola cuenta, la de `propertyId`.
 *
 * Todo el que necesite saber qué cuentas tiene una integración pasa por acá, nunca
 * lee `propertyId` a mano — si no, la segunda cuenta queda afuera en silencio.
 */

/** @returns {{ id: string, name: string|null, currency: string|null }[]} */
function getMetaAdAccounts(integration) {
  if (!integration) return []
  if (integration.adAccounts) {
    try {
      const list = JSON.parse(integration.adAccounts)
      if (Array.isArray(list)) {
        const clean = list
          .filter(a => a && typeof a.id === 'string' && a.id)
          .map(a => ({ id: a.id, name: a.name ?? null, currency: a.currency ?? null }))
        if (clean.length > 0) return clean
      }
    } catch { /* JSON roto: caer a propertyId */ }
  }
  return integration.propertyId ? [{ id: integration.propertyId, name: null, currency: null }] : []
}

/**
 * Lo que se guarda en `adAccounts` al conectar/reconectar con una sola cuenta elegida.
 * Si la cuenta ya era parte de la lista (ej. reconectar porque venció el token), la
 * lista se conserva — sin esto, renovar el token borraría la segunda sucursal. Si es
 * una cuenta nueva, se vuelve al caso de una sola cuenta.
 */
function adAccountsOnReconnect(existing, chosenId) {
  const current = getMetaAdAccounts(existing)
  if (current.length > 1 && current.some(a => a.id === chosenId)) {
    // La elegida queda primera: es la que se guarda en propertyId.
    const ordered = [current.find(a => a.id === chosenId), ...current.filter(a => a.id !== chosenId)]
    return { propertyId: chosenId, adAccounts: JSON.stringify(ordered) }
  }
  return { propertyId: chosenId, adAccounts: null }
}

module.exports = { getMetaAdAccounts, adAccountsOnReconnect }
