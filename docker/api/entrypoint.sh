#!/bin/sh
set -eu

cd /workspace
dotnet restore apps/api/src/Aqours.Api/Aqours.Api.csproj

if [ "${1:-}" = "dotnet" ] && [ "${2:-}" = "ef" ]; then
  dotnet tool restore --tool-manifest /workspace/dotnet-tools.json
fi

exec "$@"
