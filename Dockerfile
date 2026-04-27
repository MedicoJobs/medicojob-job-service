# ---------- Stage 1: Dependencies ----------
FROM node:18-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev


# ---------- Stage 2: Runtime ----------
FROM node:18-alpine AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=deps --chown=root:root --chmod=0555 /usr/src/app/node_modules ./node_modules

COPY --chown=root:root --chmod=0444 package*.json ./
COPY --chown=root:root --chmod=0444 server.js ./
COPY --chown=root:root --chmod=0555 routes ./routes
COPY --chown=root:root --chmod=0555 controllers ./controllers
COPY --chown=root:root --chmod=0555 middleware ./middleware
COPY --chown=root:root --chmod=0555 models ./models

USER node

EXPOSE 5002
CMD ["npm", "start"]
