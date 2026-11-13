# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/dotnet/sdk:10.0.404@sha256:fe0fd4e93bd2fbb47c883b7a6369e5c8d3db8bf01cdc5981f6ee35fbdf3ff4fb AS restore

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000

ENV HOME=/home/aqours \
    DOTNET_CLI_HOME=/home/aqours \
    NUGET_PACKAGES=/home/aqours/.nuget/packages \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1

RUN set -eux; \
    if [ "${LOCAL_UID}" = 0 ]; then echo "LOCAL_UID must not be 0" >&2; exit 1; fi; \
    if getent group "${LOCAL_GID}" >/dev/null; then \
      group_name="$(getent group "${LOCAL_GID}" | cut -d: -f1)"; \
    else \
      groupadd --gid "${LOCAL_GID}" aqours; \
      group_name=aqours; \
    fi; \
    if getent passwd "${LOCAL_UID}" >/dev/null; then \
      user_name="$(getent passwd "${LOCAL_UID}" | cut -d: -f1)"; \
      if [ "${user_name}" = root ]; then echo "LOCAL_UID must not be 0" >&2; exit 1; fi; \
      usermod --gid "${group_name}" --home /home/aqours "${user_name}"; \
    else \
      useradd --uid "${LOCAL_UID}" --gid "${group_name}" --create-home --home-dir /home/aqours --shell /bin/bash aqours; \
    fi; \
    install -d -o "${LOCAL_UID}" -g "${LOCAL_GID}" \
      /workspace \
      /out \
      /home/aqours/.nuget/packages \
      /home/aqours/.aspnet/DataProtection-Keys \
      /workspace/apps/api/src/Aqours.Api/bin \
      /workspace/apps/api/src/Aqours.Api/obj \
      /workspace/apps/api/src/Aqours.Application/bin \
      /workspace/apps/api/src/Aqours.Application/obj \
      /workspace/apps/api/src/Aqours.Domain/bin \
      /workspace/apps/api/src/Aqours.Domain/obj \
      /workspace/apps/api/src/Aqours.Infrastructure/bin \
      /workspace/apps/api/src/Aqours.Infrastructure/obj; \
    chown -R "${LOCAL_UID}:${LOCAL_GID}" /home/aqours

WORKDIR /workspace

COPY --chown=${LOCAL_UID}:${LOCAL_GID} global.json dotnet-tools.json ./
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/Aqours.Api/Aqours.Api.csproj apps/api/src/Aqours.Api/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/Aqours.Application/Aqours.Application.csproj apps/api/src/Aqours.Application/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/Aqours.Domain/Aqours.Domain.csproj apps/api/src/Aqours.Domain/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/Aqours.Infrastructure/Aqours.Infrastructure.csproj apps/api/src/Aqours.Infrastructure/

USER ${LOCAL_UID}:${LOCAL_GID}

RUN --mount=type=cache,id=aqours-nuget,target=/home/aqours/.nuget/packages,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    dotnet tool restore --tool-manifest /workspace/dotnet-tools.json \
    && dotnet restore apps/api/src/Aqours.Api/Aqours.Api.csproj

FROM restore AS development

ENV DOTNET_USE_POLLING_FILE_WATCHER=1 \
    DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER=1 \
    DOTNET_WATCH_SUPPRESS_BROWSER_REFRESH=1

COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/ apps/api/src/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/data/ packages/psgc/data/
COPY --chmod=755 docker/api/entrypoint.sh /usr/local/bin/api-entrypoint
COPY --chmod=755 docker/api/healthcheck.sh /usr/local/bin/api-healthcheck

EXPOSE 5251

ENTRYPOINT ["/usr/local/bin/api-entrypoint"]
CMD ["dotnet", "watch", "--non-interactive", "--project", "apps/api/src/Aqours.Api", "run", "--no-launch-profile", "--urls", "http://0.0.0.0:5251"]

FROM restore AS publish

COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/ apps/api/src/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/data/ packages/psgc/data/

RUN --mount=type=cache,id=aqours-nuget,target=/home/aqours/.nuget/packages,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    dotnet publish apps/api/src/Aqours.Api/Aqours.Api.csproj \
      --configuration Release \
      --no-restore \
      --output /out/publish \
      /p:UseAppHost=false \
    && rm -f /out/publish/appsettings.Development.json

FROM mcr.microsoft.com/dotnet/aspnet:10.0.14 AS production

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    AQOURS_DATA_PROTECTION_KEY_PATH=/var/lib/aqours/data-protection

WORKDIR /app
RUN install -d -o 1654 -g 1654 /var/lib/aqours/data-protection /app/storage/chat-attachments
COPY --from=publish --chown=1654:1654 /out/publish/ ./
USER 1654:1654
EXPOSE 8080
ENTRYPOINT ["dotnet", "Aqours.Api.dll"]

FROM restore AS migration-build

COPY --chown=${LOCAL_UID}:${LOCAL_GID} apps/api/src/ apps/api/src/
COPY --chown=${LOCAL_UID}:${LOCAL_GID} packages/psgc/data/ packages/psgc/data/

RUN --mount=type=cache,id=aqours-nuget,target=/home/aqours/.nuget/packages,uid=${LOCAL_UID},gid=${LOCAL_GID},sharing=locked \
    ConnectionStrings__Aqours='Host=localhost;Port=5432;Database=aqours_build;Username=build;Password=build-only' \
    dotnet ef migrations bundle \
      --project apps/api/src/Aqours.Infrastructure/Aqours.Infrastructure.csproj \
      --startup-project apps/api/src/Aqours.Api/Aqours.Api.csproj \
      --configuration Release \
      --output /out/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0.14 AS migration

ENV DOTNET_BUNDLE_EXTRACT_BASE_DIR=/tmp/.net
WORKDIR /app
COPY --from=migration-build --chown=1654:1654 /out/efbundle /app/efbundle
COPY --from=migration-build --chown=1654:1654 /workspace/apps/api/src/Aqours.Api/appsettings.json ./
USER 1654:1654
ENTRYPOINT ["/app/efbundle"]

FROM production AS final
