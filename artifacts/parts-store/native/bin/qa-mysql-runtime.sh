#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
source "$ROOT/lib/mysql-runtime.sh"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
STATE="$TMP/state"
PROC="$TMP/proc"
mkdir -p "$STATE/data/mysql" "$PROC/net" "$PROC/345"
printf 'retained database content\n' > "$STATE/data/retained"
printf 'Num RefCount Protocol Flags Type St Inode Path\n' > "$PROC/net/unix"
runtime_files() {
    touch "$STATE/mysql.sock"
    printf '345\n' > "$STATE/mysql.sock.lock"
    printf '345\n' > "$STATE/mysql.pid"
}
assert_retained() {
    [[ -f "$STATE/mysql.sock.lock" && -f "$STATE/mysql.pid" ]]
    [[ "$(cat "$STATE/data/retained")" == 'retained database content' ]]
}

runtime_files
printf 'node\n' > "$PROC/345/comm"
printf 'node\0server.js\0' > "$PROC/345/cmdline"
native_mysql_clear_stale_runtime "$STATE" "$PROC"
[[ ! -e "$STATE/mysql.sock" && ! -e "$STATE/mysql.sock.lock" && ! -e "$STATE/mysql.pid" ]]
[[ "$(cat "$STATE/data/retained")" == 'retained database content' ]]
echo "PASS: stale runtime files removed despite unrelated PID reuse; data retained."

runtime_files
printf '000: 2 0 10000 1 01 123 %s/mysql.sock\n' "$STATE" >> "$PROC/net/unix"
if native_mysql_clear_stale_runtime "$STATE" "$PROC" 2>/dev/null; then
    echo "FAIL: active socket was not protected." >&2; exit 1
fi
assert_retained
echo "PASS: active socket ownership prevents cleanup."

printf 'Num RefCount Protocol Flags Type St Inode Path\n' > "$PROC/net/unix"
printf 'mysqld\n' > "$PROC/345/comm"
printf 'mysqld\0--datadir=%s/data\0' "$STATE" > "$PROC/345/cmdline"
if native_mysql_clear_stale_runtime "$STATE" "$PROC" 2>/dev/null; then
    echo "FAIL: initializing database was not protected." >&2; exit 1
fi
assert_retained
echo "PASS: initializing database is protected before socket binding."

printf 'mysqld\0--datadir\0%s/data\0' "$STATE" > "$PROC/345/cmdline"
if native_mysql_clear_stale_runtime "$STATE" "$PROC" 2>/dev/null; then
    echo "FAIL: separate datadir argument was not recognized." >&2; exit 1
fi
assert_retained
echo "PASS: both datadir argument forms are recognized."

printf 'mysqld\0--datadir=/another/database\0' > "$PROC/345/cmdline"
native_mysql_clear_stale_runtime "$STATE" "$PROC"
[[ ! -e "$STATE/mysql.sock.lock" ]]
echo "PASS: an unrelated database does not block safe local cleanup."

runtime_files
if native_mysql_clear_stale_runtime "$STATE" "$TMP/unavailable-proc" 2>/dev/null; then
    echo "FAIL: unknown ownership was treated as safe." >&2; exit 1
fi
assert_retained
echo "PASS: unavailable ownership information fails closed."