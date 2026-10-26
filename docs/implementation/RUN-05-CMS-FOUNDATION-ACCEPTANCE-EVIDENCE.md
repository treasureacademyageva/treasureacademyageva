# Run 5 First-Party CMS Foundation — Acceptance Evidence

**Date:** 26 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan
**Scope:** repository and disposable-local acceptance only
**Production status:** not applied; no public CMS route, content, media, provider or feature gate activated

## 1. Acceptance boundary

Run 5 authorises one additive first-party Supabase CMS schema/policy source migration and its tests. It does not authorise:

- applying the migration to Production;
- importing static, legacy or owner-supplied content;
- importing historical child-related media;
- creating a Cloudinary integration;
- activating News, Events, Gallery, Search or engagement routes;
- enabling account claims, admission tracking or the Paragon relay;
- changing any existing public source of truth before a verified cutover.

Production application and public activation remain separate controlled boundaries. Stage 9 remains unauthorised.

## 2. Accepted source migration

`supabase/migrations/20261026060000_public_cms_foundation.sql`

- SHA-256: `1b018df41ef2f6d85d7b946b09eec2932e7e8f804abaf194fc0184038174f288`
- one transaction: `begin` → additive objects and grants → `commit`;
- 8 CMS enum types;
- 20 new RLS-enabled tables;
- 22 CMS functions;
- 8 fixed-column, security-barrier published-only views;
- 27 RLS policies;
- 13 immutable/validation/no-hard-delete triggers;
- 13 supporting indexes;
- zero seeded content, media, capability, navigation, slot, reaction, comment, view or approval rows.

The migration does not alter, truncate, delete, repurpose or retire `school_data`, legacy `news_posts/news_images`, any school-record table, or any former production record. It does not revive `db/` or WordPress as an authority.

## 3. Accepted model and controls

### Content and publication

The migration provides:

- stable content identities and canonical typed paths;
- immutable numbered source revisions;
- structured allowlisted blocks with bounded payloads;
- tag, controlled search-term and media relationships;
- retained slug aliases;
- factual, safeguarding and publication approvals;
- append-only publication events;
- quality findings;
- scheduling, due-time revalidation, publication, archive and revision restore;
- homepage/site slots and navigation foundations;
- dormant privacy-safe view, signed-in like and premoderated-comment structures;
- published-only projections for entries, blocks, tags, controlled search terms, media, slots, navigation and redirects.

Anonymous accounts receive no CMS base-table privilege. Fixed-column public views execute the reviewed published-only predicates without exposing creator IDs, internal provenance, consent references, alias reasons or audit fields. Signed-in ordinary accounts likewise use the safe views; only capability-approved CMS actors pass private base-table RLS policies.

A new draft does not replace the former accepted published revision. Restoring an archived revision creates a new private draft and clears the former published pointer rather than silently resurrecting content.

### Structured-content safety

The database rejects:

- unsupported document and block fields;
- raw HTML-like tags and executable schemes;
- script/event-handler keys;
- password, OTP, phone, secret, token, credential and message-shaped private material;
- malformed or oversized blocks/documents;
- unmanaged featured, social, image, video or gallery asset references;
- unsafe relative paths and invalid slugs.

Revision, block, tag-link, media-link, alias, approval and publication history is append-only. Content identities and media metadata cannot be hard-deleted through ordinary database mutation; archive/state transitions are required.

### CMS authority

CMS authority is independent from school-record authority:

- Proprietress: administration, ordinary publication and time-bounded emergency publication;
- Headmistress: draft/review/publication;
- Assistant Headmistress: draft/review/publication;
- approved editors/reviewers: only explicitly granted CMS capabilities;
- developer information-review capability: private CMS visibility only, never draft/review/publish authority;
- emergency publication cannot be delegated away from the Proprietress and is limited to time-bounded announcements.

CMS capability grants do not change a profile’s pupil, payment, results, admission or other school-record role.

### Child-media fail-closed behavior

Identifiable child media requires:

- an approved media lifecycle state;
- verified provenance;
- affirmative approved consent — `not_required` is rejected for identifiable children;
- public-derivative-only treatment;
- an independent safeguarding approval unless the Proprietress uses the explicitly audited, forced-expiry emergency path.

The child-media creator cannot approve their own ordinary safeguarding review. Consent withdrawal before a scheduled publication causes due-time publication to fail closed and return the entry to `changes_requested`.

### Dormant engagement

The views, likes, comments and moderation-event tables have RLS but no anonymous/authenticated policies or grants. They remain unusable until Run 9 acceptance and feature-gate work.

## 4. Disposable SQL acceptance

Command:

```text
bash tools/test-sql-migrations.sh
```

Result:

```text
SQL MIGRATION QA: 12/12 migrations, 6/6 rollback-safe policy suites and the read-only postflight passed.
```

The runner now discovers migration and `*.test.sql` suite totals dynamically. The local harness mirrors Supabase’s `extensions` schema for pgcrypto, and the accepted Run 4 bootstrap assertions now verify the corrected extension-qualified implementation.

`supabase/tests/public_cms_policy.test.sql` runs in a transaction and rolls back every fictional fixture. It proves:

- all 20 foundation tables have RLS;
- no migration seed data;
- CMS/school-record privilege separation;
- Proprietress-only capability administration and emergency authority;
- Headmistress and Assistant Headmistress publication authority;
- developer read-only information review with no publication authority;
- direct-DML denial;
- draft isolation from anonymous and ordinary accounts;
- unsafe HTML/XSS, private material and unmanaged-media rejection;
- factual/publication approval and published-only projection behavior;
- anonymous CMS base-table denial and fixed-column projection access for anonymous and ordinary signed-in accounts;
- immutable history and no hard deletion;
- stable aliases;
- old published revision stability while a new draft is reviewed;
- archive removal and private restore;
- owner-only, forced-expiry emergency announcement publication and denial for non-announcement types;
- typed Event publication fields and canonical route projection;
- scheduled visibility, due-time revalidation and publication;
- collision rejection across already-published and already-scheduled SEO titles;
- rejection of unknown document/block fields, non-Event Event payloads, non-object metadata and nested/invalid table cells;
- identifiable-child consent and independent safeguarding review;
- immediate suppression of public media relationships, featured/social pointers and media blocks when consent/provenance/lifecycle state ceases to qualify;
- denial of related-content blocks whose targets are not currently public;
- dormant engagement denial.

## 5. Pre-Run-6 adversarial audit and complete repository acceptance

A separate pre-Run-6 source, privilege, lifecycle and catalog review did not rely on the original green tests. It reproduced four release-blocking classes of defect in the original local Run 5 commit: public-view access depended on anonymous base-table grants, scheduled revisions were absent from SEO-title collision checks, published media was not revalidated after consent/provenance/lifecycle changes, and structured-document validation accepted several unrecognised or nested shapes. The audit also narrowed emergency override publication to time-bounded announcements.

All defects were corrected before any Production application. Regression fixtures now prove the negative paths, and disposable catalog inspection proves 20/20 CMS tables use RLS, anonymous has zero CMS base-table privileges, all 8 published projections are granted, pseudo-role `PUBLIC` can execute zero CMS functions, and all 16 security-definer CMS functions use an empty `search_path`. The complete finding-by-finding record is `RUN-05-PRE-RUN-06-DEBUG-AUDIT.md`.

Dedicated static suite:

```text
node --test tools/tests/run5-cms-foundation.test.mjs
```

Result: `7/7` passed.

Complete current regression:

```text
bash tools/run-current-tests.sh
```

Result: passed, including:

- Production audit `16/16`;
- Visitor UX `45/45`;
- verified answers `10/10`;
- portal/security `87/87`;
- developer bootstrap endpoint `12/12`;
- Run 4 and Run 5 Node tests `9/9`;
- chatbot safety `11/11`;
- answer coverage `20/20`;
- review gateway `5 passed`, `1 optional secret-bearing test skipped`;
- browser visitor QA `1447/1447`;
- accessibility `59/59` light and `5/5` dark with no serious/critical finding;
- secure workflows `5/5`;
- operations browser `3/3`;
- portal browser `7/7`;
- header browser `7/7`.

`supabase-schema.sql` was regenerated from all 12 ordered migrations, ends with the exact Run 5 migration and has SHA-256 `506925518d227b78bc048e8271d0d272da05a50d230aa2d7bc3d478d60bfb181`.

## 6. Production preservation comparison

A read-only Supabase query was run before implementation and repeated after all local acceptance. The values are identical:

| Measure | Before | After local acceptance |
|---|---:|---:|
| Public tables | 105 | 105 |
| Public tables with RLS | 105 | 105 |
| Public policies | 136 | 136 |
| Public functions | 143 | 143 |
| Auth users | 2 | 2 |
| Auth identities | 2 | 2 |
| Storage objects | 0 | 0 |
| `school_data` rows | 1 | 1 |
| Pending account claims | 2 | 2 |
| Claimed account claims | 2 | 2 |
| Live claim challenges | 0 | 0 |
| Live developer-bootstrap authorisations | 0 | 0 |
| Planned CMS tables present | 0 | 0 |

This proves the Run 5 implementation did not mutate Production. No Production migration, content import, Auth operation, storage operation, deployment, provider call or gate change occurred.

## 7. Separate future Production boundary

If a later owner-authorised Production migration window is opened, the expected additive catalog delta is:

- public tables: `105 → 125`, all `125` RLS-enabled;
- public policies: `136 → 163`;
- public functions: `143 → 165`;
- exactly 20 planned CMS tables;
- unchanged Auth users/identities, storage objects, `school_data`, claims, challenges and bootstrap state;
- zero rows in all new CMS content/media/engagement structures immediately after migration.

These are future acceptance expectations, not permission to apply the migration. Any mismatch is a stop condition.

## 8. Remaining holds

Run 5 does not close the following later-run work:

- Cloudinary/provider and media upload governance;
- assignment of the second real safeguarding reviewer;
- protected CMS portal UI and preview;
- dynamic News/Event/Gallery rendering;
- engagement activation;
- verified content migration and coded-authority retirement;
- dynamic Search/sitemap/feed/cache integration;
- Production migration and public activation.

The rollback and containment procedure is documented in `RUN-05-CMS-FOUNDATION-ROLLBACK-PLAN.md`.
