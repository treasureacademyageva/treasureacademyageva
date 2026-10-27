# Run 12 — Production Readiness, Gate Closure and Rollback Plan

**Date:** 27 October 2026
**Scope:** future gate-off Runs 5–12 release, post-release containment and external relay hold
**Current Production rollback required:** no — Production was not changed by Run 12

## 1. Immutable rollback references

Before any future release, preserve and re-confirm:

| Item | Pinned value |
|---|---|
| Accepted local source | `f61a074be8a86058ca14c6fd452be351688e9a48` |
| Preserved Production source | `a552618e40791a592cb9e586b2963d61ed46ad2c` |
| Promoted rollback deployment | `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2` |
| Vercel project | `prj_ZE21arjfWmtX6hjASAIaMgHDJO43` |
| Supabase project | `biyizitalhylkwtshrqt` |
| Release manifest | `config/run12-release-boundary.json` |

The rollback deployment is currently `READY`, `PROMOTED`, source-matched and serves the canonical/apex aliases. It remains the immediate application rollback target after a future deployment.

## 2. Pre-release stop conditions

Do not push, deploy or apply Production SQL unless the owner separately authorises the release boundary and all of these pass immediately beforehand:

1. clean accepted source and reviewed release diff;
2. complete uninterrupted `npm test`;
3. focused `npm run test:run12`;
4. GET-only `npm run test:production-probes` against the still-preserved deployment;
5. fresh encrypted Production backup, MAC verification and restore drill;
6. exact Supabase preservation counts with no unexpected decrease;
7. Vercel target still equals the pinned rollback deployment/source;
8. every gate in `requiredFalseFlags` still evaluates exact-false for the new deployment;
9. Function count remains within the Hobby limit;
10. no unresolved high-severity defect.

Stop on count drift, a missing rollback target, a secret in output/source, a failed probe, ambiguous migration state or any request to replay the first seven migrations.

## 3. Gate-off release order

A future authorised release must be deployed with all manifest `requiredFalseFlags` set exact-false. Do not combine deployment acceptance with business-gate activation.

After deployment:

1. test public pages and real 404 behavior;
2. test browser-safe configuration and disabled endpoints;
3. verify migration ledger and preservation counts;
4. run public-content/CMS read-only smoke tests;
5. leave claims, admission tracking and automatic relay closed;
6. open each later capability only through its own acceptance document.

A configured secret or provider URL is not permission to activate a gate.

## 4. Immediate application rollback

If a future deployment fails before a confirmed data mutation:

1. set all mutable business gates false;
2. promote `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2` back to Production;
3. verify `www` homepage, `robots.txt`, sitemap, one-hop apex redirect and real 404;
4. confirm browser config is the preserved portal baseline;
5. repeat Supabase counts and migration ledger;
6. record incident time, failed deployment ID and observed delta.

Do not create a replacement deployment merely to roll back when the pinned promoted deployment remains available.

## 5. Gate-closure containment order

For an incident after a later capability activation, close the smallest relevant boundary first:

1. `PARAGON_OTP_RELAY_ENABLED=false` — automatic provider relay stops; manual dispatch remains available;
2. `ADMISSION_TRACKING_ENABLED=false` — admission OTP issue/verify endpoints fail closed;
3. `PORTAL_ACCOUNT_CLAIM_ENABLED=false` — school-account claim issue/verify endpoints fail closed;
4. `COMMENTS_ENABLED=false`, `MEDIA_DOWNLOADS_ENABLED=false`, `CMS_ENABLED=false`, or other affected feature gate;
5. `PORTAL_OFFICE_ENABLED=false` if private office workflows are affected;
6. `PORTAL_ENABLED=false` only for a portal-wide safety event.

Never enable another gate as a workaround.

## 6. Relay/provider failure rollback

On signature failure, timeout, non-HTTPS configuration, non-2xx response, unaccepted provider body, missing webhook evidence or provider incident:

1. keep/restore `PARAGON_OTP_RELAY_ENABLED=false`;
2. do not mark a challenge sent unless the provider explicitly accepted it;
3. preserve idempotency/request identifiers and minimal audit metadata;
4. use the existing manual dispatcher for authorised claim/admission challenges;
5. do not issue a duplicate challenge solely because transport failed;
6. never send tests or OTPs to the sender line ending `6650`;
7. resume automatic delivery only after a new signed-relay acceptance.

Compromised Render/Meta/Vercel keys require provider-side rotation, old-key invalidation and a new acceptance. Never paste secrets into chat, source or evidence documents.

## 7. Database rollback boundary

Migrations are forward-only. Do not rerun the first seven migrations, use migration repair, retire `school_data`, or destructively reverse tables in place.

For a data incident:

1. close all relevant write gates;
2. capture current counts and an encrypted incident backup;
3. compare with the pre-release manifest and release backup;
4. restore into an isolated database first;
5. verify table/RLS/policy/function counts and critical fixtures;
6. choose a reviewed compensating migration or owner-authorised restore;
7. re-open no gate until the corrected state is accepted.

An unexpected decrease in `school_data`, claims, users, pupils, applicants, payments, CMS records or media metadata is a release stop, not an automatic restore trigger.

## 8. Cache and service-worker containment

After rollback/promotion:

- serve the rollback source's `sw.js` and cache version;
- keep private/auth/API routes network-only;
- verify removed public CMS detail URLs return a real 404 and are not served from stale cache;
- use explicit withdrawal/tombstone controls rather than deleting shared or original evidence;
- allow browser cache revalidation before declaring a persistent application failure.

## 9. DNS note

The domain currently serves correctly and Vercel reports `misconfigured=false`; Vercel also recommends an updated external DNS target (`ipStatus=required-change`). Do not alter DNS during an application rollback. Review DNS separately with owner authorisation, record the former records, apply one controlled change and prove both `www` HTTPS and the apex one-hop redirect before acceptance.

## 10. Exit criteria

Rollback/containment is complete only when:

- the intended deployment is visibly promoted;
- public preservation probes pass 10/10;
- disabled endpoints fail closed;
- Supabase counts show no unexplained decrease;
- no new challenge/message/provider request occurs;
- the incident and any remaining external hold are documented truthfully.
