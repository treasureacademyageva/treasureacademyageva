# Staff operations and Website Request Centre

**Implementation date:** 23 October 2026  
**Repository state:** protected-branch implementation; no production SQL, account creation, activation or deployment performed

## What this release implements

### Public website

- Restores all four School Life gallery items on mobile.
- Adds `/request-centre.html` with:
  - structured request intake;
  - a database-created reference in `TA-REQ-YYYYMMDD-XXXXXXXX` format;
  - a separately generated one-time private tracking code;
  - private website status lookup using both values;
  - clear separation from admission, payment and publication decisions.
- Stores only the SHA-256 hash of a tracking code. The readable code is returned once and cannot be recovered.
- Routes school-number WhatsApp links with prefilled workflow messages to the Request Centre. The verified WhatsApp number remains as an unparameterised generic contact link.
- Allows an active staff portal session to register a phone, generic WhatsApp or office-visit request and issue both tracking values.
- Adds a separately gated read-only surface for current administrator-published information. Public rendering uses `textContent`, not database HTML.

### Teacher workspace

- My Class roster from active database assignments.
- Daily attendance registers with Present, Absent, Late and Excused marks.
- Homework drafts/publication for offline work only; no upload or online-submission table, form or workflow exists.
- CA1 20 + CA2 20 + Examination 60 result entry.
- Draft and submitted result states.
- Internal staff notices and duty roster.
- Staff registration of off-site requests.

### Administrator workspace

Both leadership accounts retain `role='admin'` and receive independent class-teacher assignments.

Both administrators can:

- view the Operations Inbox permitted by database policy;
- register and process ordinary requests;
- create pupil records and make admission decisions;
- oversee attendance;
- verify bank-transfer records independently from admission;
- publish versioned operational information;
- use their own My Class attendance, homework and result entry tools;
- view operational audit records.

Assistant Headmistress can:

- begin review of a submitted result;
- return it for correction or approve it for publication;
- never change a teacher’s score during review;
- never review her own entry;
- never publish or lock a result.

Headmistress can:

- publish only an approved result and lock only a published result;
- perform fallback review of another user’s result where needed, but never self-review;
- manage accounts and verified caregiver links through the trusted server;
- manage teacher/class scope, duty roster and staff notices;
- use protected records for contact/WhatsApp administration, testimonials/consent, website extras, shop/orders, code of conduct and settings.

Sensitive request categories—safeguarding, private feedback, testimonial permission, school records and account help—are visible/processable only to the Headmistress. This is enforced in RLS and the request-processing RPC, not only hidden in the UI.

## Database objects

Migration `supabase/migrations/202610230003_staff_operations_and_requests.sql` adds:

- independent `profiles.leadership_scope`;
- CA1/CA2 result fields and a controlled result workflow;
- `result_review_events`;
- `attendance_sessions` and `attendance_entries`;
- `homework_assignments`;
- `website_requests` and `website_request_events`;
- `verified_public_information` and `public_information_events`;
- `staff_notices` and `duty_roster_entries`;
- `leadership_section_records` and `leadership_section_events`.

It also narrows migration 002’s trusted account-authorisation helper to the Headmistress, without modifying any former portal table. `public.school_data` remains unchanged and unretired.

## Independent controls

- A bank-transfer status never changes admission.
- Admission never activates an account.
- A request reference never approves admission or verifies payment.
- Result entry, review and publication are separate transitions.
- Public-information publication is separate from website request processing.
- An administrator account is not automatically a class teacher; an active class assignment is also required.
- An `active` protected leadership record does not automatically change public website content.

## Fail-closed switches

All values remain false/unset until staging and owner approval:

| Environment variable | Controls |
|---|---|
| `PORTAL_ENABLED` | Supabase-backed sign-in and portal UI |
| `PORTAL_ACCOUNTS_ENABLED` | Headmistress trusted account operations |
| `WEBSITE_REQUESTS_ENABLED` | Public/staff request creation and status lookup |
| `PUBLIC_INFORMATION_ENABLED` | Public display of published operational information |
| `PARENT_LINKING_ENABLED` | Parent existing-pupil linking and second-parent invitations |
| `MONNIFY_WEBHOOK_ENABLED` | Monnify webhook scaffold; remains false |
| `MONNIFY_OWNER_VERIFIED` | Separate Monnify owner gate; remains false |

## Required staging sequence

1. Preserve the owner-held exports and keep `school_data` unchanged.
2. Apply all seven migrations through `202610240001`, in exact filename order, in disposable staging.
3. Run `supabase/tests/rls_portal_policy.test.sql`; it rolls back fictional records.
4. Confirm direct `auth.sessions` validation/revocation works on the live Supabase version.
5. Privately create the two owner-verified leadership Auth users.
6. Set Headmistress and Assistant Headmistress scopes through an owner-controlled SQL/Dashboard step.
7. Add Nursery 1 and Primary 4 class assignments respectively only after verification.
8. Test all five activation switches in Preview with fictional/non-sensitive records, including one-time pupil linking and the two-parent limit.
9. Verify accessibility, mobile, dark mode and correction paths.
10. Obtain separate owner approval for production SQL, real accounts, each activation switch and deployment.

No production migration, Auth user, environment switch, portal activation or cut-over is authorised merely because this code exists.
