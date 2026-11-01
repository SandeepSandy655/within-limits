FROM node:22-alpine AS admin-build

WORKDIR /admin
COPY admin-web/package.json admin-web/package-lock.json ./
RUN npm ci
COPY admin-web ./
RUN npm run build

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY --from=admin-build /public/admin ./public/admin

EXPOSE 5000
CMD ["npm", "start"]
