# Production SQL preflight evidence — 24 October 2026

**Execution:** authorised read-only connector query  
**Database:** owner-authorised existing Treasure Academy Supabase project, reference redacted  
**Database health:** Auth, PostgreSQL, REST and Storage all healthy before the query  
**PostgreSQL:** 17.6  
**Executor:** `postgres`  
**Checked at:** 2026-10-24 06:25:03 UTC

The query used `begin transaction read only` and ended with `rollback`. No migration or other mutation was executed.

## Baseline result

- Public tables: **25**
- Public views: **6**
- Public sequences: **1**
- Exact rows across the 25 preserved public tables: **70**
- Auth users: **0**
- Auth identities: **0**
- Storage buckets: **0**
- Storage objects: **0**
- Secure release objects already present: **none**

### Exact legacy counts

| Table | Rows |
|---|---:|
| `admission_windows` | 1 |
| `applications` | 0 |
| `attendance` | 0 |
| `audit_log` | 0 |
| `calendar_events` | 5 |
| `exam_timetable` | 6 |
| `fee_payments` | 0 |
| `fee_structure` | 10 |
| `holiday_assignments` | 2 |
| `news_images` | 0 |
| `news_posts` | 0 |
| `parent_accounts` | 0 |
| `parent_phones` | 0 |
| `pta_attendance` | 0 |
| `pta_meetings` | 1 |
| `pupils` | 0 |
| `results` | 0 |
| `school_data` | 1 |
| `sessions` | 1 |
| `shop_items` | 25 |
| `staff` | 6 |
| `staff_meetings` | 1 |
| `staff_subjects` | 0 |
| `transport_routes` | 3 |
| `uniform_items` | 8 |

### Preservation fingerprints

These MD5 values fingerprint catalog metadata only; they are not row-data exports and are used solely for before/after comparison.

- Legacy columns: `3f526b0fb5b146be354e1a64f0ddbe04`
- Legacy constraints: `f0d907bf99df58efb2468e29342adabb`
- Legacy policies: `a504567716158490e0f05dc55abeeb41`
- Legacy grants: `6fa6503c990c9cce6f6060ba630733e8`
- Former `public.touch_updated_at()` definition: `5be88363625066d2f1933cd8eba04796`

## Decision

The live state exactly matched the owner’s 23 October inventory and private 1+69 row exports, so it was eligible for the controlled production migration. All seven migrations were subsequently completed and the postflight passed. The final governing record is `20261024_PRODUCTION_SQL_EXECUTION_EVIDENCE.md`; this file remains the historical before-snapshot.
