# Run 10 — Verified Content, Search, Core Slots and Inventory Rollback Plan

**Prepared:** 27 October 2026
**Current Production impact:** inactive environment values only; Run 10 source/SQL is not pushed, deployed, applied or activated

## 1. Immediate kill-switch order

For a Search privacy, citation, stale-content, core-slot or inventory incident:

1. set the affected subordinate gate exact false:
   - `PUBLIC_CMS_SEARCH_ENABLED=false`;
   - `PUBLIC_CMS_CORE_SLOTS_ENABLED=false`;
   - `PUBLIC_INVENTORY_ENABLED=false`;
2. if several public CMS surfaces are affected, set `PUBLIC_CMS_ENABLED=false`;
3. redeploy/verify environment configuration only when the platform requires a deployment for the change;
4. preserve candidates, revisions, sources, slots, inventory ledgers and immutable audit events;
5. do not retire static authority or `school_data` during containment.

## 2. Expected fail-closed behavior

With Search false:

- the new endpoint returns 404 before database access;
- the reviewed local Search remains the pre-cutover authority;
- no HMAC bucket or aggregate Search insight is written.

With Search true but its service unavailable:

- the page reports Search unavailable;
- it does not substitute coded answers as if they were current database answers.

With core slots false:

- the endpoint returns 404 before database access;
- governed pages retain their reviewed static content and add no database slot section.

With inventory false:

- the endpoint returns 404 before database access;
- Shop does not present a database availability panel;
- private office inventory and order controls remain protected and unchanged.

## 3. Source rollback

Redeploy the last accepted pre-Run-10 source if a source rollback is required. The prior source does not dispatch Search/core-slot/inventory actions, load their public clients or expose migration/freshness controls.

Do not push local `main`, create a deployment or promote a preview merely to test rollback. A future release must record the before/after commit and verify the exact gate-off behavior.

## 4. Database rollback posture

The migration is additive. Do not drop:

- verified-information source/review fields;
- candidate, migration-event or revision-source relations;
- core-slot or immutable slot-event relations;
- inventory constraints/projections;
- Search projections, functions, aggregate insights or HMAC bucket relation.

Preferred rollback is exact-false gates, source rollback when necessary and a reviewed additive correction. Existing data and audit history remain governed evidence.

## 5. Content migration incident

If a candidate is wrong or cannot be verified:

- leave it held or record a reasoned rejection;
- never edit the source hash or immutable event history;
- regenerate the repository manifest only from the corrected tracked source;
- do not stage historical media through the text-only workflow;
- do not bulk-verify candidates.

If text was already imported as a draft, keep the source link and use the normal revision/review workflow. Do not hard-delete history. If an imported item was published incorrectly, archive it through the accepted publication workflow and preserve the incident evidence.

## 6. Stale or incorrect public information

- disable Search and/or core slots if the stale fact is broadly discoverable;
- archive or supersede the affected publication through the accepted workflow;
- correct its source, accountable owner and next-review date in a new review cycle;
- confirm that the public projection excludes overdue, future or expired facts;
- never extend a review date merely to suppress a stale warning.

## 7. Search privacy or abuse incident

1. disable `PUBLIC_CMS_SEARCH_ENABLED`;
2. preserve only route/time/request ID and aggregate state needed for investigation—never copy raw queries or private text into evidence;
3. verify no query/full-IP/user-agent/actor column exists;
4. rotate `CMS_SEARCH_HASH_PEPPER` privately if bucket correlation is in doubt;
5. allow expired buckets to be removed or clear the ephemeral bucket table in an authorised database window;
6. retain daily topic/zero-result aggregates only if they remain privacy-safe;
7. rerun origin/body/private-query/rate/citation/browser tests before reactivation.

Never add raw-query analytics, permanent full-IP retention or a third-party AI service as an incident workaround.

## 8. Core-slot incident

- disable `PUBLIC_CMS_CORE_SLOTS_ENABLED`;
- preserve the slot and immutable event history;
- deactivate or replace the slot through `cms_set_core_page_slot` with a new reason;
- verify the entry is still public, current and of type Page or Announcement;
- verify the server strips unknown block fields and the browser uses only DOM text sinks;
- restore only after static/core-slot parity and accessibility checks pass.

## 9. Inventory incident

- disable `PUBLIC_INVENTORY_ENABLED`;
- do not change stock merely to make the public state look correct;
- reconcile the office ledger through authorised movements, stocktake, procurement, reservation or order controls;
- preserve former-row mapping and movement history;
- verify `on_hand - reserved - damaged` is non-negative;
- verify public JSON contains no balance, movement, cost, price or actor field;
- activate only after office confirmation and a separate decision.

## 10. Stop conditions for any future release

Stop before activation if:

- any earlier migration would be replayed or repaired;
- Production preservation counts decrease unexpectedly;
- a candidate can bypass held status, source hash or text-only validation;
- historical child media enters the migration document;
- stale, expired, draft or archived information enters a public projection;
- Search accepts GET/query-string submissions or stores raw queries/full IPs;
- private-query detection reaches the database before failing closed;
- enabled Search failure falls back to coded answers;
- Search result or citation URLs can leave the local origin;
- a core slot accepts arbitrary page/mount/type or raw HTML;
- inventory exposes quantities, prices, movements or actors;
- office-unreconciled stock becomes public;
- any gate accepts non-lowercase `true` or defaults open;
- Function count exceeds 12.

## 11. Re-acceptance checklist

Before re-enabling an affected gate:

1. complete the 16-migration disposable reconstruction;
2. pass all 10 rollback-safe SQL suites and postflight;
3. pass Runs 8–10 focused Node/API tests;
4. pass Run 10 Search/core-slot/inventory browser and accessibility tests;
5. pass the complete current regression;
6. validate 12/12 Function routing;
7. verify source hashes, review dates and public fixed-column output;
8. prove exact false → authorised true → false behavior in a protected window;
9. obtain a separate explicit activation decision.
