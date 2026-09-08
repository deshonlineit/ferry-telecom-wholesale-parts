#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$(cd "$ROOT/../../.." && pwd)"
STATE="$WORKSPACE/.local/native-mysql"
source "$ROOT/bin/lib/mysql-runtime.sh"
mkdir -p "$STATE" "$ROOT/storage/sessions" "$ROOT/storage/originals" "$ROOT/public/media"
chmod 700 "$STATE" "$ROOT/storage" "$ROOT/storage/sessions" "$ROOT/storage/originals"
DB_PID=""
WEB_PID=""
FX_PID=""
cleanup() {
  local child
  trap - EXIT INT TERM
  for child in "$WEB_PID" "$FX_PID" "$DB_PID"; do
    [[ -n "$child" ]] && kill "$child" 2>/dev/null || true
  done
  for child in "$WEB_PID" "$FX_PID" "$DB_PID"; do
    [[ -n "$child" ]] && wait "$child" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
exec 9>"$STATE/bootstrap.lock"
if ! flock -w 90 9; then
  echo "Another isolated database startup is still in progress." >&2
  exit 1
fi
if [[ ! -d "$STATE/data/mysql" ]]; then
  mysqld --no-defaults --initialize-insecure --datadir="$STATE/data" --log-error="$STATE/mysql.log"
fi
if ! mysqladmin --no-defaults --socket="$STATE/mysql.sock" --user=root ping >/dev/null 2>&1; then
  if ! native_mysql_clear_stale_runtime "$STATE"; then
    echo "Isolated database runtime could not be reclaimed safely; startup stopped and the data directory was left untouched." >&2
    exit 1
  fi
  mysqld --no-defaults --datadir="$STATE/data" --socket="$STATE/mysql.sock" --pid-file="$STATE/mysql.pid" \
    --skip-networking --mysqlx=0 --log-error="$STATE/mysql.log" --secure-file-priv=NULL 9>&- &
  DB_PID=$!
  for ((i=0; i<90; i++)); do
    mysqladmin --no-defaults --socket="$STATE/mysql.sock" --user=root ping >/dev/null 2>&1 && break
    if ! kill -0 "$DB_PID" 2>/dev/null; then
      echo "Isolated database startup failed; see $STATE/mysql.log. Existing data was retained." >&2
      exit 1
    fi
    sleep 1
  done
  if ! mysqladmin --no-defaults --socket="$STATE/mysql.sock" --user=root ping >/dev/null 2>&1; then
    echo "Isolated database did not become ready within 90 seconds; existing data was retained." >&2
    exit 1
  fi
fi
mysql --no-defaults --socket="$STATE/mysql.sock" --user=root <<'SQL'
CREATE DATABASE IF NOT EXISTS ferry_isolated_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'ferry_test_app'@'localhost' IDENTIFIED BY '';
GRANT SELECT, INSERT, UPDATE, DELETE ON ferry_isolated_test.* TO 'ferry_test_app'@'localhost';
SQL
printf 'FERRY_LOCAL_TEST_ONLY\n' > "$STATE/isolated.marker"
mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test < "$ROOT/database/schema.sql"
for migration in "$ROOT"/database/migrations/*.sql; do
  [[ -f "$migration" ]] || continue
  mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test < "$migration"
done
php "$ROOT/bin/seed.php"
php "$ROOT/bin/reconcile-catalog-taxonomy.php"
if [[ "$(mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test -Nse "SELECT COUNT(*) FROM settings WHERE name='source_compatibility_imported'")" == "0" ]]; then
  php "$ROOT/bin/import-compatibility.php"
  mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test -e \
    "INSERT INTO settings(name,value) VALUES('source_compatibility_imported','true')"
fi
php "$ROOT/bin/reconcile-product-model-links.php" --apply
php "$ROOT/bin/reconcile-product-model-links.php" --check
flock -u 9
exec 9>&-
env -i PATH="$PATH" HOME="$HOME" php "$ROOT/bin/sync-exchange-rates.php" \
  || echo "ECB reference unavailable; currency status remains visible in administration." >&2
env -i PATH="$PATH" HOME="$HOME" php "$ROOT/bin/sync-exchange-rates.php" --watch &
FX_PID=$!
echo "Isolated PHP/MySQL test shop ready. Read-only ECB sync active; Stripe bridge restricted to authenticated checkout calls."
BRIDGE_SECRET="${NATIVE_STRIPE_BRIDGE_SECRET:-}"
if [[ -z "$BRIDGE_SECRET" && -n "${SESSION_SECRET:-}" ]]; then
  BRIDGE_SECRET="$(node -e 'const c=require("node:crypto");process.stdout.write(c.createHash("sha256").update(`ferry-stripe-bridge-v1:${process.env.SESSION_SECRET}`).digest("hex"))')"
fi
env -i PATH="$PATH" HOME="$HOME" NATIVE_S2S_SECRET="$BRIDGE_SECRET" \
  php -d display_errors=0 -d log_errors=1 -d allow_url_fopen=0 -d allow_url_include=0 \
    -d ffi.enable=false -d upload_max_filesize=8M -d post_max_size=10M -d memory_limit=256M \
    -d 'disable_functions=mail,curl_multi_exec,exec,shell_exec,system,passthru,popen,proc_open,fsockopen,pfsockopen,stream_socket_client,socket_connect' \
    -S "0.0.0.0:${PORT:?PORT is required}" -t "$ROOT/public" "$ROOT/router.php" &
WEB_PID=$!
wait "$WEB_PID"