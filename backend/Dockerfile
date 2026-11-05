FROM node:24-alpine AS admin-build

WORKDIR /admin
COPY admin-web/package.json admin-web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund
COPY admin-web ./
RUN npm run build

FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY --from=admin-build /public/admin ./public/admin

EXPOSE 5000
CMD ["npm", "start"]
