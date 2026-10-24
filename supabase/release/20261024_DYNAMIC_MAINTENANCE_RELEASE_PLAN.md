# Owner-authorised dynamic maintenance release plan

Date: 24 October 2026
Status: **implemented and locally accepted across the school and Paragon repositories; production activation remains controlled by the sequence below.**

## Authority

Shaibu Sidikat Ruth, Proprietress, directly authorised the complete dynamic maintenance programme. This release preserves the approved identities without embedding any password:

- Proprietress Shaibu Sidikat Ruth — full-write operational authority, registered phone `+2348141943478`;
- Headmistress Mrs. Salihu Nanahawa — Nursery 1, registered phone `+2348133167728`;
- Assistant Headmistress Mrs. Abedoh Rafatu — Primary 4, registered phone `+2347064923346`;
- Developer Jibril Abdullahi Onoruoiza — capability-scoped console, OTP dispatch, information review and system-health read, registered phone `+2348154936650`.

The manual claim seed contains names, registered phones and pre-authorised scopes only. It contains no password, OTP, provider token or private pupil/staff roster.

## Release contents

1. Additive migration `202610240002_staff_continuity_accelerated_progression_and_account_claims.sql`:
   - truthful `position_title` independent from internal capability scope;
   - temporal teacher assignment history and independent recommendation/approval;
   - exceptional progression approval with distinct early-secondary and accelerated labels;
   - Common Entrance candidacy independent from class enrolment;
   - distinct standard Primary 6 and accelerated-secondary Graduate Hall labels;
   - service-only, phone-verified account-claim state;
   - designated-Headmistress-only reversal for an already verified payment.
2. Phone → OTP → private first-password claim APIs and portal UI.
3. Ed25519-signed school-side Paragon relay client: the school holds the private key and Paragon allowlists only the public key; disabled by default until live acceptance.
4. Developer OTP queue support for admission tracking and account claims.
5. Public Portal, Track Application and Create Parent Account routes.
6. Owner-approved Credits page and universal footer wording.
7. Private manual bootstrap file `supabase/manual/20261024_owner_authorised_account_claims.sql`.

## Acceptance evidence

- Complete static/security/answer/browser/accessibility suite: passed.
- Portal/security: 84/84.
- SQL migrations: 8/8 applied locally.
- Rollback-safe SQL policy suites: 4/4 passed.
- Post-migration read-only verification: passed locally.
- Serverless Function files: exactly 10.
- Repeated `npm run build:content`: reproducible with no second-run diff.

No real pupil/staff roster was invented. Empty-state operations remain valid until the owner supplies verified records.

## Controlled production sequence

1. Confirm production still matches clean revision `7e1d30046e08fe84c4291cf81c7346db784c0573`, seven applied migrations and the preservation baseline.
2. Deploy this revision with every new/existing protected gate still false.
3. Run the single new migration `202610240002...` once. Never rerun the former seven migrations.
4. Run `20261024_post_migration_read_only_verification.sql` and compare preservation counts.
5. Apply the manual owner-authorised claim seed once. Verify four pending claims and zero Auth identities; do not create a password in SQL or chat.
6. Configure independent claim hash/encryption secrets privately.
7. Establish one authorised OTP dispatch path:
   - preferred: deploy the inspected private Paragon GitHub relay revision, publish its privacy notice, confirm the approved Meta Authentication template, pass live signature/replay/tenant/template/deletion tests, then enable the relay; or
   - controlled fallback: bootstrap Jibril’s developer identity privately through Supabase, enable the capability-scoped Developer Console and use its one-time manual queue.
8. Run phone-claim acceptance for each authorised identity. Each person verifies the same registered phone and privately creates the first password.
9. Verify title/scope/class assignments and session revocation behaviour.
10. Enable gates in this order, testing after each change:
    - `PORTAL_ENABLED`;
    - `PORTAL_REGISTRATION_ENABLED`;
    - `PORTAL_ACCOUNTS_ENABLED` and `PARENT_LINKING_ENABLED`;
    - `DEVELOPER_CONSOLE_ENABLED`;
    - `PORTAL_ACCOUNT_CLAIM_ENABLED`;
    - `ADMISSION_TRACKING_ENABLED`;
    - `PORTAL_OFFICE_ENABLED`;
    - `PUBLIC_INFORMATION_ENABLED` and other independently accepted public projections.
11. Keep `PARAGON_OTP_RELAY_ENABLED=false` until the separate relay acceptance is complete.
12. Keep Monnify/card gates false. Payments remain manual bank transfer or in-person physical office POS with manual approval.
13. Run production smoke, protected-route, empty-state and read-only preservation postflight tests.

## Containment and rollback

- First containment: disable the affected independent gate. Disabling the relay falls back to the capability-scoped manual queue.
- Do not delete account-claim, assignment, progression, finance or OTP audit evidence.
- Do not retire `public.school_data`.
- If migration-level restoration is required, use the owner-controlled backup/restore plan. Do not invent a destructive down migration.
- A claimed identity is never reset to pending by the manual seed’s safe re-run condition.

## Current blockers to complete activation

- The Paragon relay and privacy notice are implemented and locally accepted, but the Render deployment and its current Meta credentials have not yet been verified after release.
- The Meta `treasure_academy_authentication` Authentication template must be confirmed approved in `en_US` and successfully delivered once before the school relay gate is enabled.
- Vercel still requires private device authorisation before the gates-off deployment and environment updates.
