# syntax=docker/dockerfile:1.7

FROM node:22.22.2-bookworm-slim AS node-base

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000

ENV HOME=/home/node \
    PNPM_HOME=/home/node/.local/share/pnpm \
    PATH=/home/node/.local/share/pnpm:${PATH}

RUN set -eu; \
    if [ "${LOCAL_UID}" = "0" ]; then echo "LOCAL_UID must not be 0" >&2; exit 1; fi; \
    if [ "$(getent group node | cut -d: -f3)" != "${LOCAL_GID}" ]; then \
      groupmod --non-unique --gid "${LOCAL_GID}" node; \
    fi; \
    if [ "$(id -u node)" != "${LOCAL_UID}" ] || [ "$(id -g node)" != "${LOCAL_GID}" ]; then \
      usermod --non-unique --uid "${LOCAL_UID}" --gid "${LOCAL_GID}" node; \
    fi; \
    mkdir -p /workspace /home/node/.cache/pnpm /home/node/.expo; \
    chown -R "${LOCAL_UID}:${LOCAL_GID}" /workspace /home/node

RUN npm install --global --no-audit --no-fund pnpm@11.24.0

WORKDIR /workspace
USER ${LOCAL_UID}:${LOCAL_GID}

COPY --chown=${LOCAL_UID}:${LOCAL_GID} package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/web/package.json apps/web/package.json
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/mobile/package.json apps/mobile/package.json
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/package.json packages/psgc/package.json
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/ui/package.json packages/ui/package.json

FROM node-base AS development

RUN --mount=type=cache,id=aqours-pnpm,target=/home/node/.cache/pnpm,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/home/node/.cache/pnpm

COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/web/ apps/web/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/mobile/ apps/mobile/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/ packages/psgc/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/ui/ packages/ui/
RUN mkdir -p /workspace/apps/mobile/.expo
COPY --chmod=755 docker/javascript/mobile-entrypoint.sh /usr/local/bin/mobile-entrypoint

EXPOSE 5173 8081

FROM node-base AS web-build

RUN --mount=type=cache,id=aqours-pnpm,target=/home/node/.cache/pnpm,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    pnpm install --frozen-lockfile --filter @aqours/web... --store-dir=/home/node/.cache/pnpm

COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/web/ apps/web/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/ packages/psgc/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/ui/ packages/ui/

ARG VITE_GEOAPIFY_API_KEY=
RUN --mount=type=cache,id=aqours-pnpm,target=/home/node/.cache/pnpm,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    VITE_GEOAPIFY_API_KEY="${VITE_GEOAPIFY_API_KEY}" pnpm --filter @aqours/ui typecheck \
    && VITE_GEOAPIFY_API_KEY="${VITE_GEOAPIFY_API_KEY}" pnpm --filter @aqours/web build

FROM nginx:1.30.6-alpine3.24 AS production

COPY --from=web-build --chown=101:101 /workspace/apps/web/dist/ /usr/share/nginx/html/
COPY docker/web/nginx.conf /etc/nginx/nginx.conf
COPY docker/web/site.conf.template /etc/nginx/site.conf.template
COPY --chmod=755 docker/web/entrypoint.sh /usr/local/bin/web-entrypoint
COPY --chmod=755 docker/web/healthcheck.sh /usr/local/bin/web-healthcheck

USER 101:101
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/web-entrypoint"]
