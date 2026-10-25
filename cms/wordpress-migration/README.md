# WordPress migration starter — superseded historical prototype

> **Do not deploy or extend this prototype.** The owner-approved architecture is the
> first-party Supabase/Vercel CMS in
> `docs/TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md`; WordPress must not be
> integrated. These files are retained temporarily as decision history until their legacy
> audit assertions are replaced without reducing test coverage.

This folder records an earlier proposal that never changed production hosting or DNS.

## Files

- `content-model.json` — public content types, required review fields and prohibited data.
- `treasure-academy-core.php` — staging-only plugin starter for public content types, private workflow metadata, least-privilege review capabilities, fail-closed publication and expiry checks.
- `../../docs/CMS-SEO-AEO-STRATEGY-2026.md` — architecture, workflow, security, SEO/AEO and migration gates.

## Important

Do not upload this plugin to production without a WordPress developer review, a managed staging site and owner approval. It intentionally does not provide admissions, pupil results, payment processing, safeguarding cases or a parent portal.

The starter has no credentials and no remote connection. It must remain excluded from the Vercel public deployment.

## Starter behavior

- Normal Pages and the six public custom content types cannot publish without content owner, source reference, a valid non-future review date and exact `owner_approved` status.
- Updates, events and office guidance also require a future expiry date. A daily job returns expired items to draft.
- Workflow dates use `YYYY-MM-DD`.
- The School Content Reviewer role can review drafts but cannot publish, upload media or delete content. Editors and administrators receive the custom management capabilities on activation.
- Source, content-owner and approval fields are not exposed through the public REST response; review and expiry dates may be exposed for public freshness labels. Review and approval must happen on a saved draft before publication is attempted.
- This is a governance starter, not a finished editor interface. A developer must add clearly labelled admin fields, validation notices and media-authority controls on staging.

## Staging review order

1. Provision managed WordPress staging over HTTPS.
2. Back it up before customisation.
3. Review the plugin against the staging WordPress/PHP versions.
4. Add a block theme using the current brand tokens.
5. Add admin fields with clear instructions for source, owner, review and expiry.
6. Create least-privilege named users and MFA.
7. Migrate only owner-approved public content.
8. Test expiry, revisions, backups, REST permissions, accessibility, SEO and redirects.
9. Obtain owner sign-off before any DNS change.
