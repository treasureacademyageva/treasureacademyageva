# Approved parent–pupil linking design

Date: 2026-10-23  
Status: owner-approved and implemented locally behind fail-closed gates; not migrated, activated, deployed or populated with real records

## Purpose

Treasure Academy already has enrolled pupils and will continue admitting new pupils. The portal must not treat every child as a new admission. Existing-pupil onboarding, new admission, parent account access, pupil linking, payment verification and admission decisions remain separate processes.

This design concerns adding a pupil to a parent account. It is a one-time linking process, not a repeated sign-in method.

## Existing school pupils

1. Authorised staff add the existing school roster class by class.
2. Each pupil receives one permanent internal pupil identity. Historical and future attendance, results and other permitted records remain attached to that identity when the pupil changes class.
3. The pupil appears in the My Class workspace of the teacher assigned to the current class.
4. Existing pupils are recorded as already enrolled; they are not created as pending admission applicants.
5. There are no dependable historical admission numbers for matching at this stage.

## Parent choice when adding a child

The parent-facing child-onboarding journey provides two clear choices:

- **Connect an existing pupil** — for a child already enrolled manually at Treasure Academy.
- **Apply for admission for a new pupil** — for a child who is not yet enrolled.

A parent who already has a linked child uses the same Add another child journey. The parent does not need a second parent account.

## Connecting an existing pupil

1. The parent chooses Connect an existing pupil.
2. The parent selects the pupil's current class.
3. The parent types the pupil's name as it appears on the school register. The interface never displays or suggests a list of pupil names.
4. Matching normalises harmless differences such as letter case, punctuation and repeated spaces.
5. Name and class locate a candidate but are not sufficient on their own to disclose or link private pupil records.
6. If one internal candidate is found, the interface may show **Pupil record found** with a green confirmation mark, without revealing any additional pupil information.
7. The parent completes automatic verification with a school-issued, single-use Parent Linking Code or equivalent QR slip. This is not an admission number.
8. The name, selected class, authenticated parent account and linking code must all correspond to the same pupil.
9. A successful verification immediately stores the parent–pupil relationship; a separate manual approval is not required.
10. The code is consumed immediately and cannot be reused.

If the name is misspelled, no unique candidate exists, duplicate names exist without a valid code, or verification fails, the system must not create a duplicate pupil or expose another child's information. It provides a generic correction/reissue route instead.

## Linking-code controls

- Generate the code when staff create or prepare the existing pupil roster.
- Store only a one-way hash, never the readable code.
- Make it pupil-specific, single-use and time-limited or reissuable under controlled office verification.
- Cancel the previous code before issuing a replacement.
- Limit failed matching and code attempts per account and request source.
- Audit successful links, failed attempts, code issue, reissue, consumption and relationship removal without logging readable codes.
- Never place a linking code in a URL, analytics record or public page.

Suggested success sequence:

1. **Pupil record found**
2. **Private code verified**
3. **Child added to your account**

## Maximum of two parents or guardians

1. A pupil can have at most two active parent/guardian account relationships. The database enforces the limit atomically.
2. Each person uses a separate account and separate login credentials.
3. After the first parent links the pupil, that parent may choose Invite second parent/guardian.
4. The system creates a new one-time invitation code specifically for the second relationship. It never reuses the original pupil-linking code.
5. Where practical, the invitation is bound to the intended second parent's Nigerian phone number, expires after a short period and has a strict attempt limit.
6. The first parent may share that invitation privately with the second parent.
7. The second parent signs in to their own account and redeems the invitation. The code is consumed immediately.
8. A third active parent/guardian relationship is rejected.
9. One parent cannot silently remove or replace the other. Removal or replacement requires the school's identity-verification process and an audit record.

## Returning access

Linking occurs once. On every later visit, the parent signs in normally with their phone number and password. Linked children appear automatically. The parent never needs to search by name, select the class or enter the linking code again.

## New-pupil admission

1. Apply for admission for a new pupil creates an admission application, not an active pupil record.
2. Both authorised administrators may make the final admission decision under the separately approved admission workflow.
3. Payment never approves admission.
4. Once admission is approved, the system converts or promotes the accepted application into one permanent pupil profile and links it to the applying parent's account without duplicate entry.
5. A later class change or promotion changes the current placement only; it does not break parent links or erase earlier records.

## Privacy and permissions

- A typed-name search never returns a class roster, autocomplete suggestions or alternative pupil names.
- Matching by name and class alone never grants access to private records.
- Pupil existence and details are not disclosed through distinguishable failure messages.
- Parents can view only specifically permitted linked-child records and submit appropriate requests. They cannot alter attendance, results, school decisions or official pupil identity fields.
- A second parent sees the same permitted child-level information through an independently authenticated account.
- Pupil logins remain out of scope.

## Account-control boundary

This approval defines child matching and linking. It does not by itself replace the existing rule that parent accounts are school-issued and there is no unrestricted public account creation. The linking journey can run after a parent signs in to a school-issued account. Any future proposal for public parent self-registration requires a separate explicit security and account-authority decision.

## Implemented local components

- `supabase/migrations/202610230004_parent_pupil_linking.sql` — optional historical admission numbers, hash-only pupil codes, phone-bound second-parent invitations, atomic two-guardian enforcement, admission applications and audits.
- `server/parent-links.mjs` and `/api/parent/*` — authenticated match, redeem, invite and second-parent redemption handlers.
- `/api/admin/pupil-link-code` — Headmistress-authorised one-time code issuance.
- Parent **Add a Child** workspace — opens during first activation when no child is linked and remains available later inside the parent portal.
- Administrator **Pupils & Admissions** workspace — class-by-class existing roster entry, application decisions and Headmistress code issue.
- `PARENT_LINKING_ENABLED` — independent fail-closed runtime gate.

The browser receives a raw code only once. Database tables receive only SHA-256 hashes. Name/class matching returns a boolean candidate signal and no roster, pupil name suggestion or child details.

## Delivery order

1. preserve and map former Supabase data;
2. for the current combined release, follow `supabase/release/20261024_SQL_AGENT_HANDOFF.md` and apply all seven migrations in exact order only in isolated staging;
3. run all three rollback-only fictional SQL suites, the read-only postflight and the maintained browser/API tests;
4. create only owner-verified staging accounts and fictional pupils;
5. activate `PARENT_LINKING_ENABLED` only in Preview after the portal/account gates are accepted;
6. obtain separate owner approval before production SQL, real rosters, real codes, account activation or deployment.

No production migration, pupil import, Auth user, code issue, switch activation or deployment is authorised merely because the local implementation exists.
