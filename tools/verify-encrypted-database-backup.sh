#!/usr/bin/env bash
# Restore one encrypted artifact to an explicitly disposable LOCAL database.
set -euo pipefail
: "${TA_BACKUP_ARTIFACT:?Set TA_BACKUP_ARTIFACT to the .dump.enc file}"
: "${TA_BACKUP_PASSPHRASE_FILE:?Set TA_BACKUP_PASSPHRASE_FILE to the mode-600 secret file}"
: "${TA_LOCAL_RESTORE_DATABASE:?Set TA_LOCAL_RESTORE_DATABASE to taa_restore_<name>}"
case "$TA_LOCAL_RESTORE_DATABASE" in taa_restore_*) ;; *) echo "Restore database must start with taa_restore_." >&2; exit 1;; esac
[ -f "$TA_BACKUP_ARTIFACT" ] && [ -f "$TA_BACKUP_ARTIFACT.mac" ] || { echo "Artifact or MAC is missing." >&2; exit 1; }
[ "$(stat -c '%a' "$TA_BACKUP_PASSPHRASE_FILE")" = "600" ] || { echo "Passphrase file must use mode 600." >&2; exit 1; }
pg_isready -q -h /var/run/postgresql || { echo "Local PostgreSQL socket is unavailable." >&2; exit 1; }
passphrase="$(cat "$TA_BACKUP_PASSPHRASE_FILE")"
encryption_key="$(printf '%s:enc' "$passphrase" | sha256sum | cut -d' ' -f1)"
mac_key="$(printf '%s:mac' "$passphrase" | sha256sum | cut -d' ' -f1)"
plain="$(mktemp /tmp/treasure-academy-restore.XXXXXX.dump)"
cleanup() { rm -f "$plain"; unset passphrase encryption_key mac_key; }
trap cleanup EXIT
expected="$(openssl dgst -sha256 -mac HMAC -macopt "hexkey:$mac_key" -binary "$TA_BACKUP_ARTIFACT" | base64 -w0)"
actual="$(base64 -w0 <"$TA_BACKUP_ARTIFACT.mac")"
[ "$expected" = "$actual" ] || { echo "Backup authentication failed; restore refused." >&2; exit 1; }
printf '%s' "$encryption_key" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$TA_BACKUP_ARTIFACT" -out "$plain" -pass stdin
sudo -u postgres dropdb --if-exists "$TA_LOCAL_RESTORE_DATABASE"
sudo -u postgres createdb "$TA_LOCAL_RESTORE_DATABASE"
sudo -u postgres pg_restore --no-owner --no-acl -d "$TA_LOCAL_RESTORE_DATABASE" <"$plain"
tables="$(sudo -u postgres psql -X -qAt -d "$TA_LOCAL_RESTORE_DATABASE" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
rls="$(sudo -u postgres psql -X -qAt -d "$TA_LOCAL_RESTORE_DATABASE" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;")"
echo "Isolated restore completed: $tables public tables and $rls RLS-enabled tables. The disposable database remains for documented validation and must then be dropped."
