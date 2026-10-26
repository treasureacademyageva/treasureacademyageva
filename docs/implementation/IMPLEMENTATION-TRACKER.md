# Dynamic Platform Implementation Tracker

**Authority:** `docs/TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md`
**Owner approval:** Shaibu Sidikat Ruth authorised the complete implementation
**Programme:** 12 controlled runs; additive, reversible and fail-closed
**Last updated:** 26 October 2026 — Run 4 manual account-claim acceptance closure
**Overall status:** Runs 1–4 are complete. The owner-authorised developer bootstrap and protected manual Proprietress account claim were accepted and closed, all temporary resources were deleted, and ordinary phone/password login passed for both accepted accounts. Stage 8 was accepted on aggregated evidence with the omitted final `Mark sent` audit click documented explicitly; no audit was fabricated. Stage 9 was not authorised, so production account claims, admission tracking and the Paragon relay remain false. Run 5 is ready for a separate start decision.

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
| 4 | Owner-authorised developer acceptance and manual account-claim OTP | Private one-use bootstrap acceptance; gate disabled afterward; encrypted manual claim queue proven before claims open; no OTP to the sender number | Runs 2–3, the prepared migration-ledger bridge and an owner acceptance window | `DONE` — Stages 1–8 accepted and closed; Stage 8 carries a documented final `Mark sent` audit exception accepted by the owner; Stage 9 not authorised and production claims remain false |
| 5 | First-party CMS schema and policy | One additive CMS migration; content, revisions, structured blocks, aliases, workflow, audit, published-only projections and RLS; all former records preserved | Run 4 | `READY` — prerequisite accepted; requires a separate start decision |
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

## Run 4 live acceptance ledger — Stages 1–7

| Item | Evidence | Result |
|---|---|---|
| Preservation and exact migrations | Production retained former records; migrations 009/010 applied under reviewed versions and original checksums | Pass |
| Phone Auth boundary | Phone Auth enabled; public signup and SMS auto-confirm disabled | Pass |
| Initial issuer failure | First owner SQL action failed transactionally on the pgcrypto schema reference; immediate counts remained zero | Safely contained |
| Additive correction | `20261026040507_fix_owner_bootstrap_pgcrypto_schema.sql`; only `gen_random_bytes` and `digest` moved from `public` to `extensions` | Pass |
| Corrective source commit | `6668b848a51edd2bc502e12851925bf1521b6808`; migration/test only | Pass |
| Protected preview | Dedicated branch, four branch-scoped variables and Vercel Authentication; anonymous requests redirected to SSO | Pass |
| Exactly one owner authority | One ten-minute `initial_password` authorisation issued in the official SQL Editor; no raw value recorded | Pass |
| Bootstrap completion | One Auth identity/profile; claim consumed once; authorisation consumed with hash destroyed; no OTP | Pass |
| Exact authority | `parent` + leadership `none`; four developer capabilities only; no class, pupil, guardian or applicant relationship | Pass |
| No false OTP verification | Application phone verification fields null; Auth phone confirmation recorded only as owner attestation | Pass |
| Normal login | Production Developer Console phone/password sign-in succeeded privately | Pass |
| Immediate closure | Gate reset false, gate-enabled deployment deleted, replacement verified, every acceptance deployment/variable/key/branch deleted | Pass |
| Production isolation | Current production `READY/PROMOTED`; homepage 200; bootstrap application 404; account claims false | Pass |
| Sanitised evidence | `RUN-04-DEVELOPER-BOOTSTRAP-ACCEPTANCE-EVIDENCE.md` | Recorded |
| Next boundary | Fresh protected Stage 8 manual Proprietress claim acceptance; admission tracking and relay stay false | Completed separately below |

## Run 4 live acceptance ledger — Stage 8

| Item | Evidence | Result |
|---|---|---|
| Isolated protected preview | Dedicated branch; eight Preview Config and five Preview Secret values; anonymous requests redirected to Vercel SSO | Pass |
| Production isolation | Production claims/bootstrap remained false; admission tracking and relay remained false | Pass |
| Exact approved claimant | Existing Proprietress claim at the registered phone ending `3478`; no dummy person or public-line claimant | Pass |
| Generic request boundary | Public response remained generic; queue exposed only purpose/channel/time/last four before reveal | Pass |
| One-active-challenge replacement | Three sequential short-window challenges; former challenges safely cancelled/replaced; never duplicate live challenges | Pass |
| Encrypted reveal boundary | Every server delivery payload destroyed after reveal/terminal processing; setup hashes destroyed after completion | Pass |
| WhatsApp delivery | Exact unchanged payload delivered to the registered destination; no OTP/test to `6650` | Pass by private operator confirmation |
| Dispatch audit | Earlier replaced challenge recorded `marked_sent`; final successful challenge omitted the `Mark sent` click and therefore has no such event | Owner-accepted documented exception; no backfill |
| OTP and private password | Final challenge verified with zero failed attempts; Proprietress privately created her own compliant password | Pass |
| Exact authority | `admin` + `headmistress` + `Proprietress`; no class, pupil, guardian, applicant or developer link/capability | Pass |
| Ordinary login and session closure | Proprietress administrator portal login succeeded; both operators signed out; no active target session/refresh token remained | Pass |
| Sanitised audit | Forbidden OTP/code/phone/password/message detail keys absent; no secrets recorded | Pass |
| Immediate closure | Claim gate reset false; three deployments, thirteen variables, temporary Supabase key and branch deleted; former URLs/alias 404 | Pass |
| Sanitised evidence | `RUN-04-MANUAL-ACCOUNT-CLAIM-ACCEPTANCE-EVIDENCE.md` | Recorded |
| Stage 9 boundary | Not authorised; production account claims remain false | Hold |

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
| Portal and portal accounts | Portal enabled under the previously approved production configuration; unrelated account/office gates preserved | Change only through their approved acceptance controls |
| Developer bootstrap | Accepted once and closed; production gate false; temporary preview/key/branch deleted | Reopen only through a new owner-authorised recovery window |
| School account claims | Off in production; Stage 8 accepted and closed | A separately authorised Stage 9 environment change, new Production deployment and verification are still required before opening |
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

## Run 4 migration bridge and live state

The three mode-only tool drifts observed after Run 3 were reconciled on 25 October 2026 by restoring their already-committed `100755` modes. No tool content changed.

Official Supabase CLI guidance confirmed that migration history is matched by timestamp version, not migration name. Read-only production inspection mapped all 15 pre-Run-4 remote versions. The fail-closed bridge represented those versions without replaying them and carried byte-for-byte copies of only migrations 009 and 010. Both reviewed files retained their exact hashes.

The bridge generator/test, disposable 10-migration rebuild, five policy suites, postflight and complete application/browser regression passed. The live window then aligned the ledger, applied only migrations 009/010, and preserved the prohibition on history repair, `--include-all`, former-migration replay and migration-control bypass.

A separately tracked additive migration, `20261026040507_fix_owner_bootstrap_pgcrypto_schema.sql`, corrected two pgcrypto schema qualifiers after the first owner issuance attempt failed transactionally. The developer bootstrap then passed and was closed. Stage 8 subsequently proved the protected manual account-claim flow, one-active-challenge replacement, encrypted reveal destruction, exact Proprietress authority and ordinary login. The owner accepted the aggregated evidence with the final `Mark sent` audit omission documented explicitly. All temporary resources were deleted. Stage 9 was not authorised, so production account claims remain false.

Migration reconciliation evidence is in `RUN-04-MIGRATION-LEDGER-RECONCILIATION.md`; developer acceptance evidence is in `RUN-04-DEVELOPER-BOOTSTRAP-ACCEPTANCE-EVIDENCE.md`; manual account-claim evidence is in `RUN-04-MANUAL-ACCOUNT-CLAIM-ACCEPTANCE-EVIDENCE.md`; the full owner/agent boundary, stop conditions and execution order are in `RUN-04-PRODUCTION-ACCEPTANCE-REQUIREMENTS.md`.

## Tracker update protocol

At the end of every run:

1. record commit IDs and exact tests;
2. record production/read-only preservation counts before and after any live database change;
3. update gap statuses without deleting history;
4. state every feature gate and deployment change explicitly;
5. identify rollback boundaries;
6. leave unrelated workspace state excluded;
7. end the user-facing commit report with the required Meta/Render hold reminder from Section 35 of the master plan.
