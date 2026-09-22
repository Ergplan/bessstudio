# BESS Studio as a container.
#
# The application is a static export — Next.js with `output: 'export'` — so the runtime is a web
# server and nothing more. No Node process, no database, no state on disk. That is why the runtime
# stage is nginx and why the compose file below declares no volumes: there is nothing to persist.
#
# The Firebase web configuration is public by design (it identifies the project and authorises
# nothing; Firestore rules are what protect the data), so it is baked in at build time. A different
# project can be targeted with --build-arg without editing code.

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""
ARG NEXT_PUBLIC_PUBLIC_ORG_ID=""
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
    NEXT_PUBLIC_PUBLIC_ORG_ID=$NEXT_PUBLIC_PUBLIC_ORG_ID

RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine AS serve
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
