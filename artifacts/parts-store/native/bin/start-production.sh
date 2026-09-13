#!/usr/bin/env bash
set -euo pipefail

# Production is deliberately a thin process launcher. Database provisioning,
# schema changes, seed data and dependency installation belong to build/release.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PORT:?PORT is required}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric" >&2; exit 1; }
command -v php >/dev/null || { echo "php is required" >&2; exit 1; }
php -m | grep -qx pdo_pgsql || { echo "pdo_pgsql extension is required" >&2; exit 1; }

export APP_ENV=production
export DATABASE_URL PORT
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}"
# Do not pass the host environment wholesale to the application process.
allowed=(APP_ENV SHOP_MODE DATABASE_URL PORT PHP_CLI_SERVER_WORKERS SESSION_SECRET NATIVE_S2S_SECRET PICQER_CUTOVER_AT
  INTERNAL_API_BASE_URL
  NATIVE_MEDIA_BRIDGE_URL NATIVE_MEDIA_BRIDGE_SECRET
  SWISS_QR_CREDITOR_NAME SWISS_QR_CREDITOR_STREET SWISS_QR_CREDITOR_HOUSE_NUMBER
  SWISS_QR_CREDITOR_POSTAL_CODE SWISS_QR_CREDITOR_CITY SWISS_QR_CREDITOR_COUNTRY
  SWISS_QR_CHF_IBAN SWISS_QR_REFERENCE_TYPE SWISS_QR_QR_IBAN)
args=()
for name in "${allowed[@]}"; do
  if [[ -v "$name" ]]; then args+=("$name=${!name}"); fi
done
cleanup() { trap - TERM INT EXIT; [[ -n "${child:-}" ]] && kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; }
trap 'exit 130' INT
trap 'exit 143' TERM
trap cleanup EXIT
env -i PATH="$PATH" HOME="${HOME:-/tmp}" "${args[@]}" \
  php -d display_errors=0 -d log_errors=1 -d allow_url_fopen=0 -d allow_url_include=0 \
  -d ffi.enable=false -d zlib.output_compression=1 -d zlib.output_compression_level=6 \
  -d upload_max_filesize=8M -d post_max_size=10M -d memory_limit=256M \
  -d 'disable_functions=mail,curl_multi_exec,exec,shell_exec,system,passthru,popen,proc_open,fsockopen,pfsockopen,stream_socket_client,socket_connect' \
  -S "0.0.0.0:$PORT" -t "$ROOT/public" "$ROOT/router.php" &
child=$!
wait "$child"