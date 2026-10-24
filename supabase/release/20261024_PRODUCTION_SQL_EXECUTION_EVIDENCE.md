# Production SQL execution evidence — 24 October 2026

**Project:** owner-authorised existing Treasure Academy Supabase project (reference redacted)  
**Database:** PostgreSQL 17.6  
**Result:** **PRODUCTION SQL PASS — CODE RELEASE MAY PROCEED**

## Migration history

All seven reviewed migrations are now recorded and present in the production migration history:

| Production history version | Migration |
|---|---|
| `20261024065359` | `202610230001_secure_school_portal` |
| `20261024065523` | `202610230002_portal_accounts` |
| `20261024065753` | `202610230003_staff_operations_and_requests` |
| `20261024065911` | `202610230004_parent_pupil_linking` |
| `20261024070119` | `202610230005_self_registration_enrolment_and_graduates` |
| `20261024070732` | `202610230006_fees_shop_transport_and_manual_payments` |
| `20261024070745` | `202610240001_admission_tracking_developer_operations_and_answers` |

Migrations 1–5 were applied by the owner’s file-capable SQL agent before its free-session limit was reached. Their migration-history records and release-marker tables were independently verified before continuing.

Migrations 6–7 were then applied through the connected Supabase migration API. Because the connector accepts SQL text but not workspace paths, each exact reviewed SQL file was temporarily made retrievable as non-secret text. The production migration loader verified the expected SHA-256 and byte length inside the transaction before stripping only the file’s outer `begin;`/`commit;` lines and executing the exact remaining SQL. The temporary PostgreSQL `http` extension was removed in the same successful migration. A first migration-6 loader attempt used character length instead of UTF-8 byte length, raised an exception and was fully rolled back; no migration object was left by that failed attempt. The corrected byte-length check succeeded.

Verified source identities:

- migration 6: SHA-256 `0d3057452b5220980b39ea6d253e708ad301ce66044243400fd35450cee7e1a9`, 115,689 bytes;
- migration 7: SHA-256 `059c05755655a5b119a5415c1258ea5c5f7f467a4dac0a0efe0681cac4fd1c03`, 18,329 bytes.

## Preservation comparison

The production postflight completed at `2026-10-24T07:08:11Z` in a read-only transaction and rolled back.

- Former public tables: preserved
- Former public views and sequence: preserved
- Exact former-table row total before: **70**
- Exact former-table row total after: **70**
- `school_data`: **1 → 1**
- Auth users: **0 → 0**
- Auth identities: **0 → 0**
- Secure `profiles`, `students`, `manual_payments`, `developer_capabilities` and admission-tracking challenge rows: all **0**

Every one of the 25 former table counts remained unchanged. Catalog fingerprints also remained identical:

- columns: `3f526b0fb5b146be354e1a64f0ddbe04`
- constraints: `f0d907bf99df58efb2468e29342adabb`
- policies: `a504567716158490e0f05dc55abeeb41`
- grants: `6fa6503c990c9cce6f6060ba630733e8`
- former `public.touch_updated_at()` definition: `5be88363625066d2f1933cd8eba04796`

## Security postflight

- All 16 release-marker tables: present
- RLS-disabled expected tables: **none**
- Unexpected direct `anon`/`authenticated` grants on server-only developer/admission tables: **0**
- Five server-only functions: `anon=false`, `authenticated=false`, `service_role=true`
- Conflicting published public-information topics: **0**
- Duplicate active OTP phone/purpose groups: **0**
- Sensitive OTP audit rows: **0**
- Both release-critical unique indexes: present
- Temporary `http` extension: absent after migration
- Auth, database, REST and Storage health: all `ACTIVE_HEALTHY`

## Boundaries retained

No legacy retirement, private-data import, Auth account creation, developer-capability grant, feature-gate activation or Monnify activation occurred during this SQL release. The new schema is installed but protected workflows remain fail-closed until separately configured and activated.
