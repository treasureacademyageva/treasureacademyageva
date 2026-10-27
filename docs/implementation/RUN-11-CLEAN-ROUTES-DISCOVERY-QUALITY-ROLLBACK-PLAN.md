# Run 11 — Clean Routes, Discovery and Quality Rollback Plan

**Date:** 27 October 2026
**Scope:** future release of the accepted Run 11 source and migration
**Current state:** local only; Production is unchanged

## 1. Stop conditions

Stop or roll back immediately if any of these occurs:

- homepage, former public URL, clean destination, portal login, `robots.txt` or sitemap fails its probe;
- any former URL chains, loops, lands on `/`, or loses its query/fragment semantics;
- canonical, Open Graph, internal link or sitemap destination disagrees;
- a private/noindex/alias/filter/pagination URL enters the sitemap;
- unknown/out-of-range routes redirect or return indexable 200 content;
- table/policy/function/Auth/storage or preservation counts decrease unexpectedly;
- a public gate is not exact `false` during the gate-off release;
- a publication, archive or consent withdrawal remains visible beyond the accepted 30-second edge window plus probe tolerance;
- backup MAC/decryption/restore validation fails;
- any secret, password, OTP, raw Search query, full IP address or private record enters output/log evidence.

## 2. Before an authorised release

1. Record exact Git commit, Vercel deployment/source, Supabase migration ledger and preservation counts.
2. Create an encrypted custom-format database export using the private backup operator.
3. Verify the HMAC, byte-identical decryption and full restore in a disposable local database.
4. Retain the previously promoted Vercel deployment ID and confirm it is `READY`.
5. Confirm every public/CMS/media/engagement/comment/placement/Search/core-slot/inventory/account/admission/relay gate is exact `false`.
6. Apply only unapplied forward migrations in reviewed order. Never rerun the first seven migrations, use broad `db push`, repair history or retire `school_data`.

## 3. Source rollback

If source/routing acceptance fails:

1. keep all feature gates false;
2. promote the exact previously recorded `READY` Vercel deployment;
3. verify canonical host, homepage, portal, static discovery and all fail-closed endpoint probes;
4. do not delete the failed deployment until evidence and request IDs are retained;
5. correct forward in source and repeat protected acceptance before any new promotion.

The current preserved source is `a552618e40791a592cb9e586b2963d61ed46ad2c` on deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2`.

## 4. Database rollback

Migration 17 is additive/row-preserving but updates public-path strings and replaces a view/function/constraint contract. Do not delete preserved rows and do not reverse the migration by replaying an old file.

If the database contract causes a release issue:

1. keep dependent gates false and promote the former source deployment;
2. record the exact failing catalog/data state;
3. use a new reviewed forward migration to restore the former path contract only if the former source must remain active;
4. retain audit/history rows and preserve clean/old path mapping evidence;
5. restore the encrypted backup to an isolated database first if data recovery is suspected;
6. restore Production data only through a separately authorised incident procedure after comparing counts and immutable history.

## 5. Cache and withdrawal rollback

- Dynamic News, Events, Gallery and sitemap remain network/server controlled.
- If stale output is observed, disable the affected public gate first, then promote the former deployment.
- Do not enlarge shared-cache windows to hide availability issues.
- Advance the service-worker cache identity on every corrective shell release.
- Verify a withdrawn record returns the correct non-indexable state after the 30-second shared-cache window and does not remain in Search/sitemap/related content.

## 6. Backup/recovery objectives

- **Schedule:** encrypted database export at least weekly and immediately before every Production migration.
- **Scheduled RPO:** no more than seven days; migration-window RPO is the pre-change export time.
- **Restore validation target:** complete authenticated isolated restore and catalog/sentinel validation within 60 minutes.
- **Rehearsal:** quarterly and after every material schema or backup-tool change.
- **Retention/access:** encrypted artifacts and MAC/manifest remain outside the repository on private controlled storage; passphrases and PostgreSQL service credentials never enter source, logs or chat.
- **Acceptance:** an export is untrusted until MAC verification, decryption and isolated restore succeed.

## 7. Local repository rollback

Before any Production release, Run 11 can be removed by reverting its single implementation commit. Do not hand-delete generated files: revert the commit, run the earlier accepted generators, then execute the complete regression and 16-migration SQL baseline.

No current Production rollback action is necessary because Run 11 has not been pushed, deployed or applied.
