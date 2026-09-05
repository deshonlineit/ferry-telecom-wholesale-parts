#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$(cd "$ROOT/../../.." && pwd)"
STATE="$WORKSPACE/.local/native-mysql"
mkdir -p "$STATE" "$ROOT/storage/sessions" "$ROOT/storage/originals" "$ROOT/public/media"
chmod 700 "$STATE" "$ROOT/storage" "$ROOT/storage/sessions" "$ROOT/storage/originals"
if [[ ! -d "$STATE/data/mysql" ]]; then
  mysqld --no-defaults --initialize-insecure --datadir="$STATE/data" --log-error="$STATE/mysql.log"
fi
if ! mysqladmin --no-defaults --socket="$STATE/mysql.sock" --user=root ping >/dev/null 2>&1; then
  mysqld --no-defaults --datadir="$STATE/data" --socket="$STATE/mysql.sock" --pid-file="$STATE/mysql.pid" \
    --skip-networking --mysqlx=0 --log-error="$STATE/mysql.log" --secure-file-priv=NULL &
  DB_PID=$!
  trap 'kill "${WEB_PID:-}" "${DB_PID:-}" 2>/dev/null || true' EXIT INT TERM
  for ((i=0; i<90; i++)); do
    mysqladmin --no-defaults --socket="$STATE/mysql.sock" --user=root ping >/dev/null 2>&1 && break
    sleep 1
  done
fi
mysql --no-defaults --socket="$STATE/mysql.sock" --user=root <<'SQL'
CREATE DATABASE IF NOT EXISTS ferry_isolated_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'ferry_test_app'@'localhost' IDENTIFIED BY '';
GRANT SELECT, INSERT, UPDATE, DELETE ON ferry_isolated_test.* TO 'ferry_test_app'@'localhost';
SQL
printf 'FERRY_LOCAL_TEST_ONLY\n' > "$STATE/isolated.marker"
mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test < "$ROOT/database/schema.sql"
php "$ROOT/bin/seed.php"
if [[ "$(mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test -Nse "SELECT COUNT(*) FROM settings WHERE name='source_compatibility_imported'")" == "0" ]]; then
  php "$ROOT/bin/import-compatibility.php"
  mysql --no-defaults --socket="$STATE/mysql.sock" --user=root ferry_isolated_test -e \
    "INSERT INTO settings(name,value) VALUES('source_compatibility_imported','true')"
fi
echo "Isolated PHP/MySQL test shop ready. External actions disabled."
env -i PATH="$PATH" HOME="$HOME" \
  php -d display_errors=0 -d log_errors=1 -d allow_url_fopen=0 -d allow_url_include=0 \
    -d ffi.enable=false -d upload_max_filesize=8M -d post_max_size=10M -d memory_limit=256M \
    -d 'disable_functions=mail,curl_exec,curl_multi_exec,exec,shell_exec,system,passthru,popen,proc_open,fsockopen,pfsockopen,stream_socket_client,socket_connect' \
    -S "0.0.0.0:${PORT:?PORT is required}" -t "$ROOT/public" "$ROOT/router.php" &
WEB_PID=$!
trap 'kill "${WEB_PID:-}" "${DB_PID:-}" 2>/dev/null || true' EXIT INT TERM
wait "$WEB_PID"