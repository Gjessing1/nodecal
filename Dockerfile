FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app

# su-exec lets the entrypoint drop from root to nodecal after chowning mounted volumes
RUN apk add --no-cache su-exec
RUN addgroup -S nodecal && adduser -S nodecal -G nodecal

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /config /cache

EXPOSE 3000
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/app.js"]
