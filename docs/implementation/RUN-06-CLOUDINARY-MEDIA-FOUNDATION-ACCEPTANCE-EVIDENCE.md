# Run 6 Cloudinary Media Foundation Acceptance Evidence

**Date:** 26 October 2026; provider handoff updated 27 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan, accepted Run 5 schema and the Run 6 provider/reviewer decisions
**Acceptance boundary:** repository source, disposable-local PostgreSQL, mocked provider API boundaries, complete local regression and gate-off provider credential handoff
**Mutation boundary:** dedicated Cloudinary key plus eight Production-only Vercel variables recorded; the dashboard triggered a same-source Run 4 redeploy; no push, Run 6 deployment, Production SQL, content/media import, real provider upload or public CMS activation

## 1. Decision

Run 6 is accepted at the repository and disposable-local boundary. The implementation adds the school-owned Cloudinary media foundation without activating it. It remains fail-closed behind `CMS_MEDIA_ENABLED=false`, imports no record or asset, exposes no original-media route and contains no provider secret.

The provider boundary is pinned to school environment `ecbad9xj`, signed preset `treasure_academy_cms_signed`, authenticated delivery and asset folder `treasure-academy/cms/pending`. The owner-selected indefinite/manual-only retention policy is enforced in Supabase. No source or database function automatically deletes a Cloudinary asset or governed manifest record.

The dedicated Cloudinary key now exists as `Active / Master Admin`, and its API key/secret were entered privately into write-only Vercel Sensitive variables without entering chat, source or evidence. Six fixed Production-only variables were created by the agent and the owner replaced only the two credential placeholders. `CMS_MEDIA_ENABLED` remains exactly false.

Saving the private values triggered a Production redeploy of the already accepted Run 4 source `a552618e40791a592cb9e586b2963d61ed46ad2c`. The redeployment reached `READY/PROMOTED`; it did not contain Run 5/6 code. The homepage returned `200`, and gate-off media usage/delivery paths returned `404`. No push, Production SQL, provider API smoke call or real upload occurred. Non-destructive containment and forward-repair procedures are recorded in `RUN-06-CLOUDINARY-MEDIA-FOUNDATION-ROLLBACK-PLAN.md`.

## 2. Implemented boundary

### 2.1 Additive Supabase governance

`supabase/migrations/20261026070000_cloudinary_media_governance.sql` adds:

- five-minute actor-bound upload reservations with per-actor limits;
- exact image/video MIME allowlists and 10 MiB image / 50 MiB video ceilings;
- SHA-256 file-manifest checksums and exact expected byte counts;
- authoritative provider completion fields for asset UID, resource/delivery type, version, ETag, detected format, MIME, dimensions and duration;
- immutable upload/review/publication media events;
- provenance, consent, safeguarding, publication, rejection and archive workflow;
- independent reviewer enforcement for identifiable-child media;
- both accepted active leadership scopes as safeguarding reviewers;
- private transformed-delivery lookup with explicit published `download` placement required for the download derivative;
- an owner-only paginated export manifest with retained orphan-candidate state;
- manual-only retention and foreign-key/audit preservation, with no hard-delete API.

The migration is additive. It does not modify or retire `school_data`, import content/media/identities, replay an earlier migration or seed a capability.

### 2.2 Trusted Vercel media service

`server/cms-media.mjs` and the single dispatcher `api/cms-media.mjs` provide:

- `POST /api/cms/media/sign`;
- `POST /api/cms/media/complete`;
- `GET /api/cms/media/delivery`;
- `GET /api/cms/media/manifest`;
- `GET /api/cms/media/usage`.

Every action independently checks the media gate and trusted server configuration. Upload actions additionally require exact same-origin POST. Authenticated actions validate the Supabase access token, browser session ID, active profile, password-change state and required CMS capability.

The signing response uses SHA-256 and fixes all security-relevant upload parameters: random non-filename public ID, authenticated type, signed preset, exact asset folder, required tags, no overwrite, no filename-derived identity and no retained original filename. The browser receives the Cloudinary API key, as required by signed direct upload, but never the API secret or a service-role key.

Completion ignores browser-supplied provider metadata. The trusted server retrieves the exact asset through the Cloudinary Admin API, then verifies public ID, resource type, authenticated delivery type, folder, required tags, detected format, exact byte count, dimensions/duration, asset UID, version and ETag before Supabase can confirm it. A mismatch is quarantined as rejected and retained for manual review; it is never automatically deleted.

### 2.3 Delivery, metadata and quota controls

Only fixed transformed variants can be signed. There is no `original` variant and no endpoint that returns an original URL. Signed paths are version-bound. Image derivatives use bounded widths, automatic quality and modern format negotiation; video delivery is limited to a 720p MP4 derivative or metadata-safe poster. Public-download intent requires an explicit `download` placement on the currently public revision.

The owner-only manifest exports the provider mapping, technical metadata, checksum, accessible text, source/provenance state, lifecycle, actors/timestamps, placement state and orphan reason without exporting raw consent references. The owner-only usage route returns only sanitised plan/usage metrics and warns at the configured 70 percent threshold.

### 2.4 Exact configuration and CSP

`.env.example` contains empty server-only credential placeholders and defaults the independent media gate to false. It contains no `CLOUDINARY_URL` and no secret value.

The source CSP permits only:

- `https://api.cloudinary.com` in `connect-src` for signed direct upload;
- `https://res.cloudinary.com/ecbad9xj/` in `img-src` and `media-src` for this exact school environment.

No `*.cloudinary.com` wildcard was added. These Run 6 source changes are not live because the promoted same-source redeployment remains the accepted Run 4 commit.

### 2.5 Private provider handoff

The owner created the dedicated `Treasure Academy CMS - Vercel` key in environment `ecbad9xj` and confirmed it is Active with the Master Admin role. Vercel now holds eight Production-only media variables: `CMS_MEDIA_ENABLED=false`, `CLOUDINARY_CLOUD_NAME=ecbad9xj`, Sensitive `CLOUDINARY_API_KEY`, Sensitive `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET=treasure_academy_cms_signed`, `CLOUDINARY_ASSET_FOLDER=treasure-academy/cms/pending`, `CLOUDINARY_DELIVERY_TYPE=authenticated` and `CLOUDINARY_USAGE_WARNING_PERCENT=70`. The owner submitted both private values; neither was read back or decrypted by the agent.

The gate is false, the deployed source has no Run 6 dispatcher, and no Preview/Development value was added. The key remains broader than the eventual application path because the self-service provider role is broad; risk is contained by the dedicated key, server-only storage, fail-closed gate, fixed server parameters, absence of any delete code and manual-only cleanup policy.

## 3. Adversarial coverage

The rollback-safe SQL suite proves:

- no seeded upload or event rows;
- RLS and no anonymous/authenticated direct grants on reservation/audit relations;
- both accepted leadership scopes have independent safeguarding authority;
- ordinary accounts cannot reserve or review media;
- allowlist, size and checksum boundaries reject invalid reservations;
- only the creating actor can complete an unexpired reservation;
- completion is service-only and cannot replay;
- an identifiable-child creator with review capability still cannot self-review;
- provenance, consent and safeguarding must resolve before publication;
- audit events cannot be updated/deleted;
- Cloudinary manifest rows cannot be hard-deleted;
- downloads fail without explicit current placement permission;
- manifest export is Proprietress-only;
- expired reservations and orphan metadata remain retained with `manual_only` policy.

The Node/API suite proves:

- fixed provider configuration and fail-closed misconfiguration;
- strict body shape, MIME, byte, checksum and same-origin checks;
- a fixed SHA-256 signature vector;
- secret-free signed responses and random filename-independent IDs;
- provider Admin API confirmation rather than browser trust;
- mismatch quarantine without a destroy/delete code path;
- bounded, version-bound, transformed signed delivery URLs only;
- privacy-safe quota output and owner-only access;
- paginated owner-only manifest/orphan output;
- exact Vercel rewrites, exact CSP and the 11/12 Function-count ceiling;
- generated-schema identity through the Run 6 migration.

## 4. Disposable catalog invariants

An independent reconstruction from all migrations reported:

```text
run6_tables=2
run6_rls=2
run6_rows=0
anon_table_select=0
authenticated_table_select=0
run6_functions=9
run6_security_definer_empty_path=9
public_execute_run6=0
immutable_media_event_triggers=1
cloudinary_delete_functions=0
```

## 5. Authoritative local results

### SQL and focused security

```text
SQL MIGRATION QA: 13/13 migrations, 7/7 rollback-safe policy suites and the read-only postflight passed.
Run 6 focused Node/API tests: 14/14 passed.
Node syntax, JSON parsing, generated-schema identity and git diff whitespace checks passed.
```

### Complete application regression

```text
Production audit: 16/16
Visitor UX: 45/45
Verified answers: 10/10
Portal/security: 87/87
Developer bootstrap endpoint: 12/12
Run 4 + Run 5 + Run 6 TAP tests: 23/23
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

The first complete-run attempt stopped only because the refreshed disposable sandbox lacked the Playwright Chromium binary. Chromium and its runtime libraries were restored in the sandbox, and the complete authoritative runner then passed. No repository correction was required for that environment-only prerequisite.

The diff-scoped credential scan found no Cloudinary URL, populated Cloudinary secret, password/private-key payload or secret-like assignment. Test credentials and provider objects are explicitly fictional fixtures.

## 6. Source identity

```text
174859efa8b40632e775c0444deefd0d63d35ee5a0302c055d76b6b2d939fce4  supabase/migrations/20261026070000_cloudinary_media_governance.sql
b21fdaec355a901c0d7dae39a49de0f34de4c05d458133fdd2a259924f81e697  supabase-schema.sql
768ed51800dfb2b3eb7103d632a066ac3dc523c7349388a766b8bbc14552ce88  server/cms-media.mjs
557afc83849e510a8f67f0aa7a883d8ae12d2f40321466f09391c7bc097d6c32  api/cms-media.mjs
adc937ac65b6459e16e53d0c6c029dc44d8ff99b6a91e0dcbbbeebb16ffc65ab  supabase/tests/cloudinary_media_governance.test.sql
4b4d98cdb3d2153f61c8bb5630861d974b69b8b13bcdd5eda957796ae4f4f837  tools/tests/run6-cloudinary-media.test.mjs
```

The local Run 6 acceptance commit is `1be79902305c9183eab257d50da9e3aa94f23a14`. `origin/main` and promoted Production remain `a552618e40791a592cb9e586b2963d61ed46ad2c`. The same-source redeployment is `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2`, `READY/PROMOTED`, with no alias error.

## 7. Holds before any live provider test or release

1. Runs 5 and 6 Production SQL need a separately authorised preservation window before any endpoint can operate against Production.
2. The exact committed Run 6 source needs an authorised push and deployment with the media gate still false.
3. A neutral, generated, non-child fixture must pass signed upload, authoritative completion, transformed delivery, manifest and quota checks before any real asset or public activation.
4. Public activation requires a separate decision after smoke-test evidence; `CMS_MEDIA_ENABLED` must not be enabled as part of the initial source release.
5. Any provider orphan cleanup remains a manual, separately authorised dashboard action. No automatic deletion is permitted.

## 8. Boundary conclusion

Run 6 satisfies its local foundation acceptance and private provider-handoff boundary: school-owned configuration is pinned; credentials are server-only; upload authorisation is short-lived, same-origin and capability-scoped; media validation is bounded; Supabase owns governance and audit; creator self-review is prohibited for identifiable-child media; transformed delivery and exact CSP are controlled; and manifest/quota/orphan handling retains records without deletion.

Run 6 is **not** pushed, Production-applied, provider-smoke-tested or publicly active. The same-source Run 4 redeploy is healthy and contains no Run 6 route. The remaining boundaries stay closed until separately authorised.
