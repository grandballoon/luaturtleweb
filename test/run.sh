#!/bin/sh
# Runs every Lua suite under each Lua the host must support: Lua 5.4+
# (the web's Wasmoon) and LuaJIT (the LÖVE desktop app). Run from the repo
# root:  sh test/run.sh
status=0
for lua in lua luajit; do
    if ! command -v "$lua" >/dev/null 2>&1; then
        echo "$lua not found"; status=1; continue
    fi
    for suite in test/*_test.lua; do
        printf '%-7s %-22s ' "$lua" "$suite"
        out=$("$lua" "$suite" 2>&1) || status=1
        printf '%s\n' "$out" | tail -n 1
    done
done
exit $status
