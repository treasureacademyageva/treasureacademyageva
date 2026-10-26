# Run 6 Cloudinary Media Foundation Rollback Plan

**Date:** 26 October 2026
**Scope:** Run 6 media-governance migration, trusted media dispatcher, Cloudinary configuration contract, CSP and dormant media gate
**Standing rule:** preserve Supabase records and Cloudinary assets; contain access first; use forward repair rather than destructive schema reversal

## 1. Current rollback boundary

Run 6 has not been pushed, deployed, Production-applied or provider-smoke-tested. No dedicated API key/secret has been entered and no media record or asset was created. At this boundary, rollback means abandoning the local Run 6 commit and returning the working branch to the accepted pre-Run-6 commit `c42167f8b2dcb44c5ac27ed26060931ab179aa3b`.

`origin/main` and promoted Production remain `a552618e40791a592cb9e586b2963d61ed46ad2c`, so they require no rollback.

## 2. Universal containment order

If a later preview or Production acceptance fails:

1. set `CMS_MEDIA_ENABLED=false` in the affected Vercel environment;
2. redeploy/confirm the gate-off configuration and prove every media action returns fail-closed `404`;
3. if credential exposure or unexplained provider activity is suspected, disable the dedicated Cloudinary API key in the provider dashboard;
4. preserve Supabase media rows, immutable events, upload authorisations and Cloudinary assets;
5. capture non-secret request IDs, timestamps, route/status evidence, affected media UUID/public ID and provider asset UID;
6. diagnose against the accepted source hashes and database migration ledger;
7. apply an additive forward fix and repeat the complete local/security/provider acceptance before reopening.

No incident authorises automatic orphan deletion, migration-history repair, replay of former migrations or retirement of `school_data`.

## 3. Stop conditions

Immediately contain the media gate for any of the following:

- a route works while `CMS_MEDIA_ENABLED` is not exactly `true`;
- a request succeeds without an active browser session and required capability;
- cross-origin upload signing succeeds;
- the Cloudinary API secret, Supabase server key or raw consent reference reaches a browser/log/public response;
- unsigned, wrong-folder, wrong-tag, non-authenticated or overwrite-enabled upload is accepted;
- provider format/size/identity does not match the reservation but Supabase records completion;
- an identifiable-child creator can review their own media;
- publication succeeds without required provenance/consent/safeguarding/alt text;
- an original or unbounded derivative becomes available;
- a download derivative works without explicit current `download` placement;
- CSP permits a broad Cloudinary wildcard or another cloud environment;
- a quota/manifest response exposes provider credentials or consent references;
- an automatic provider/database delete occurs;
- preserved table/Auth/storage/legacy counts decrease unexpectedly.

## 4. Rollback by layer

### 4.1 Source or deployment defect before database application

- keep the gate false;
- promote the last accepted deployment;
- do not alter Supabase;
- remove only the defective preview/deployment after evidence capture;
- fix locally and rerun SQL, Node, secret, browser and accessibility suites.

### 4.2 Database migration applied, gate still false

Do not run a down migration. The Run 6 objects are additive and data-neutral. Leave them dormant, preserve all rows, and forward-fix with a new timestamped migration after disposable reconstruction and catalog comparison.

If migration execution fails transactionally, verify that PostgreSQL rolled back the migration, compare catalog/counts, correct the source in a new reviewed boundary and do not mark or repair migration history merely to bypass the failure.

### 4.3 Credential/configuration defect

- disable the dedicated Cloudinary key;
- keep `CMS_MEDIA_ENABLED=false`;
- create a replacement dedicated key in the provider dashboard only;
- replace the Vercel Secret privately and remove the compromised value;
- never paste the key secret, `CLOUDINARY_URL`, Supabase key or recovery information into chat, source, evidence or logs;
- retain Cloudinary assets and Supabase manifest/audit records.

### 4.4 Upload/provider-confirmation defect

- gate off signing and completion;
- retain the reservation, provider asset and rejection/orphan state;
- do not retry by editing immutable events or changing a completed reservation;
- compare authoritative Admin API metadata with the retained manifest;
- use a new reservation after a forward fix;
- remove any provider orphan only through a separate owner-authorised manual dashboard action.

### 4.5 Consent/safeguarding/publication defect

- reject or archive the governed media through an authorised audited action;
- unpublish/withdraw the referencing revision where needed;
- verify the public projection and every placement stop returning the asset;
- preserve the original provider asset and all review/publication history;
- never overwrite an approval or fabricate a consent reference.

### 4.6 Delivery, CSP or quota defect

- gate off the media dispatcher;
- restore the last accepted deployment/CSP;
- invalidate no asset automatically;
- inspect only sanitised provider usage and exact signed derivative paths;
- repair the bounded variant/CSP allowlist or warning projection in source and retest.

## 5. Recovery acceptance

Reopening requires all of the following:

- exact source/migration identity recorded;
- disposable reconstruction and every rollback-safe SQL suite pass;
- focused same-origin, capability, signature, completion, mismatch, child-review, derivative, manifest, quota and no-delete tests pass;
- credential scan passes;
- Vercel Function count and exact CSP pass;
- gate-off endpoint probes pass first;
- a neutral generated non-child fixture passes signed upload, authoritative completion, transformed delivery, manifest and usage checks;
- Supabase/Cloudinary preservation and orphan state are reconciled;
- the owner separately authorises reopening.

## 6. Non-destructive rollback conclusion

Run 6 rollback is a containment-and-forward-repair process. Disable access and credentials first, preserve every database row and provider asset, keep the audit trail immutable, and perform any orphan removal manually only after separate owner authorisation. Destructive SQL reversal or automatic provider cleanup is not an accepted rollback method.
