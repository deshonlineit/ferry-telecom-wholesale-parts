#!/usr/bin/env bash

native_mysql_clear_stale_runtime() {
    local state="$1" proc_root="${2:-/proc}" process_dir process_name
    if [[ ! -r "$proc_root/net/unix" ]]; then
        echo "Cannot inspect database socket ownership; runtime files were retained." >&2
        return 1
    fi
    if awk -v socket="$state/mysql.sock" '$NF == socket {found=1} END {exit !found}' "$proc_root/net/unix"; then
        echo "Database socket is still in use; runtime files were retained." >&2
        return 1
    fi
    for process_dir in "$proc_root"/[0-9]*; do
        [[ -r "$process_dir/comm" && -r "$process_dir/cmdline" ]] || continue
        IFS= read -r process_name < "$process_dir/comm" || continue
        [[ "$process_name" == "mysqld" ]] || continue
        if grep -zFqx -e "--datadir=$state/data" -e "$state/data" "$process_dir/cmdline"; then
            echo "The isolated database is already starting; runtime files were retained." >&2
            return 1
        fi
    done
    # These are transient process files, never database contents.
    rm -f -- "$state/mysql.sock" "$state/mysql.sock.lock" "$state/mysql.pid"
}