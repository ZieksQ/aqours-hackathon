#!/usr/bin/env bash
set -euo pipefail

exec 3<>/dev/tcp/127.0.0.1/5251
printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
IFS=' ' read -r _ status _ <&3
[[ "$status" == 200 ]]
