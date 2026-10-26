# Run 5 CMS Foundation — Rollback and Containment Plan

**Date:** 26 October 2026
**Migration:** `20261026060000_public_cms_foundation.sql`
**Current Production state:** migration not applied; public CMS absent and off

## 1. Rollback principle

Run 5 separates four boundaries:

1. migration source in Git;
2. database schema application;
3. content/media import;
4. public route and feature activation.

A success at one boundary never authorises the next. Rollback must occur at the smallest affected boundary and must preserve all existing school, Auth, claim, audit and legacy records.

No generic destructive down migration is committed. After any accepted database application, a reviewed forward correction and gate-off containment is safer than dropping structures that may contain revisions or audit evidence.

## 2. Current repository/local rollback

Because Production has not received the migration, current rollback is source-only:

- revert the single Run 5 commit if the programme elects not to retain the foundation;
- regenerate `supabase-schema.sql` from the remaining ordered migrations;
- run the disposable SQL reconstruction and complete repository regression;
- do not alter migration history in Supabase;
- do not touch Production data, Auth, storage, deployments or gates.

Disposable local databases are created by `tools/test-sql-migrations.sh`, populated with fictional test fixtures inside rollback transactions, and dropped when the runner exits.

## 3. Migration-application failure

The source migration is wrapped in one PostgreSQL transaction. A statement failure before `commit` must roll back the complete Run 5 catalog change.

Required response:

1. stop immediately;
2. do not repair migration history, use `--include-all`, replay former migrations or bypass provider controls;
3. run the approved read-only preservation query;
4. confirm the pre-window counts and that zero planned CMS tables remain;
5. correct the source only through a new reviewed additive migration/version where Production history requires it;
6. rerun disposable reconstruction and all acceptance suites before another separately authorised window.

## 4. Successful schema application with no content

If the migration later commits but postflight fails while every CMS table is still empty:

- keep all public CMS routes and features off;
- revoke or contain only newly introduced CMS execution/read exposure through a reviewed additive correction if necessary;
- do not drop any former table, policy, function, Auth identity, claim or audit record;
- preserve the applied migration record and use a new forward correction rather than editing or replaying the accepted file;
- compare the full preservation baseline and investigate every unexplained delta.

Dropping the 20 new objects is not the default rollback. A destructive reverse operation would require a separate owner-authorised plan, proof that every new table is empty, a dependency review, an export, and a tested restore. None is authorised by Run 5.

## 5. After content or media exists

Once any CMS revision, approval, alias, audit event, media record, slot, navigation item, quality finding or engagement record exists:

- never drop or truncate the CMS structures as rollback;
- archive/unpublish affected content through accepted workflow controls;
- disable public routes and feature gates;
- retain immutable revisions, approval and publication audit;
- export the database and media manifest before any structural correction;
- apply forward-only corrective migrations;
- prove published projections are empty or restored to the last accepted revision.

Consent withdrawal must remove affected media from public projections without deleting the audit or source relationship history.

## 6. Public activation rollback

Public route activation is a later boundary. If a future rendering release fails:

1. disable the CMS/public route gate or roll back the application deployment;
2. leave the database and immutable revisions intact;
3. restore the last accepted application deployment;
4. verify former static routes and coded authorities still work until their separately accepted retirement;
5. purge/invalidate only the affected public cache after the safe deployment is active;
6. confirm Search, sitemap, feeds and service worker do not expose unpublished content.

Do not point failed dynamic routes to the homepage and do not delete aliases or content history.

## 7. Preservation stop conditions

Stop and investigate if any future Production window shows:

- a decrease in existing table, Auth user/identity, `school_data`, claim or audit counts;
- any former public table losing RLS;
- any of the 20 new CMS tables lacking RLS;
- a CMS table count other than exactly 20;
- any seeded CMS content/media/capability/engagement row;
- any unexpected storage object;
- any live claim challenge or bootstrap authorisation;
- a public CMS route becoming active;
- a developer receiving draft, review, publication, safeguarding or emergency authority;
- identifiable-child media visible without approved consent and required review;
- a draft/private/expired/archived/cancelled revision appearing in an anonymous projection;
- any account-claim, admission-tracking, relay, Monnify or card-payment gate changing.

## 8. Recovery verification

After containment or rollback, rerun:

```text
bash tools/test-sql-migrations.sh
node --test tools/tests/run5-cms-foundation.test.mjs
bash tools/run-current-tests.sh
```

Then repeat the read-only Production preservation query and record:

- tables/RLS/policies/functions;
- Auth users/identities;
- storage objects;
- `school_data`;
- pending/claimed account claims;
- live claim/bootstrap state;
- planned CMS tables and, if applied, zero-or-explained row counts;
- all feature-gate and deployment states.

A rollback is not accepted until both data preservation and public fail-closed behavior are proven.
