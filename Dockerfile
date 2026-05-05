FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app

# Non-root user
RUN addgroup -S nodecal && adduser -S nodecal -G nodecal

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Writable dirs for config + cache overrides
RUN mkdir -p /config /cache && chown nodecal:nodecal /config /cache

USER nodecal
EXPOSE 3000
CMD ["node", "server/app.js"]
