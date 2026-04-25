# ---------- Stage 1: Dependencies ----------
FROM node:18-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production


# ---------- Stage 2: Runtime ----------
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

EXPOSE 5002

CMD ["npm", "start"]