# Builds without a Dockerfile too (Railpack); this one exists to show the shape.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm's cache persists between builds, so unchanged dependencies are not downloaded again.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
# inngest names TypeScript as an optional peer, so npm keeps the compiler after pruning; the
# running app never uses it.
RUN npm run build && npm prune --omit=dev && rm -rf node_modules/typescript node_modules/@typescript

# The app runs on Google's distroless Node image: Node and the system libraries it needs, with no
# shell, package manager or other tools, so far fewer packages ever need a security update.
FROM gcr.io/distroless/nodejs24-debian13:nonroot
# The image starts node itself; on the PATH it also runs the migrate command from whisk.yaml.
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER nonroot
EXPOSE 8080
CMD ["dist/index.js"]
