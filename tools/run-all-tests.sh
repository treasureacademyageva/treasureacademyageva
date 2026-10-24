#!/usr/bin/env bash
# HISTORICAL CONTRACT RUNNER — not a current release gate.
# Many suites below intentionally describe retired browser-auth/demo behaviour.
# Use `npm run test:all-current` for the maintained secure architecture.
#
# Setup once:  npm install            (installs jsdom; node_modules is gitignored
#                                      and is wiped by workspace snapshots, so if
#                                      every suite reports CRASH, run this first)
# Usage:       bash tools/run-all-tests.sh
#
# Suites are discovered from disk rather than hardcoded, so adding
# tools/tests/verify-batchNN.js or tools/tests/*.test.js picks it up
# automatically. Suites are sorted numerically, not lexically.
set -u
cd "$(dirname "$0")/tests"

if [ ! -d ../../node_modules/jsdom ]; then
  echo "jsdom is missing - run:  npm install"
  echo
fi

shopt -s nullglob
mapfile -t batches < <(printf '%s\n' verify-batch*.js | sed -E 's/verify-batch([0-9]+)\.js/\1 &/' | sort -n | cut -d' ' -f2)
mapfile -t named < <(printf '%s\n' verify-*.js | grep -v '^verify-batch' | grep -v '\.test\.js$' | sort)
extras=( *.test.js )

tot=0
failed=()
for f in "${batches[@]}" "${named[@]}" "${extras[@]}"; do
  out=$(node "$f" 2>&1); rc=$?
  line=$(echo "$out" | grep -oE "[0-9]+ passed, [0-9]+ (failed|wrong)" | tail -1)
  n=$(echo "$line" | awk '{print $1}')
  nf=$(echo "$line" | awk '{print $3}')
  tot=$((tot + ${n:-0}))
  # "wrong" is the stress exam's budget wording: exit 0 means the
  # accuracy budget was met, so the runner honours the suite verdict
  if [ "$rc" -ne 0 ] || [ -z "$line" ] || { [ "${nf:-1}" -ne 0 ] && ! echo "$line" | grep -q wrong; }; then
    failed+=("$f")
    printf "%-24s %s\n" "$f" "${line:-CRASH}"
    echo "$out" | grep -E "^FAIL" | head -5 | sed 's/^/      /'
  else
    printf "%-24s %s\n" "$f" "$n"
  fi
done

echo "---------------------------------------------"
echo "TOTAL: $tot checks passed across $(( ${#batches[@]} + ${#named[@]} + ${#extras[@]} )) suites"
if [ ${#failed[@]} -ne 0 ]; then
  echo "Failing suites: ${failed[*]}"
  exit 1
fi
echo "All suites green."
