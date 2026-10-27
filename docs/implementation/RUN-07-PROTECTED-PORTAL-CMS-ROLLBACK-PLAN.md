# Run 7 — Protected Portal CMS Rollback and Containment Plan

**Date:** 27 October 2026
**Scope:** lazy protected CMS bundle, portal integration, independent CMS gate, editor/preview/workflow/media/access UI, portal CSP and private-cache exclusions

## 1. Current boundary

Run 7 is local only. It has not been pushed, deployed, Production-applied, populated or activated. No Run 7 Vercel variable exists. No Production SQL, content/media import, provider call/upload, capability row or public route was created.

At this boundary, rollback means abandoning the Run 7 commit and returning the local branch to `f601a8d2a73b7c3c96cd007536ac83193c0c576c`. `origin/main` and Production source remain `a552618e40791a592cb9e586b2963d61ed46ad2c`, so they require no Run 7 rollback.

## 2. Universal containment order

If a future protected acceptance fails:

1. set or retain `CMS_PORTAL_ENABLED=false`;
2. set or retain `CMS_MEDIA_ENABLED=false`;
3. confirm `/api/portal-config` reports both booleans false;
4. verify the Website CMS navigation is absent after a fresh authenticated session;
5. verify media actions fail closed with 404;
6. preserve every CMS/media row, revision, approval, event, alias and provider asset;
7. preserve logs/evidence without passwords, OTPs, provider secrets, raw consent references or child records;
8. diagnose and forward-repair before any later gate decision.

Do not disable the ordinary secure school portal merely because the independent CMS workspace is contained.

## 3. Immediate containment triggers

Keep both gates false for any of these:

- CMS navigation appears without exact gate/capability authority;
- a parent or unauthorised staff account can query private CMS relations;
- a browser can write directly to a CMS table;
- expected revision conflicts overwrite a newer revision;
- raw HTML, script-like content or an unsupported block reaches preview/storage;
- an identifiable-child creator can complete their own required review;
- a media original or unapproved bulk download becomes available;
- a Cloudinary/Supabase secret or raw consent reference reaches browser output, logs or evidence;
- archive/delete removes immutable history or a provider asset;
- a scheduled revision bypasses due-time revalidation;
- the CMS bundle enters offline/service-worker cache;
- CSP permits a Cloudinary wildcard, unapproved script host or `unsafe-eval`;
- Function count reaches/exceeds the project ceiling;
- public content changes while only protected CMS acceptance is authorised.

## 4. Forward-repair paths

### 4.1 Bundle or portal integration defect

- keep `CMS_PORTAL_ENABLED=false`;
- leave ordinary portal/account gates unchanged;
- correct the lazy bundle/version/config behavior;
- rebuild both portal and CMS bundles;
- rerun focused Node, Chromium, complete portal and full current regression;
- deploy only after separate authorisation with the gate still false.

### 4.2 Capability/RLS defect

- keep the CMS gate false;
- do not compensate with browser-only hiding;
- correct database policy/RPC authority additively;
- rerun disposable SQL adversarial suites for parent, ordinary staff, developer, leadership and Proprietress cases;
- inspect any affected audit rows without deleting or rewriting them.

### 4.3 Editor/preview validation defect

- keep the CMS gate false;
- preserve rejected payload evidence only in synthetic tests, not Production content;
- tighten the closed client builder and server validation together;
- prove markup/script/unknown-field/media-relationship payloads fail;
- prove preview uses text/DOM creation only.

### 4.4 Workflow, scheduling or revision defect

- do not update/delete immutable revisions or publication events;
- archive a wrongly exposed content identity through accepted RPCs if publication ever occurred;
- retain aliases and audit history;
- repair through a new revision/function migration;
- revalidate current approval, quality, expiry, SEO collision and media state at publication time.

### 4.5 Media workflow defect

- keep both gates false;
- if credential exposure is suspected, disable the dedicated Cloudinary key before rotation;
- never paste a replacement secret into chat/source/evidence;
- retain every asset and manifest row;
- do not call destroy/delete APIs;
- quarantine mismatches and use manual owner-authorised orphan handling only;
- use only a neutral generated non-child fixture for the next smoke test.

### 4.6 CSP/cache defect

- keep the CMS gate false;
- restore self-only scripts and exact `api.cloudinary.com` / `res.cloudinary.com/ecbad9xj/` origins;
- retain private/no-store portal headers;
- keep CMS bundles in the service-worker private exclusion list;
- bump an asset version only with rebuilt/hash-matched evidence.

## 5. Database treatment

Run 7 adds no migration. If Runs 5–6 have not been applied, no database rollback exists.

If they are later applied, rollback remains containment plus forward repair:

- never rerun the first seven migrations;
- never use migration-history repair or `--include-all`;
- never retire `school_data` or legacy relations before verified cutover;
- never drop CMS/media tables to undo a UI defect;
- never delete immutable revisions, blocks, approvals, publication/media/capability events or aliases;
- archive through accepted RPCs when a lifecycle correction is required.

## 6. Re-acceptance minimum

Before reopening a contained protected CMS:

- both gates are proven false first;
- exact source/bundle hashes are recorded;
- capability-before-query and RPC-only mutation checks pass;
- parent/ordinary-account private reads fail;
- structured editor and XSS/adversarial preview checks pass;
- optimistic revision conflict passes;
- factual/safeguarding/publication workflow passes;
- child-media creator self-review fails;
- schedule/archive/slug/restore audit passes;
- media allowlist/size/hash/sign/confirmation/derivative controls pass;
- there is still no delete path;
- exact CSP, service-worker exclusion and 11/12 Function count pass;
- disposable SQL, full portal/security and complete browser/accessibility regression pass;
- Production/public behavior remains unchanged until separately authorised.

## 7. Conclusion

Run 7 rollback is gate-first and non-destructive. Contain the independent CMS/media gates, preserve all records/assets/audit history, keep the ordinary school portal separate, and repair forward. Destructive database reversal, automatic provider cleanup or public activation during protected acceptance is not permitted.
