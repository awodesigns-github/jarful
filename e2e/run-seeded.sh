#!/usr/bin/env bash
# Usage: e2e/run-seeded.sh <flow.yaml> <seed-count> [maestro -e args...]
# 1. fresh install, new anonymous user  2. seed <seed-count> backdated notes into its open jar  3. run the flow.
# Needs: emulator + Metro on 8081 + `adb reverse tcp:8081 tcp:8081`, and `npx convex dev` auth (dev deployment only).
set -euo pipefail
cd "$(dirname "$0")/.."
flow="$1"; total="$2"; shift 2
export PATH="$PATH:$HOME/.maestro/bin"
env=(-e DEV_CLIENT=1 -e LAUNCH_TIMEOUT=60000)
maestro test "${env[@]}" e2e/_fresh.yaml >/dev/null
uid=$(npx convex data users --limit 1 2>/dev/null | awk -F'"' '/^"/{print $2; exit}')
[ -n "$uid" ] || { echo "no user id found" >&2; exit 2; }
left="$total"
while [ "$left" -gt 0 ]; do
  n=$(( left > 7 ? 7 : left ))   # seedPastNotes adds at most 7 per call
  npx convex run devSeed:seedPastNotes "{\"userId\":\"$uid\",\"count\":$n}" >/dev/null
  left=$(( left - n ))
done
echo "seeded $total notes for $uid"
maestro test "${env[@]}" "$@" "$flow"
