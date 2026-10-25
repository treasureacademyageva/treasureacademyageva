# Dynamic Platform Implementation Tracker

**Authority:** `docs/TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md`
**Owner approval:** Shaibu Sidikat Ruth authorised the complete implementation
**Programme:** 12 controlled runs; additive, reversible and fail-closed
**Last updated:** 25 October 2026 — Run 4 requirements preflight
**Overall status:** Runs 1–3 complete locally; the Run 4 migration-ledger bridge is prepared and fully tested locally. Live Run 4 remains blocked on private provider readiness and an explicit owner-authorised production acceptance window. No Run 4 production mutation has occurred.

## Status key

- `DONE` — acceptance evidence exists and the run has an atomic commit.
- `ACTIVE` — implementation is in progress; do not begin a dependent run.
- `READY` — prerequisites are met but work has not started.
- `BLOCKED` — an owner/provider decision or missing acceptance evidence prevents work.
- `HOLD` — deliberately disabled or postponed; fail-closed behavior is required.

## Programme ledger

| Run | Scope | Required outcome | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Authority, baseline, preservation and inventory | Approved plan committed; complete QA baseline; reproducible source/route/content/API/database inventory; defect register; no behavior change | Owner-approved plan | `DONE` locally at the Run 1 audit commit |
| 2 | One-time developer bootstrap data boundary | One additive local migration for a one-use owner authorisation, capability binding and code-free audit; preservation and RLS tests | Run 1 | `DONE` locally at the Run 2 migration commit |
| 3 | Developer bootstrap trusted endpoint and private UI | Gate-off endpoint and Developer Console first-password flow; no readable password storage/logging; replay, expiry, recovery and normal-login tests | Run 2 | `DONE` locally at the Run 3 endpoint/UI commit |
| 4 | Owner-authorised developer acceptance and manual account-claim OTP | Private one-use bootstrap acceptance; gate disabled afterward; encrypted manual claim queue proven before claims open; no OTP to the sender number | Runs 2–3, the prepared migration-ledger bridge and an owner acceptance window | `BLOCKED` — source reconciliation passed; awaiting private provider readiness and live-window approval |
| 5 | First-party CMS schema and policy | One additive CMS migration; content, revisions, structured blocks, aliases, workflow, audit, published-only projections and RLS; all former records preserved | Run 4 | `BLOCKED` |
| 6 | Cloudinary and media governance | School-owned account; private secrets; signed upload; consent/provenance/placement metadata; safe derivatives; CSP and quota controls | Run 5 plus provider/owner decisions | `BLOCKED` |
| 7 | Protected portal CMS | Modular editor, preview, review, approval, scheduling, archive, revisions, restore, audit and media library; CMS permissions separated from school-record permissions | Runs 5–6 | `BLOCKED` |
| 8 | Dynamic public News, Events and Gallery | Server-rendered listing/detail routes, lifecycle/countdowns, read time, media relationships, Gallery source links, safe downloads, feeds and structured data | Run 7 | `BLOCKED` |
| 9 | Engagement and shared placements | Privacy-safe views, signed-in likes, gated premoderated comments, homepage placements and related content; popularity isolated from operations | Run 8 | `BLOCKED` |
| 10 | Verified content migration and Search cutover | Verified text/core sections/repeated facts/search projections migrated; sensitive historical media held; parity proven before coded authority is retired | Runs 8–9 | `BLOCKED` |
| 11 | Clean routes, discovery and final quality | One-hop `.html` redirects, canonical/link updates, dynamic sitemap, human site map, duplicate controls, a11y/performance/security/backup/restore evidence | Run 10 | `BLOCKED` |
| 12 | Production acceptance and provider completion | Production preservation proof, rollback evidence and probes; account/admission gates opened only after separate acceptances; Meta relay only after every external gate passes | Run 11 and external provider gates | `BLOCKED` |

## Run 1 acceptance ledger

| Item | Evidence | Result |
|---|---|---|
| Owner-approved authority committed alone | Blueprint commit `da11bcdb414034cbc0b59243f7b354e9c518d5ae` | Pass |
| Unrelated workspace state isolated | Three pre-existing mode-only changes under `tools/` remain unstaged and excluded | Pass |
| Dependency installation | `npm ci --no-audit --no-fund` completed | Pass |
| Complete current application regression | `bash tools/run-current-tests.sh` after Chromium/runtime installation | Pass |
| Disposable local database reconstruction | PostgreSQL 17; eight migrations, four RLS suites and read-only postflight | Pass |
| Live database preservation baseline | Read-only Supabase inspection: 102 public tables, all RLS-enabled; exact non-zero counts recorded | Pass |
| Route/Search/content/media/API inventory | `RUN-01-PRESERVATION-BASELINE.md` and `CONTENT-ROUTE-MIGRATION-INVENTORY.md` | Pass |
| Defect/gap register | `DEFECT-AND-GAP-REGISTER.md` | Pass |
| No production behavior change | No application code, SQL migration, live database mutation, deployment, provider setting or feature gate change | Pass |

## Run 2 acceptance ledger

| Item | Evidence | Result |
|---|---|---|
| Additive developer-bootstrap migration | `20261025000100_owner_authorised_developer_bootstrap.sql` | Pass locally; not production-applied |
| Owner-only issuance boundary | Dashboard-only function rejects deployed service role and stores only SHA-256 hash | Pass |
| Independent capability boundary | Exact developer claim shape; no leadership/class/payment/pupil/publishing authority | Pass |
| One-use/race controls | Live-purpose uniqueness, reservation, expiry, five-attempt lock and hash destruction | Pass |
| Code-free audit | Sensitive-key constraints plus distinct bootstrap/recovery reason codes | Pass |
| Disposable SQL acceptance | 9/9 migrations, 5/5 policy suites and expanded postflight | Pass |
| Static security acceptance | Portal/security suite 85/85 | Pass |
| Root schema mirror | Regenerated verbatim from all nine ordered migrations | Pass |
| Production state | No migration, Auth user, authorisation, password, deployment or gate change | Pass |

## Run 3 acceptance ledger

| Item | Evidence | Result |
|---|---|---|
| Multiplexed trusted endpoint | `/api/developer/bootstrap` uses existing `developer-service` Function | Pass; no Function-count increase |
| Gate and request boundary | Gate defaults false; exact same-origin JSON, 8 KiB limit and strong-password schema | Pass |
| Persistent privacy-safe rate limit | Migration `20261025000200`; rotating HMAC-only network and network+phone buckets | Pass locally; not production-applied |
| Auth Admin and compensation | Create/update only on trusted server; new user deleted on completion failure; unsafe release prohibited | Pass |
| Recovery session safety | Additive migration revokes all former `auth.sessions` after recovery | Pass |
| Private accessible UI | Labelled first-password/recovery fields, day/dark mobile reflow, no-OTP/share-password warnings | Pass |
| Endpoint/security acceptance | Portal/security 87/87 and dedicated endpoint 12/12 | Pass |
| Disposable SQL acceptance | 10/10 migrations, 5/5 policy suites and expanded postflight | Pass |
| Complete application regression | Visitor 1447/1447; accessibility 59 light + 5 dark; all secure/operations/portal/header browsers | Pass |
| Production state | No SQL, deployment, provider call, Auth user, password, authorisation or gate change | Pass |

## Permanent preservation rules

1. Never rerun the first seven production migrations. Future database work is additive.
2. Never retire `school_data` or any legacy table before verified cutover and preservation proof.
3. Never fabricate staff, pupil, guardian, consent, roster, provider or operational data.
4. Never store or log a readable password, OTP, provider secret or bootstrap authorisation.
5. Jibril uses the one-time owner-authorised no-OTP bootstrap. Leadership uses registered phone → OTP verification → private first-password creation.
6. Normal login remains phone + password with browser-session-only persistence.
7. Manual encrypted OTP dispatch remains available before Meta approval and permanently as the automated-relay fallback.
8. No WordPress integration. Historical WordPress files are superseded evidence only.
9. No public original/bulk child-media download by default. Historical child-related media is not imported as publishable without provenance/consent review.
10. Payments remain manual bank transfer or physical school POS with manual approval. Payment never controls admission, progression, results or access.
11. Automated account claims and admission tracking open only through their separate acceptance steps.
12. The owner is not required to run tests; agent-run automated evidence is mandatory.

## Feature and release gates

| Gate/capability | Required state now | Opening condition |
|---|---|---|
| Portal and portal accounts | Off unless an already-approved release explicitly says otherwise | Complete authenticated acceptance and production rollback evidence |
| Developer bootstrap | Implemented locally; environment gate remains off/undeployed | Run 4 private acceptance; one owner authorisation; immediately disable after one success |
| School account claims | Off | Manual dispatcher operational and Run 4 account-claim acceptance passes |
| Admission-tracking OTP | Off | Separate later acceptance after account claims |
| Public CMS publication | Absent/off | CMS RLS, audit, preview and published-only projections pass |
| Comments | Off | Signed-in identity, premoderation, abuse controls, audit and kill switch pass |
| Media downloads | Off by default | Asset-level permission and metadata-safe derivative proven |
| External/generative AI | Off | Separate privacy review and explicit owner approval; retrieval-first remains default |
| Paragon automatic OTP relay | Off | Meta/Render template, sender, webhook, direct test and signed relay gates all pass |
| Monnify/card payments | Permanently out of approved scope | Do not enable |

## External/owner decision holds

The following are not defects and do not block Runs 2–5 unless their capability is reached:

- school-owned Cloudinary account;
- orphan/unpublished media retention period;
- second safeguarding/consent reviewer for identifiable child media;
- separate manual admission-tracking acceptance window;
- a future private receiving number for Jibril if the owner later supplies one;
- private Meta and Render dashboard completion.

No password, OTP or provider secret is requested in chat.

## Run 4 preparation state

The three mode-only tool drifts observed after Run 3 were reconciled on 25 October 2026 by restoring their already-committed `100755` modes. No tool content changed.

Current official Supabase CLI guidance confirms that migration history is matched by timestamp version, not migration name. Read-only production inspection mapped all 15 existing remote versions. A fail-closed production bridge now represents those versions without replaying them and carries byte-for-byte copies of only pending migrations 009 and 010. Both pending filenames use current 14-digit versions; their SQL and reviewed hashes are unchanged.

The bridge generator/test, disposable 10-migration rebuild, five policy suites, postflight and complete application/browser regression passed. Production remains untouched. The live window must still prove that `migration list` aligns and the dry run proposes only migrations 009 and 010; history repair, `--include-all`, former-migration replay and migration-control bypass remain prohibited.

Evidence is in `RUN-04-MIGRATION-LEDGER-RECONCILIATION.md`; the full owner/agent boundary, stop conditions and execution order are in `RUN-04-PRODUCTION-ACCEPTANCE-REQUIREMENTS.md`.

## Tracker update protocol

At the end of every run:

1. record commit IDs and exact tests;
2. record production/read-only preservation counts before and after any live database change;
3. update gap statuses without deleting history;
4. state every feature gate and deployment change explicitly;
5. identify rollback boundaries;
6. leave unrelated workspace state excluded;
7. end the user-facing commit report with the required Meta/Render hold reminder from Section 35 of the master plan.
