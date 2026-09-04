FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=optional
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
EXPOSE 8787
CMD ["npx", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--ip", "0.0.0.0"]
