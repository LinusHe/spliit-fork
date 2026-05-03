# syntax=docker/dockerfile:1.7

FROM node:21-alpine AS base

WORKDIR /usr/app
COPY ./package.json \
     ./package-lock.json \
     ./next.config.mjs \
     ./tsconfig.json \
     ./reset.d.ts \
     ./tailwind.config.js \
     ./postcss.config.js ./
COPY ./prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/prisma \
    apk add --no-cache openssl && \
    npm ci --ignore-scripts --prefer-offline && \
    npx prisma generate

COPY ./scripts ./scripts
COPY ./src ./src
COPY ./messages ./messages

ENV NEXT_TELEMETRY_DISABLED=1

ARG BUILD_VERSION=0
ARG BUILD_HASH=unknown
ARG BUILD_DATE=unknown
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_HASH=${BUILD_HASH}
ENV BUILD_DATE=${BUILD_DATE}

COPY ./public ./public
COPY scripts/build.env .env
RUN sh scripts/generate-version.sh && npm run build

RUN rm -r .next/cache

FROM node:21-alpine AS runtime-deps

WORKDIR /usr/app
COPY --from=base /usr/app/package.json /usr/app/package-lock.json /usr/app/next.config.mjs ./
COPY --from=base /usr/app/prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/prisma \
    npm ci --omit=dev --omit=optional --ignore-scripts --prefer-offline && \
    npx prisma generate

FROM node:21-alpine AS runner

EXPOSE 3000/tcp
WORKDIR /usr/app

COPY --from=base /usr/app/package.json /usr/app/package-lock.json /usr/app/next.config.mjs ./
COPY --from=runtime-deps /usr/app/node_modules ./node_modules
COPY --from=base /usr/app/public ./public
COPY ./scripts ./scripts
COPY --from=base /usr/app/prisma ./prisma
COPY --from=base /usr/app/.next ./.next

ENTRYPOINT ["/bin/sh", "/usr/app/scripts/container-entrypoint.sh"]
