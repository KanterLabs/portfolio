# syntax=docker/dockerfile:1.7
FROM node:22.22.1-alpine3.23@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00 AS build

WORKDIR /build/site
COPY site/package.json site/package-lock.json ./
RUN npm ci
COPY site/ ./
ENV PUBLIC_CHAT_ENABLED=true
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.5-alpine3.23@sha256:42a7d7f2ee23e9f5a1dcdf3647ba5c585bbd18f79e79cd817e70e8cd61c55779

ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/KanterLabs/portfolio" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.description="Shane Kanterman's static portfolio"

ENV PORTFOLIO_X_ROBOTS_TAG=""
COPY container/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/site/dist/ /usr/share/nginx/html/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

