#!/usr/bin/env bash
# Authoritative current web/security/browser regression runner.
# Historical verify-batch suites are retained as design history; many assert
# retired browser-authentication and old page-count contracts and are not a
# release gate for the secure Supabase architecture.
set -euo pipefail
cd "$(dirname "$0")/.."

npm test
node tools/tests/chatbot.test.js
node tools/tests/ask-coverage.test.js
node --test tools/tests/review-gateway.test.js

own_server=0
server_pid=''
cleanup() {
  if [ "$own_server" -eq 1 ] && [ -n "$server_pid" ]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! curl -fsS --max-time 2 http://127.0.0.1:4173/ >/dev/null 2>&1; then
  HOST=127.0.0.1 PORT=4173 node tools/clean-route-test-server.mjs >/tmp/treasure-academy-current-tests-http.log 2>&1 &
  server_pid=$!
  own_server=1
  for _ in $(seq 1 50); do
    curl -fsS --max-time 1 http://127.0.0.1:4173/ >/dev/null 2>&1 && break
    kill -0 "$server_pid" >/dev/null 2>&1 || { cat /tmp/treasure-academy-current-tests-http.log >&2; exit 1; }
    sleep 0.1
  done
  curl -fsS --max-time 2 http://127.0.0.1:4173/ >/dev/null
fi

node tools/tests/browser-visitor-qa.js
npm run test:a11y
npm run test:secure-browser
npm run test:operations-browser
npm run test:portal-browser
npm run test:cms-browser
npm run test:public-content-browser
npm run test:public-engagement-browser
npm run test:verified-content-browser
npm run test:run11-browser
npm run test:run14-browser
npm run test:header-browser

echo "CURRENT RELEASE QA: all static, security, answer, review, visitor, accessibility and browser suites passed."
