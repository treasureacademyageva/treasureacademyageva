# Run 5 Pre-Run-6 Debug and Release-Readiness Audit

**Date:** 26 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan and the accepted Runs 1–5 boundaries
**Audit boundary:** source, disposable-local database, automated browser/accessibility, read-only Production inspection and public fail-closed probes
**Mutation boundary:** no push, Production SQL, deployment, content/media import, Auth/storage change or public route/gate activation

## 1. Decision

The pre-Run-6 audit actively reproduced latent defects rather than treating the original green suites as sufficient. Four release-blocking Run 5 defect classes were confirmed and corrected before any Production application. Their negative paths are now regression-tested and the corrected disposable catalog has been independently inspected.

Runs 1–4 remain accepted at their already authorised boundaries. Run 5 is accepted at the repository/disposable-local boundary only. The Run 5 migration is absent from Production, and Production remains on the accepted Run 4 database and deployment state.

This audit closes the Run 5 technical prerequisite for later work; it does **not** authorise Run 6, Production migration, push/deployment, content import, provider configuration or public CMS activation. Run 6 remains blocked on the already recorded provider/owner decisions.

## 2. Exact run boundaries reviewed

| Run | Authorised boundary reached | Audit result |
|---:|---|---|
| 1 | Approved authority, baseline, preservation, route/content/API/database inventory and full local regression | Preserved; no release regression reproduced |
| 2 | Additive developer-bootstrap data source accepted locally; its required Production objects were later applied only inside the authorised Run 4 window | Preserved; no replay or migration-history mutation |
| 3 | Trusted gate-off endpoint/private UI accepted locally; the accepted code later reached Production through the controlled Run 4 release | Preserved; bootstrap endpoint remains fail-closed |
| 4 | Authorised live Stages 1–8 completed, including the accepted Stage 8 final `marked_sent` omission | Preserved exactly; the omitted event was not fabricated or backfilled |
| 5 | Original source accepted and committed locally as `367d94e2a4964559b86b1a496f9e04401b4f5842`; no Production migration/deployment/import/activation | Defects corrected locally; full evidence refreshed before this audit closure commit |

`origin/main` and the promoted Production deployment remain at the accepted Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`. The audit closure commit is the local commit containing this document; it is deliberately not pushed or deployed.

## 3. Adversarial methods

The review included:

- line-by-line privilege, RLS, function-execution and workflow inspection;
- direct anonymous and ordinary-account attempts against base relations and published projections;
- publication/scheduling race and lifecycle reasoning rather than happy-path checks only;
- malformed structured-document fuzz cases at document, metadata, Event, block and table-cell boundaries;
- post-publication media consent/provenance/lifecycle withdrawal tests;
- full reconstruction from all 12 ordered migrations in disposable PostgreSQL;
- independent `pg_catalog` inspection after reconstruction;
- generated-schema identity, whitespace, secret scan, complete Node/security/browser/accessibility regression and read-only Production comparison;
- public HTTP probes using empty invalid bodies only, so no challenge, account or operational record could be created.

## 4. Reproduced defects and corrections

### 4.1 Anonymous base-column exposure — Critical

**Reproduction:** the original Run 5 security-invoker views required anonymous `SELECT` on their source tables. RLS limited rows but did not limit columns, so a caller could query internal columns of otherwise public rows directly.

**Correction:** removed every anonymous CMS base-table privilege. The 8 public surfaces are explicit fixed-column, security-barrier projections whose reviewed predicates execute under the view owner. Creator IDs, source/provenance notes, consent references, alias reasons and audit fields are not projected. Ordinary signed-in accounts use the same safe projections unless a separately approved CMS capability allows private base-table RLS access.

**Regression proof:** anonymous base queries fail, all 8 public projections remain readable, and direct internal-column access through a projection fails. Disposable catalog inspection reports `anon_base_select=0` and `anon_view_select=8`.

### 4.2 Scheduled duplicate SEO-title bypass — High

**Reproduction:** the original collision check considered only already-published pointers. Two distinct entries could therefore reserve the same non-null SEO title while both were scheduled.

**Correction:** publishability checks now inspect both published and scheduled revision pointers. Immediate/scheduled publication takes a title-scoped transaction advisory lock before revalidation, and `cms_publish_due` revalidates again at activation time.

**Regression proof:** a second conflicting schedule is rejected while the first remains scheduled; due-time logic retains the fail-closed check.

### 4.3 Stale published-media eligibility — High

**Reproduction:** a media relationship could remain in the public projection after its current consent, provenance or lifecycle state ceased to qualify.

**Correction:** public media eligibility now requires the asset to be currently approved, unarchived, provenance-verified, consent-qualified and linked to a currently public revision. Featured/social IDs and image, video or Gallery blocks are suppressed when referenced assets no longer qualify. Related-content blocks are likewise withheld unless every referenced slug resolves to currently public content; arbitrary internal metadata is not projected.

**Regression proof:** withdrawing consent from a published identifiable-child fixture immediately removes the media relationship, public featured/social pointers and media block without deleting the text record or source/audit history. An unpublished related-content target is also excluded.

### 4.4 Permissive structured-document shapes — High

**Reproduction:** unknown block fields, Event fields on non-Event content, non-object metadata and nested/non-scalar table cells could pass the original checks.

**Correction:** document/type/block keysets and JSON types are closed; non-Event Event payloads fail; metadata must be an object; table dimensions and scalar string/number/boolean/null cells are bounded; executable/private material remains rejected.

**Regression proof:** dedicated rollback-safe cases reject each malformed shape. Valid time-bounded emergency-announcement and typed-Event publish/archive lifecycles also pass, proving the stricter checks do not reject accepted content.

### 4.5 Emergency override scope hardening — High

This was identified during lifecycle threat modelling before release. The Proprietress-only override is now restricted to time-bounded `announcement` records. It cannot become a generic review bypass for ordinary News, Event, Gallery or Page content.

## 5. Corrected source and catalog invariants

- Migration: `supabase/migrations/20261026060000_public_cms_foundation.sql`
- Migration SHA-256: `1b018df41ef2f6d85d7b946b09eec2932e7e8f804abaf194fc0184038174f288`
- Generated schema SHA-256: `506925518d227b78bc048e8271d0d272da05a50d230aa2d7bc3d478d60bfb181`
- 8 enum types; 20 CMS tables; 22 CMS functions; 8 public views; 27 policies; 13 triggers; 13 indexes
- 20/20 CMS tables have RLS
- 0 anonymous CMS base-table `SELECT` privileges
- 8/8 public CMS views grant anonymous `SELECT`
- 0 CMS functions executable by pseudo-role `PUBLIC`
- 16/16 security-definer CMS functions have an empty `search_path`
- 0 seeded CMS content/media/capability/engagement rows

## 6. Authoritative regressions

### SQL and focused static acceptance

```text
SQL MIGRATION QA: 12/12 migrations, 6/6 rollback-safe policy suites and the read-only postflight passed.
Run 5 focused static suite: 7/7 passed.
```

The SQL suite covers anonymous/base privilege separation, ordinary-account projection access, draft/review/approval/publication, owner-only emergency announcements, typed Event fields/routes, scheduling, scheduled SEO collision denial, due-time revalidation, aliases, archive/restore, immutable history, malformed documents/blocks, child-media consent/safeguarding, post-publication withdrawal and dormant engagement denial.

### Complete application regression

```text
Production audit: 16/16
Visitor UX: 45/45
Verified answers: 10/10
Portal/security: 87/87
Developer bootstrap endpoint: 12/12
Run 4 + Run 5 focused Node tests: 9/9
Chatbot safety: 11/11
Answer coverage: 20/20
Review gateway: 5 passed; 1 optional secret-bearing test skipped
Browser visitor QA: 1447/1447
Accessibility: 59/59 light; 5/5 dark; 0 serious/critical findings
Secure workflows: 5/5
Operations browser: 3/3
Portal browser: 7/7
Header browser: 7/7
```

Generated-schema identity, `git diff --check`, secret scan and final scope review passed.

## 7. Final read-only Production preservation comparison

Production remained unchanged after all local fixes and tests:

| Measure | Accepted Production value |
|---|---:|
| Public tables / RLS-enabled | 105 / 105 |
| Public policies | 136 |
| Public functions | 143 |
| Auth users / identities | 2 / 2 |
| Storage objects | 0 |
| `school_data` rows | 1 |
| Pending / claimed account claims | 2 / 2 |
| Live claim challenges | 0 |
| Live developer-bootstrap authorisations | 0 |
| Exact active developer capability rows | 1 |
| Planned CMS tables | 0 |

Additional read-only checks confirmed:

- Production migration history ends at `20261026040507_fix_owner_bootstrap_pgcrypto_schema`; Run 5 is absent;
- public signup remains disabled and phone authentication remains enabled;
- Auth, database, pooler, Realtime, REST and Storage report healthy;
- the promoted Production deployment is `READY` at accepted Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`;
- homepage returns `200`;
- bootstrap, account-claim request and admission-tracking request endpoints return fail-closed `404` to empty invalid POSTs;
- `/news`, `/events` and `/gallery` remain absent (`404`), so no public CMS route was activated.

## 8. Known holds that are not silently closed

- provider password minimum remains 6 while trusted application paths enforce 12–128; public signup remains disabled (`GAP-003`);
- Cloudinary/provider configuration, orphan retention and the second real child-media reviewer remain Run 6 holds;
- protected CMS UI/preview, dynamic public routes, engagement, verified content migration, Search cutover and final routing/discovery remain later-run work;
- account claims, admission tracking, Paragon relay, cards and Monnify remain off;
- no real roster, child-media consent, provider or operational facts were invented.

## 9. Boundary conclusion

Run 5 is release-ready only for its accepted repository/disposable-local boundary. It is **not** Production-applied or publicly active. Any future Production migration requires a separate owner-authorised window, exact pre/post preservation counts and this rollback plan. Run 6 must not begin until its recorded provider/owner holds are resolved or the owner explicitly redefines that run’s authorised scope.
