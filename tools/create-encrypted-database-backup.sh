#!/usr/bin/env bash
# Create a production-grade encrypted PostgreSQL backup without accepting a URL
# or passphrase on the command line. Run only from the private backup operator.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd -P)"
: "${TA_BACKUP_SERVICE:?Set TA_BACKUP_SERVICE to a private pg_service.conf entry}"
: "${TA_BACKUP_PASSPHRASE_FILE:?Set TA_BACKUP_PASSPHRASE_FILE to a mode-600 secret file}"
: "${TA_BACKUP_OUTPUT_DIR:?Set TA_BACKUP_OUTPUT_DIR to an encrypted storage mount outside the repository}"

output="$(mkdir -p "$TA_BACKUP_OUTPUT_DIR" && cd "$TA_BACKUP_OUTPUT_DIR" && pwd -P)"
case "$output/" in "$repo"/*) echo "Backup output must be outside the repository." >&2; exit 1;; esac
[ -f "$TA_BACKUP_PASSPHRASE_FILE" ] || { echo "Backup passphrase file is missing." >&2; exit 1; }
mode="$(stat -c '%a' "$TA_BACKUP_PASSPHRASE_FILE")"
[ "$mode" = "600" ] || { echo "Backup passphrase file must use mode 600." >&2; exit 1; }
passphrase="$(cat "$TA_BACKUP_PASSPHRASE_FILE")"
[ "${#passphrase}" -ge 32 ] || { echo "Backup passphrase must contain at least 32 characters." >&2; exit 1; }
for command in pg_dump openssl sha256sum; do command -v "$command" >/dev/null || { echo "Missing tool: $command" >&2; exit 1; }; done

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$output/treasure-academy-$stamp"
plain="$(mktemp /tmp/treasure-academy-backup.XXXXXX.dump)"
encryption_key="$(printf '%s:enc' "$passphrase" | sha256sum | cut -d' ' -f1)"
mac_key="$(printf '%s:mac' "$passphrase" | sha256sum | cut -d' ' -f1)"
cleanup() { rm -f "$plain"; unset passphrase encryption_key mac_key; }
trap cleanup EXIT

pg_dump -Fc --no-owner --no-acl "service=$TA_BACKUP_SERVICE" >"$plain"
[ -s "$plain" ] || { echo "pg_dump produced an empty artifact." >&2; exit 1; }
printf '%s' "$encryption_key" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$plain" -out "$base.dump.enc" -pass stdin
openssl dgst -sha256 -mac HMAC -macopt "hexkey:$mac_key" -binary "$base.dump.enc" >"$base.dump.enc.mac"
cat >"$base.manifest.json" <<JSON
{"version":1,"createdAt":"$stamp","cipher":"AES-256-CBC/PBKDF2-200000","authentication":"HMAC-SHA256 encrypt-then-MAC","encryptedSha256":"$(sha256sum "$base.dump.enc" | cut -d' ' -f1)","encryptedBytes":$(wc -c <"$base.dump.enc"),"restoreTestRequired":true}
JSON
chmod 600 "$base.dump.enc" "$base.dump.enc.mac" "$base.manifest.json"
echo "Encrypted backup created. Run the isolated restore drill before accepting it; no database URL or passphrase was logged."
