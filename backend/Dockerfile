# Stage 1: install everything and compile TypeScript.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: only what's needed to run, as a non-root user.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
# Bring the database schema up to date, then start the API (and its background worker).
CMD ["sh", "-c", "node scripts/migrate.js && node dist/main"]
