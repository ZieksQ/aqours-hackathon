#!/bin/sh
set -eu

case "${PROD_PUBLIC_HOST:-}" in
    ''|*[!A-Za-z0-9.-]*|.*|*..*|*.-*|*-.*|*-)
        echo "PROD_PUBLIC_HOST must be a hostname or IPv4 address without a URL scheme or path." >&2
        exit 1
        ;;
esac

if ! printf '%s\n' "$PROD_PUBLIC_HOST" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'; then
    echo "PROD_PUBLIC_HOST must contain valid hostname labels." >&2
    exit 1
fi

mkdir -p /tmp/client_temp /tmp/proxy_temp
envsubst '${PROD_PUBLIC_HOST}' < /etc/nginx/site.conf.template > /tmp/site.conf
nginx -t -c /etc/nginx/nginx.conf
exec nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
