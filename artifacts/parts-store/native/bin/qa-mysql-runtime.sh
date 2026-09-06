#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
source "$ROOT/lib/mysql-runtime.sh"
TMP="$(mktemp -d)"
trap 'chmod -R u+rwX -- "$TMP" 2>/dev/null || true; rm -rf -- "$TMP"' EXIT
STATE="$TMP/state"
PROC="$TMP/proc"
mkdir -p "$STATE/data/mysql" "$PROC/net" "$PROC/345"
printf 'retained database content\n' > "$STATE/data/retained"

reset_environment() {
    printf 'Num RefCount Protocol Flags Type St Inode Path\n' > "$PROC/net/unix"
    printf 'node\n' > "$PROC/345/comm"
    printf 'node\0server.js\0' > "$PROC/345/cmdline"
    chmod 755 "$PROC/345"
    chmod 644 "$PROC/345/comm" "$PROC/345/cmdline"
    touch "$STATE/mysql.sock"
    printf '345\n' > "$STATE/mysql.sock.lock"
    printf '345\n' > "$STATE/mysql.pid"
}
bind_socket() {
    printf '000: 2 0 10000 1 01 123 %s/mysql.sock\n' "$STATE" >> "$PROC/net/unix"
}
run_mysqld() {
    printf 'mysqld\n' > "$PROC/345/comm"
    printf "$1" "$STATE" > "$PROC/345/cmdline"
}
assert_retained() {
    [[ -f "$STATE/mysql.sock.lock" && -f "$STATE/mysql.pid" ]] || { echo "FAIL: $1 removed runtime files." >&2; exit 1; }
    [[ "$(cat "$STATE/data/retained")" == 'retained database content' ]] || { echo "FAIL: $1 altered database content." >&2; exit 1; }
    echo "PASS: $1"
}
assert_refused() {
    if native_mysql_clear_stale_runtime "$STATE" "$PROC" 2>/dev/null; then
        echo "FAIL: $1 was not refused." >&2
        exit 1
    fi
    assert_retained "$1"
}

reset_environment
native_mysql_clear_stale_runtime "$STATE" "$PROC"
[[ ! -e "$STATE/mysql.sock" && ! -e "$STATE/mysql.sock.lock" && ! -e "$STATE/mysql.pid" ]]
[[ "$(cat "$STATE/data/retained")" == 'retained database content' ]]
echo "PASS: stale runtime files removed despite unrelated PID reuse; data retained."

reset_environment
bind_socket
assert_refused "active socket ownership prevents cleanup"

reset_environment
run_mysqld 'mysqld\0--datadir=%s/data\0'
assert_refused "initializing database is protected before socket binding"

reset_environment
run_mysqld 'mysqld\0--datadir\0%s/data\0'
assert_refused "separate datadir argument form is recognized"

reset_environment
run_mysqld 'mysqld\0-h\0%s/data\0'
assert_refused "short datadir argument form is recognized"

reset_environment
run_mysqld 'mysqld\0--datadir=%s/data/\0'
assert_refused "trailing slash datadir spelling is recognized"

reset_environment
run_mysqld 'mysqld\0--datadir=%s/./data/../data\0'
assert_refused "non-canonical datadir spelling is recognized"

reset_environment
run_mysqld 'mysqld\0--default-storage-engine=InnoDB\0'
assert_refused "database without a datadir argument fails closed"

reset_environment
printf 'mysqld\n' > "$PROC/345/comm"
chmod 000 "$PROC/345/comm"
assert_refused "unreadable process information fails closed"
chmod 644 "$PROC/345/comm"

reset_environment
run_mysqld 'mysqld\0--datadir=/another/database\0'
native_mysql_clear_stale_runtime "$STATE" "$PROC"
[[ ! -e "$STATE/mysql.sock.lock" ]]
echo "PASS: an unrelated database does not block safe local cleanup."

reset_environment
if native_mysql_clear_stale_runtime "$STATE" "$TMP/unavailable-proc" 2>/dev/null; then
    echo "FAIL: unknown ownership was treated as safe." >&2
    exit 1
fi
assert_retained "unavailable ownership information fails closed"

# A launcher outside the bootstrap lock may bind the socket after validation.
reset_environment
SOCKET_CALLS=0
native_mysql_socket_bound() {
    SOCKET_CALLS=$((SOCKET_CALLS + 1))
    [[ $SOCKET_CALLS -ge 2 ]] && return 0
    return 1
}
assert_refused "a socket claimed between validation and removal aborts cleanup"

reset_environment
SOCKET_CALLS=0
native_mysql_socket_bound() {
    SOCKET_CALLS=$((SOCKET_CALLS + 1))
    [[ $SOCKET_CALLS -ge 3 ]] && return 0
    return 1
}
if native_mysql_clear_stale_runtime "$STATE" "$PROC" 2>/dev/null; then
    echo "FAIL: a socket claimed during removal was reported as success." >&2
    exit 1
fi
[[ "$(cat "$STATE/data/retained")" == 'retained database content' ]]
echo "PASS: a socket claimed during removal is reported instead of starting a second database."

reset_environment
native_mysql_socket_bound() { return 1; }
native_mysql_runtime_fingerprint() {
    printf 'changed-%s\n' "$RANDOM$RANDOM"
}
assert_refused "runtime files changing during validation aborts cleanup"

echo "All isolated database runtime checks passed."
