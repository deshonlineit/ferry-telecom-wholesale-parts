#!/usr/bin/env bash
# Helpers that reclaim stale database runtime files without ever touching the
# data directory. Callers must already hold the bootstrap lock; the fingerprint
# and post-removal checks below cover a launcher that does not take that lock.

native_mysql_canonical_path() {
    local path="${1%/}"
    readlink -m -- "$path" 2>/dev/null || printf '%s' "$path"
}

# 0 = a process currently has this socket path bound, 1 = nobody does,
# 2 = ownership information is unavailable.
native_mysql_socket_bound() {
    local socket="$1" proc_root="$2"
    if [[ ! -r "$proc_root/net/unix" ]]; then
        return 2
    fi
    awk -v socket="$socket" '$NF == socket {found = 1} END {exit !found}' "$proc_root/net/unix"
}

# 0 = no running database can own this data directory, 1 = one does or its
# identity cannot be established.
native_mysql_datadir_free() {
    local datadir="$1" proc_root="$2" process_dir process_name candidate index
    local -a args
    for process_dir in "$proc_root"/[0-9]*; do
        [[ -d "$process_dir" ]] || continue
        if ! IFS= read -r process_name < "$process_dir/comm" 2>/dev/null; then
            if [[ -e "$process_dir/comm" ]]; then
                return 1
            fi
            continue
        fi
        [[ "$process_name" == "mysqld" ]] || continue
        if ! mapfile -d '' -t args < "$process_dir/cmdline" 2>/dev/null; then
            return 1
        fi
        candidate=""
        for ((index = 0; index < ${#args[@]}; index++)); do
            case "${args[index]}" in
                --datadir=*) candidate="${args[index]#--datadir=}" ;;
                --datadir|-h) candidate="${args[index + 1]-}" ;;
            esac
        done
        if [[ -z "$candidate" ]]; then
            return 1
        fi
        if [[ "$(native_mysql_canonical_path "$candidate")" == "$datadir" ]]; then
            return 1
        fi
    done
    return 0
}

native_mysql_runtime_fingerprint() {
    local state="$1" file fingerprint=""
    for file in "$state/mysql.sock" "$state/mysql.sock.lock" "$state/mysql.pid"; do
        if [[ -e "$file" ]]; then
            fingerprint+="$file|$(stat -c '%F:%i:%Y:%s' -- "$file" 2>/dev/null || printf 'unreadable')"
            if [[ -f "$file" ]]; then
                fingerprint+="|$(tr -d '\n' < "$file" 2>/dev/null || printf 'unreadable')"
            fi
        else
            fingerprint+="$file|absent"
        fi
        fingerprint+=$'\n'
    done
    printf '%s' "$fingerprint"
}

native_mysql_clear_stale_runtime() {
    local state="$1" proc_root="${2:-/proc}"
    local socket="$state/mysql.sock" datadir fingerprint_before fingerprint_after
    local bound_status
    datadir="$(native_mysql_canonical_path "$state/data")"

    bound_status=0
    native_mysql_socket_bound "$socket" "$proc_root" || bound_status=$?
    case $bound_status in
        0)
            echo "Database socket is still in use; runtime files were retained." >&2
            return 1
            ;;
        2)
            echo "Cannot inspect database socket ownership; runtime files were retained." >&2
            return 1
            ;;
    esac
    if ! native_mysql_datadir_free "$datadir" "$proc_root"; then
        echo "A database for this data directory is running or unidentifiable; runtime files were retained." >&2
        return 1
    fi

    fingerprint_before="$(native_mysql_runtime_fingerprint "$state")"
    bound_status=0
    native_mysql_socket_bound "$socket" "$proc_root" || bound_status=$?
    if [[ $bound_status -ne 1 ]]; then
        echo "Database socket ownership changed during validation; runtime files were retained." >&2
        return 1
    fi
    fingerprint_after="$(native_mysql_runtime_fingerprint "$state")"
    if [[ "$fingerprint_after" != "$fingerprint_before" ]]; then
        echo "Database runtime files changed during validation; they were retained." >&2
        return 1
    fi

    # Only transient process files; the data directory is never touched.
    rm -f -- "$socket" "$state/mysql.sock.lock" "$state/mysql.pid"

    bound_status=0
    native_mysql_socket_bound "$socket" "$proc_root" || bound_status=$?
    if [[ $bound_status -ne 1 ]]; then
        echo "A database claimed the socket while runtime files were being reclaimed; startup stopped." >&2
        return 1
    fi
    return 0
}
