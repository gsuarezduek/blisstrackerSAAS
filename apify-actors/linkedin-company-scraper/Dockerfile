# Base de Apify con Node 20 + Playwright + Chrome ya instalado.
# Ver: https://docs.apify.com/sdk/js/docs/guides/docker-images
FROM apify/actor-node-playwright-chrome:20

# Copiar manifests primero para aprovechar la cache de Docker
COPY --chown=myuser package*.json ./

# Solo dependencias de producción; --silent para que el build no se confunda
# con warnings de npm y marque exitoso
RUN npm install --omit=dev --omit=optional \
 && echo "Installed NPM packages:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# Copiar el resto del proyecto
COPY --chown=myuser . ./

# Ejecutar el actor
CMD ["npm", "start", "--silent"]
