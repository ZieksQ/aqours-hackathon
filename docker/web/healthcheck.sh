#!/bin/sh
set -eu

wget -q -O /dev/null --header="Host: ${PROD_PUBLIC_HOST}" http://127.0.0.1:8080/healthz
