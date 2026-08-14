FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --no-audit/--no-fund drop network round-trips that add nothing to a CI build
RUN npm ci --omit=dev --no-audit --no-fund

# Quality gates that need devDependencies (prettier/eslint) run in a throwaway
# stage so the final image never ships them. A red check fails `docker build`,
# so a broken commit can never produce a pushed image.
FROM node:22-alpine AS check
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run format:check && npm run lint && npm run typecheck && NODECAL_SKIP_ANDROID_TESTS=1 npm test

FROM node:22-alpine
WORKDIR /app

# su-exec lets the entrypoint drop from root to nodecal after chowning mounted volumes
RUN apk add --no-cache su-exec
RUN addgroup -S nodecal && adduser -S nodecal -G nodecal

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pull one file from the check stage so the final image cannot build unless the
# checks passed (stages otherwise build independently under BuildKit).
COPY --from=check /app/package.json /tmp/.checks-passed

# Re-run tests against prod-only node_modules: catches server code accidentally
# requiring a devDependency, which the check stage (full install) would miss.
RUN NODECAL_SKIP_ANDROID_TESTS=1 npm test

RUN mkdir -p /config /cache

EXPOSE 3000
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/app.js"]
