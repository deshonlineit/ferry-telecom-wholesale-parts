#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v php >/dev/null || { echo "php is required" >&2; exit 1; }
command -v composer >/dev/null || { echo "composer is required" >&2; exit 1; }

composer --working-dir="$ROOT" install \
  --no-dev \
  --no-interaction \
  --prefer-dist \
  --optimize-autoloader \
  --classmap-authoritative

php -m | grep -qx pdo_pgsql || { echo "pdo_pgsql extension is required" >&2; exit 1; }
php -m | grep -qx curl || { echo "curl extension is required" >&2; exit 1; }
php -m | grep -qx fileinfo || { echo "fileinfo extension is required" >&2; exit 1; }

find "$ROOT/src" "$ROOT/public" -name '*.php' -print0 \
  | xargs -0 -n1 php -l >/dev/null
php -l "$ROOT/router.php" >/dev/null
php "$ROOT/bin/qa-postgres-portability.php"

echo "Native production build verified."