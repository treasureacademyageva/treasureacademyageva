#!/usr/bin/env bash
# Prove encrypted backup and full restore against disposable LOCAL PostgreSQL only.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pg_isready >/dev/null || ! pg_isready -q; then
  echo "Local PostgreSQL 17 is required for the restore drill." >&2
  exit 1
fi
for command in pg_dump pg_restore openssl sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing local tool: $command" >&2; exit 1; }
done

source_db="taa_backup_source_$$"
restore_db="taa_backup_restore_$$"
work="$(mktemp -d /tmp/taa-backup-restore.XXXXXX)"
plain="$work/source.dump"
encrypted="$work/source.dump.enc"
restored="$work/restored.dump"
passphrase="$(openssl rand -hex 32)"
encryption_key="$(printf '%s:enc' "$passphrase" | sha256sum | cut -d' ' -f1)"
mac_key="$(printf '%s:mac' "$passphrase" | sha256sum | cut -d' ' -f1)"
cleanup() {
  sudo -u postgres dropdb --if-exists "$source_db" >/dev/null 2>&1 || true
  sudo -u postgres dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
  rm -rf "$work"
  unset passphrase encryption_key mac_key
}
trap cleanup EXIT

sudo -u postgres createdb "$source_db"
psql_source=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$source_db")
"${psql_source[@]}" -f supabase/tests/local_supabase_harness.sql >/dev/null
for migration in supabase/migrations/*.sql; do "${psql_source[@]}" -f "$migration" >/dev/null; done
"${psql_source[@]}" -c "insert into public.public_search_insights_daily(observed_on,family,search_count,zero_result_count) values('2099-01-01','website',7,2);" >/dev/null

sudo -u postgres pg_dump -Fc --no-owner --no-acl -d "$source_db" >"$plain"
plain_hash="$(sha256sum "$plain" | cut -d' ' -f1)"
printf '%s' "$encryption_key" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$plain" -out "$encrypted" -pass stdin
openssl dgst -sha256 -mac HMAC -macopt "hexkey:$mac_key" -binary "$encrypted" >"$encrypted.mac"
rm -f "$plain"
[ -s "$encrypted" ] && [ "$(wc -c <"$encrypted.mac")" -eq 32 ]
if grep -a -q '2099-01-01' "$encrypted"; then
  echo "Encrypted artifact exposed fixture text." >&2
  exit 1
fi
expected_mac="$(openssl dgst -sha256 -mac HMAC -macopt "hexkey:$mac_key" -binary "$encrypted" | base64 -w0)"
actual_mac="$(base64 -w0 <"$encrypted.mac")"
[ "$expected_mac" = "$actual_mac" ]
printf '%s' "$encryption_key" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$encrypted" -out "$restored" -pass stdin
[ "$(sha256sum "$restored" | cut -d' ' -f1)" = "$plain_hash" ]

sudo -u postgres createdb "$restore_db"
sudo -u postgres pg_restore --no-owner --no-acl -d "$restore_db" <"$restored" >/dev/null
restored_marker="$(sudo -u postgres psql -X -qAt -d "$restore_db" -c "select search_count||':'||zero_result_count from public.public_search_insights_daily where observed_on='2099-01-01' and family='website';")"
[ "$restored_marker" = "7:2" ]
source_tables="$(sudo -u postgres psql -X -qAt -d "$source_db" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
restore_tables="$(sudo -u postgres psql -X -qAt -d "$restore_db" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
source_rls="$(sudo -u postgres psql -X -qAt -d "$source_db" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;")"
restore_rls="$(sudo -u postgres psql -X -qAt -d "$restore_db" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;")"
[ "$source_tables" = "$restore_tables" ]
[ "$source_rls" = "$restore_rls" ]

echo "ENCRYPTED RESTORE QA: authenticated encryption-at-rest workflow, byte-identical decryption, $restore_tables public tables, $restore_rls RLS tables and fixture data restored successfully."
