# Run 7 — Protected Portal CMS Acceptance Evidence

**Date:** 27 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan and accepted Runs 5–6 schema/provider boundaries
**Acceptance boundary:** repository source, generated protected bundles, disposable-local PostgreSQL, mocked provider boundary and complete local/browser regression
**Mutation boundary:** no push, deployment, Production SQL, Supabase row, content/media import, provider call/upload, Vercel variable change or feature-gate activation

## 1. Decision

Run 7 is accepted at the repository and disposable-local boundary. It adds the first-party **Website CMS** workspace to the existing secure portal without creating a second website, third-party CMS, public content route or Vercel Function.

The workspace implements the Phase 5 requirements:

1. a lazy modular CMS bundle;
2. an allowlisted block editor;
3. a private structured preview;
4. factual, safeguarding and publication review/approval;
5. publication scheduling and non-destructive archive;
6. immutable revisions, restore and audit;
7. the governed Run 6 media library;
8. Proprietress-only explicit CMS capability administration.

Both independent gates default false:

```text
CMS_PORTAL_ENABLED=false
CMS_MEDIA_ENABLED=false
```

No Run 7 environment value was created in Vercel. Production remains on unchanged Run 4 source `a552618e40791a592cb9e586b2963d61ed46ad2c`; the same-source deployment documented in Run 6 remains the current promoted boundary. Runs 5–7 are not deployed or Production-applied.

## 2. Implemented boundary

### 2.1 Lazy protected workspace

`assets/js/cms-workspace.js` is built through the dedicated `build:cms` step into `assets/js/cms-workspace-app.js`. The generated bundle is 51,784 bytes and is loaded only after `/api/portal-config` returns the exact `cmsEnabled: true` boolean. Ordinary portal use does not load it.

The portal config exposes only browser-safe URL/publishable-key material and gate booleans. It does not read or return the Supabase secret key, Cloudinary key/secret or `CLOUDINARY_URL`.

Before querying private CMS relations, the bundle asks the accepted `cms_current_actor_can` RPC for these seven capabilities:

- `view_private`;
- `draft`;
- `review`;
- `publish`;
- `safeguarding_review`;
- `administer`;
- `emergency_publish`.

If private visibility is false, no CMS table query occurs and the navigation item stays absent. CMS authority does not grant pupil, guardian, admission, payment, result or inventory access.

### 2.2 Structured block editor and private preview

The editor supports all 13 accepted Run 5 block types:

- paragraph;
- heading;
- ordered and unordered lists;
- quote;
- callout;
- governed image;
- governed video;
- governed gallery;
- verified fact;
- accessible table;
- internal CTA button;
- related content.

The browser builds only the closed Run 5 JSON document shape. It supplies no raw-HTML field, unrestricted JSON editor, custom JavaScript, arbitrary embed or external URL control. Client validation rejects markup/script-like payloads before preview, while the database remains authoritative and revalidates every document and block.

Private preview creates DOM elements and text nodes. It never uses `innerHTML`, `insertAdjacentHTML` or `document.write`. Media preview shows governed placeholders until an authorised user explicitly requests a fixed transformed derivative; no original URL is exposed.

Every save creates an immutable revision through `cms_create_entry` or `cms_create_revision`. Existing-entry edits include the exact expected revision number so concurrent changes fail rather than overwrite one another.

### 2.3 Editorial workflow

The workspace calls only accepted capability-checked RPCs for mutations:

```text
cms_create_entry
cms_create_revision
cms_submit_for_review
cms_record_approval
cms_publish
cms_archive
cms_restore_revision
cms_change_slug
cms_review_media
cms_archive_media
cms_set_capabilities
```

There is no direct browser insert, update, upsert or delete. The UI covers:

- draft creation and new immutable revisions;
- factual, safeguarding and publication decisions;
- current approval evidence;
- immediate publication or Lagos-time scheduling;
- due-time server revalidation;
- Proprietress-only emergency control surfaced only when authorised;
- soft archive with a mandatory reason;
- audited canonical slug changes with former-path aliases;
- revision preview and copy-forward restore;
- publication and approval audit views;
- quality-finding visibility.

A revision creator is not offered the safeguarding action when their current revision contains identifiable-child media. The database independently enforces that rule. The Run 6 asset-creator self-review prohibition also remains enforced and is reflected in the media UI.

### 2.4 Governed media library

The protected library reads no raw consent reference. It shows lifecycle, provenance, consent and safeguarding states; supports independent review; and archives without deleting provider assets or manifest history.

When the separate media gate is eventually authorised, the browser workflow:

1. accepts only the fixed image/video MIME allowlist;
2. enforces the 10 MiB image and 50 MiB video limits before signing;
3. computes a local SHA-256 checksum;
4. sends only bounded metadata to the same-origin signing route;
5. uploads with the short-lived server signature and fixed preset/folder/tags/authenticated type/no-overwrite parameters;
6. asks the trusted server to confirm authoritative provider metadata;
7. leaves the asset pending for independent review.

The UI has no provider destroy/delete call. Failed or unmatched uploads remain governed/orphan-visible for manual-authorisation-only handling. Only transformed thumbnails/posters can be requested. Proprietress-only quota and manifest controls remain bounded by the accepted Run 6 endpoints.

No provider request or upload occurred during Run 7 acceptance.

### 2.5 Access administration

Only an actor with `administer` capability sees the explicit capability form. The form is limited to active staff profiles and records draft, review, publish, safeguarding, emergency and revoke decisions through `cms_set_capabilities` with a mandatory reason.

This changes only CMS capabilities. It cannot create an account, change a school role or grant access to school-operation records. Accepted leadership authority remains database policy, not a browser assumption.

### 2.6 CSP, caching and responsive behavior

The protected `/portal/(.*)` CSP now matches the governed media workflow exactly:

- `https://api.cloudinary.com` in `connect-src`;
- `https://res.cloudinary.com/ecbad9xj/` in `img-src` and `media-src`;
- no `*.cloudinary.com` wildcard;
- no `unsafe-eval`;
- self-hosted scripts only.

The service worker explicitly treats the portal bundle, CMS source/entry/bundle and portal stylesheet as private network-only assets. Portal pages remain `private, no-store`, noindex and noarchive.

The CMS uses existing day/dark tokens, visible focus, live status/error regions, labelled fields, keyboard-operable controls, reduced-motion behavior, mobile reflow and forced-colour boundaries.

## 3. Adversarial and regression evidence

### 3.1 Focused Node/security suite

`tools/tests/run7-portal-cms.test.mjs` passed **11/11** checks covering:

- exact independent gates and secret-free portal config;
- lazy bundle and 11/12 Function ceiling;
- closed document/media relationships;
- executable-markup rejection and text-only preview;
- Event lifecycle/time validation;
- capability-before-query behavior;
- RPC-only mutation and optimistic concurrency;
- media MIME/size enforcement;
- fixed signed Cloudinary form fields without a secret/filename field;
- exact portal CSP;
- responsive/accessibility foundations.

### 3.2 Dedicated Chromium scenario

`tools/tests/run7-cms-browser.e2e.js` passed its protected editor scenario at a 390 × 844 mobile viewport:

- CMS workspace render;
- editor creation;
- executable-markup rejection;
- safe structured preview;
- add/move/remove block controls;
- dark-theme token application;
- no horizontal overflow;
- no serious or critical axe finding.

### 3.3 Database reconstruction

The unchanged database foundation was independently rebuilt in disposable PostgreSQL 17:

```text
13/13 ordered migrations
7/7 rollback-safe policy suites
read-only postflight passed
```

Run 7 needs no migration; it consumes only the accepted Runs 5–6 RLS relations, views and RPCs.

### 3.4 Complete current regression

The authoritative current runner passed after Run 7 was wired into it:

- production static audit: pass;
- visitor UX: **45/45**;
- verified answers: **10/10**;
- portal/security: **87/87**;
- developer bootstrap: **12/12**;
- combined Run 4–7 TAP: **34/34**;
- chatbot safety: **11/11**;
- answer coverage: **20/20**;
- review gateway: **5 pass, 1 intentionally skipped secret-bearing test**;
- visitor browser QA: **1447/1447**;
- accessibility components: **59/59 light and 5/5 dark**, zero serious/critical findings;
- secure workflows: **5/5**;
- operations browser: **3/3**;
- portal browser: **7/7**;
- Run 7 CMS Chromium scenario: pass;
- header browser: **7 scenarios**;
- final current-release result: pass.

## 4. Security and privacy conclusions

- The portal gate and media gate are independent and exact-true only.
- CMS visibility and actions are database-capability checked; browser hiding is not the authority.
- No school-record capability is inferred from CMS capability.
- No direct CMS table write exists in browser source.
- No readable password, OTP, provider secret, consent reference or private child record enters logs/evidence.
- Preview is text/DOM based and rejects executable markup.
- Originals and bulk child-media downloads remain unavailable.
- No asset or record deletion path was introduced.
- Media orphan cleanup remains manual and separately authorised.
- No public content route, engagement feature or popularity input is active.

## 5. Source identity

```text
3328fe9a106d8182f07b8f5945d61a91603d9419815f8bbe7cfdc8e19b39105f  assets/js/cms-workspace.js
bff6abf7ec59a083030f55c8861f3b2ca1e2a82e924218b8f9bcc15850e7bc3a  assets/js/cms-workspace-entry.js
f6a619dde2d65e32023c7de635916f48507f646c8baf75abb4bac6913cecbb13  assets/js/cms-workspace-app.js
b191d8653c0aca0b46578170be5f5331f27d00fb913cb5f28f72f7a76f73bae9  assets/js/portal-source.js
a059d066b1e24ed5ce09e72adfbdab3949feb31fe92432acabed49911d15664e  assets/js/portal-app.js
d96bc57da944e8f1a2ff804f547992f10c596149d56abcb4b33839e1d8171f0a  assets/css/portal.css
64bca8e8d75894c4ebcd34cca26e7708eb615e1bf2444e2ce7bbf6a4cc0733bd  api/portal-config.mjs
73892b342ca832d3ad63a41770a0a4b43697a830de7fb174735418d2d284ef66  tools/tests/run7-portal-cms.test.mjs
7bf0c4f72dd466c5a07128c76606dab010975f86a7d64a4931ce80aa15089ecd  tools/tests/run7-cms-browser.e2e.js
c5d930130722922530cca6b9b4e9e2b61414fda9db0d3db5561fcf5112fa32c3  vercel.json
```

The accepted pre-Run-7 local commit is `f601a8d2a73b7c3c96cd007536ac83193c0c576c`. `origin/main` and promoted Production remain `a552618e40791a592cb9e586b2963d61ed46ad2c`.

## 6. Holds before protected or public release

1. Runs 5–6 SQL require a separately authorised preservation window with exact before/after counts.
2. The exact accepted Runs 5–7 source requires an authorised push/deployment while both CMS/media gates remain false.
3. Protected CMS activation needs a separate account/capability/session acceptance; it must not activate public rendering.
4. The media gate needs the neutral generated non-child provider smoke test before any real asset.
5. Real content migration requires owner/source verification, immutable revision evidence and route-by-route parity.
6. Public News/Event/Gallery routes remain Run 8 work and need a separate release decision.
7. Historical child media remains held until provenance, consent and independent safeguarding review are proven.

## 7. Boundary conclusion

Run 7 satisfies its local protected-portal acceptance. The implementation is modular, capability-scoped, structured, non-destructive, accessibility-tested and connected only to the already accepted Runs 5–6 contracts.

Run 7 is **not pushed, deployed, Production-applied, populated, provider-smoke-tested or activated**. No owner action is required at this local boundary.
