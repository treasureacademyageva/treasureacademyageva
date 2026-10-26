# Run 4 Manual Account-Claim Acceptance Evidence

**Date:** 26 October 2026
**Scope:** Run 4 Stage 8 — protected manual Proprietress account claim
**Result:** Accepted and closed on aggregated evidence, with one documented operator-audit exception
**Production account-claim gate:** Remains false; Stage 9 was not authorised

This record intentionally excludes passwords, OTPs, request/setup tokens, API keys, peppers, ciphertext, full phone numbers, delivery messages, private preview credentials and private record identifiers.

## Acceptance classification

The owner explicitly accepted the aggregated Stage 8 evidence after the final reconciliation exposed one operational audit omission:

- the final successful challenge was delivered as the exact unchanged WhatsApp payload and was verified by the Proprietress;
- the final challenge's **Mark sent** button was not clicked, so it has no `marked_sent` audit event;
- an earlier safely replaced challenge proved the same Developer Console's reveal, exact WhatsApp dispatch and `marked_sent` control;
- no event was fabricated or backfilled;
- Production claims remain false until a separately authorised Stage 9 decision and deployment.

This is recorded as an audit-completeness exception, not hidden as a fully contiguous single-challenge sequence. OTP verification, private first-password creation, role binding, ordinary login, one-active-challenge enforcement, payload destruction and sanitised audit constraints passed.

## Accepted source and protected boundary

- Application/evidence baseline: `58d4e0dc68e9edb7f1d9fcdad81be6ec819a1f18`.
- Runtime corrective source remained `6668b848a51edd2bc502e12851925bf1521b6808`; no application source changed during Stage 8.
- Temporary branch: `run4-claim-acceptance-20261026`.
- Claim-enabled trigger commit: `3d92dd76e0cee9cfaa63abcb760e58581f8be417` (empty deployment trigger only).
- Gate-closure trigger commit: `9d896ff459ae8470e4e805bf36bc7f24ba920501` (empty deployment trigger only).

The branch had eight Preview-only Config values and five Preview-only Secret values. Vercel Authentication returned an anonymous `302` to Vercel SSO for the deployment URL, branch alias and portal-config endpoint. An authorised viewer confirmed the claim control was absent with the gate false, present only on the protected claim-enabled replacement, and absent again after closure.

Production entries were not edited. Bootstrap, admission tracking and Paragon relay remained false throughout.

## Deployment sequence

| Purpose | Deployment | Result |
|---|---|---|
| Protected gate-false preflight | `dpl_exPn8sP4QbuPmfWsmQMchL54dehi` | READY; Vercel Authentication proven; required variables present; claims/bootstrap/admission/relay false |
| Protected claim-enabled acceptance | `dpl_DmQAexMpDHLxKk2tmwr5SpuknxAv` | READY; claims true only on the acceptance branch; bootstrap/admission/relay false |
| Protected gate-off closure | `dpl_GaivEJKcYk14W8rf83C8QvDMvAtW` | READY; authorised browser confirmed bootstrap and claims false before cleanup |

No preview was promoted to Production.

## Preflight state

Before the first request, read-only reconciliation proved:

- Auth users/identities: `1/1`;
- exactly one unexpired pending Proprietress claim at the approved phone ending `3478`;
- intended role `admin`;
- leadership scope `headmistress`;
- position title `Proprietress`;
- no class assignment in the claim;
- no existing Auth user/profile at that phone;
- live account-claim challenges: `0`;
- claim events: `0`.

The authorised browser received the generic public response and advanced to the six-digit verification screen without exposing whether an arbitrary phone was approved.

## Manual queue and replacement evidence

Vercel/browser timing exceeded two five-minute windows. The server correctly maintained no more than one active challenge, destroyed reveal payloads and cancelled each former challenge when a replacement was requested.

Sanitised sequence:

1. **First challenge**
   - requested: `2026-10-26T04:36:51.935371Z`;
   - revealed: `2026-10-26T04:39:51.488491Z`;
   - marked sent: `2026-10-26T04:40:03.057107Z`;
   - terminal state: `cancelled` when safely replaced after expiry;
   - events: `queued → revealed → marked_sent → replaced`.
2. **Second challenge**
   - requested: `2026-10-26T04:42:10.151092Z`;
   - revealed shortly before expiry: `2026-10-26T04:46:53.455320Z`;
   - terminal state: `cancelled` when safely replaced;
   - events: `queued → revealed → opened_channel → replaced`.
3. **Final successful challenge**
   - requested: `2026-10-26T04:48:16.230826Z`;
   - revealed: `2026-10-26T04:48:37.713167Z`;
   - verified: `2026-10-26T04:48:55.407569Z`;
   - account completed: `2026-10-26T04:50:26.245764Z`;
   - terminal state: `completed`;
   - audited events: `queued → revealed → verified → completed`;
   - operator confirmed the exact unchanged payload was sent through WhatsApp, but the final **Mark sent** audit click was omitted.

Across all three challenges:

- channel and destination last four digits were correct;
- failed OTP attempts: `0`;
- no two live challenges overlapped;
- every encrypted delivery payload is absent after reveal/replacement/completion;
- every setup-token hash is absent after terminal processing;
- no challenge was reused;
- all claim-event details passed the forbidden-key checks for OTP, code, phone, password and message;
- no OTP or test message was addressed to the sender/login number ending `6650`.

Before reveal, Jibril's normal Developer Console displayed only purpose, channel, request/expiry time and last four digits. The first reveal was marked sent through the console, proving the audit control. The final exact WhatsApp delivery and successful OTP were confirmed privately without recording their contents.

## Identity and authority acceptance

Post-completion checks proved:

- Auth users: `2`;
- Auth identities: `2`;
- exactly one confirmed phone identity for the Proprietress account;
- password hash present without reading or recording a password;
- account active, authenticated, unbanned and not deleted;
- role: `admin`;
- leadership scope: `headmistress`;
- position title: `Proprietress`;
- application phone verification present from the successful account-claim OTP;
- forced password change: false;
- teacher/class assignments: `0`;
- direct pupil links: `0`;
- guardian invitation links: `0`;
- applicant links: `0`;
- developer capabilities: `0`;
- exactly one sanitised `owner_approved_claim` provisioning audit row;
- unsafe account-audit or claim-event detail rows: `0`;
- Proprietress claim consumed once;
- final challenge completed with ciphertext and setup hash destroyed;
- pending claims after completion: `2`;
- claimed claims after completion: `2`.

The Proprietress then completed ordinary phone-and-password login and reached the administrator portal. Jibril and the Proprietress both signed out. Follow-up reconciliation showed zero active target Auth sessions and zero active target refresh tokens.

## Closure evidence

The branch claim gate was set false before cleanup. An authorised viewer confirmed the protected replacement reported both developer bootstrap and account claims false.

Closure removed:

- all three temporary Stage 8 deployments;
- all thirteen branch-specific Vercel variables;
- the temporary Supabase Secret API key;
- the remote and local Stage 8 branch.

The three former deployment URLs and former branch alias all returned HTTP `404`. The remote branch no longer exists. The temporary key no longer appears in the project's API-key inventory. The Vercel batch deletion reported thirteen branch variables deleted; subsequent environment inventory showed only standing Production configuration at the returned boundaries.

## Final production state

- Current pre-evidence production deployment: `dpl_9VzXvDXC8uf3Xk7K5wqKxBJiDcGc`, READY/PROMOTED.
- Production homepage: HTTP `200`.
- Production portal config: portal true, developer bootstrap false, account claims false.
- Production bootstrap POST: application-controlled HTTP `404` with `{"error":"Not found"}`.
- Production account claims: false.
- Admission tracking: false.
- Paragon relay: false.
- Live account-claim challenges: `0`.
- Temporary Stage 8 deployments/variables/key/branch: deleted.

## Stage boundary

Stage 8 is accepted and closed under the owner's explicit aggregated-evidence decision. Stage 9 was not reached or authorised, so Production account claims remain false. Opening them later requires a separate owner decision, Production environment change, new Production deployment and gate verification. Admission-tracking OTP and Paragon relay remain outside this acceptance and disabled.
