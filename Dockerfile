FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --no-audit/--no-fund drop network round-trips that add nothing to a CI build
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app

# su-exec lets the entrypoint drop from root to nodecal after chowning mounted volumes
RUN apk add --no-cache su-exec
RUN addgroup -S nodecal && adduser -S nodecal -G nodecal

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Quality gate folded into the build: a red test run fails `docker build`, so a
# broken commit can never produce a pushed image. Tests use Node's built-in
# runner and the prod deps only — no devDependencies needed.
RUN npm test

RUN mkdir -p /config /cache

EXPOSE 3000
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/app.js"]
