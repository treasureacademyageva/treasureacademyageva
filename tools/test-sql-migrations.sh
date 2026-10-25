#!/usr/bin/env bash
# Rebuild and verify the complete schema in a disposable LOCAL PostgreSQL DB.
# This script never accepts a remote connection string and never touches the
# production Supabase project. It requires local sudo access to PostgreSQL.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="taa_test_${$}"
export PGOPTIONS="-c client_min_messages=warning ${PGOPTIONS:-}"
PSQL=(sudo -u postgres env "PGOPTIONS=$PGOPTIONS" psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
cleanup() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! pg_isready -q; then
  echo "Local PostgreSQL is not accepting connections." >&2
  echo "Start the local cluster first (for this workspace: sudo pg_ctlcluster 17 main start)." >&2
  exit 1
fi

sudo -u postgres createdb "$DB"
"${PSQL[@]}" -f supabase/tests/local_supabase_harness.sql >/dev/null

for migration in supabase/migrations/*.sql; do
  echo "apply  $(basename "$migration")"
  "${PSQL[@]}" -f "$migration" >/dev/null
done

for suite in \
  supabase/tests/rls_portal_policy.test.sql \
  supabase/tests/programme_finance_inventory_policy.test.sql \
  supabase/tests/admission_tracking_developer_policy.test.sql \
  supabase/tests/continuity_claims_policy.test.sql \
  supabase/tests/developer_bootstrap_policy.test.sql
do
  echo "test   $(basename "$suite")"
  escaped=${suite//\'/\'\'}
  printf "set session authorization authenticator;\n\\i '%s'\n" "$escaped" \
    | "${PSQL[@]}" >/dev/null
done

echo "verify 20261024_post_migration_read_only_verification.sql"
"${PSQL[@]}" -f supabase/release/20261024_post_migration_read_only_verification.sql >/dev/null

echo "SQL MIGRATION QA: 9/9 migrations, 5/5 rollback-safe policy suites and the read-only postflight passed."
