FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
COPY tools/ tools/

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/shared/package.json shared/
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/shared/dist/ shared/dist/
COPY --from=builder /app/server/dist/ server/dist/
COPY --from=builder /app/server/src/data/ server/dist/data/
COPY --from=builder /app/client/dist/ client/dist/

RUN npm ci --omit=dev --workspace=shared --workspace=server

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567

CMD ["node", "server/dist/index.js"]
