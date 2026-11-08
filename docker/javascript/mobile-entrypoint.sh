#!/bin/sh
set -eu

: "${LAN_IP:?Set LAN_IP to the development computer's LAN address for Expo Go}"

if ! node -e '
const net = require("node:net");
const address = process.env.LAN_IP;
const usableLanAddress =
  net.isIPv4(address) && address !== "0.0.0.0" && !address.startsWith("127.");
process.exit(usableLanAddress ? 0 : 1);
'; then
  echo "Set LAN_IP to a reachable LAN IPv4 address, without a URL or path." >&2
  exit 64
fi

case "${API_BIND_ADDRESS:-127.0.0.1}" in
  0.0.0.0|"${LAN_IP}") ;;
  *)
    echo "Set API_BIND_ADDRESS to 0.0.0.0 or LAN_IP so a phone can reach the API and Expo." >&2
    exit 64
    ;;
esac

if [ "${EXPO_PACKAGER_PROXY_URL:-}" != "http://${LAN_IP}:8081" ]; then
  echo "EXPO_PACKAGER_PROXY_URL must use LAN_IP on port 8081." >&2
  exit 64
fi

if [ "${EXPO_PUBLIC_API_URL:-}" != "http://${LAN_IP}:5251" ]; then
  echo "EXPO_PUBLIC_API_URL must use LAN_IP on port 5251 without /api." >&2
  exit 64
fi

exec "$@"
