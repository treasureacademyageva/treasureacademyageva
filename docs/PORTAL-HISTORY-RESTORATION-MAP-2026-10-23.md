# Former portal history and secure restoration map

**Owner clarification:** the former Treasure Academy portal was authentic and must be restored as a familiar experience.  
**Evidence source:** repository history, principally commit `32e6800` (29 September 2026), with earlier database work in `3774bb4`, `6af8471`, `5d5b2c5` and `4f3f5f8`.  
**Rule:** preserve legitimate design, language and workflows; replace unsafe authentication, demo/sample data and browser-only storage.

## What the former portal actually contained

### Login and registration experience

- Treasure Academy branded login/register screen
- phone/parent and staff-ID entry
- forgot-password WhatsApp hand-off
- three-step ward, guardian and payment registration wizard
- explicit bank-transfer workflow
- parent/guardian details and class application
- role routing to headmistress, teacher and pupil dashboards

This was a real interface. The security problem was that credentials, OTP simulation and records were handled in browser code/local storage, and the original Batch 19 `school_data` table allowed anonymous reads and writes. That does not make the portal history fake; it means the implementation must be migrated.

### Parent/pupil dashboard

Historical sections:

1. Home
2. My Results
3. Attendance
4. Notices
5. School Fees
6. Timetable
7. Found Items

Historical capabilities included child switching, published report cards, downloads/printing, attendance summaries, fee transfer claims, school notices and weekly timetable.

**Secure restoration:** keep these parent-facing workflows, but parents sign in through Supabase Auth and see linked children. Per the owner’s current decision, no separate pupil account is created initially.

### Teacher dashboard

Historical sections:

1. Home
2. Mark Register
3. Class Fees (view only)
4. Message Headmistress
5. Input Results
6. Homework
7. My Pupils
8. Duty Roster
9. Notifications
10. Meetings
11. Found Items
12. Code of Conduct

**Secure restoration:** teacher access is derived from `teacher_class_assignments`; results/attendance/homework writes are restricted to assigned class/subject scope. Teacher payment access remains excluded unless the owner separately defines the exact read-only requirement and privacy boundary.

### Headmistress/admin dashboard

The historical dashboard included:

- Overview and My Class
- staff messages
- pupil verification
- registrations and applications
- pupils and teachers
- duty roster
- result review/publishing
- attendance
- promotions
- news/events
- messages and WhatsApp hand-offs
- testimonials
- entrance questions
- notices and meeting minutes
- class pages, calendar and timetable
- shop/orders and website extras
- Code of Conduct and settings

It also accumulated unrelated or high-risk operational tools in one very large browser page. Those workflows will be restored in secure, maintainable groups rather than by copying the 226 KB historical admin file back into production.

## What is preserved unchanged in meaning

- familiar Home / Results / Attendance / Notices / Fees / Timetable language
- bank-transfer-first workflow
- parent access to multiple linked children
- teacher class workspace
- headmistress review and publishing role
- draft-before-publish results
- school notices and meeting acknowledgement
- mobile sidebar/navigation character
- day and dark themes
- verified WhatsApp support hand-off

## What must change for safety

| Historical mechanism | Secure replacement |
|---|---|
| browser/localStorage credentials | Supabase Auth session |
| phone/PIN lookup in public JavaScript | school-issued account and server authentication |
| simulated OTP or displayed recovery hints | Supabase-approved recovery process |
| pupil login | linked parent account initially |
| `school_data` anonymous read/write | preserved for migration, then manually retired after verified cut-over |
| browser database as source of truth | RLS-protected PostgreSQL tables |
| client-only role hiding | database policies and assignment checks |
| payment claim implying receipt | pending record until authorised bank verification |
| payment affecting admission | separate admin admission decision only |
| demo pupils/staff/credentials | fictional staging fixtures only; never production restoration |
| one huge admin HTML file | reusable role modules and auditable database operations |

## Supabase history found in Git

Two generations may exist in the owner’s project:

1. **Batch 19 JSON:** `public.school_data(key, data, updated_at)` with broad anonymous policies.
2. **Later normalized schema:** `parent_accounts`, `parent_phones`, `pupils`, `applications`, `staff`, `attendance`, `results`, `fee_payments`, sessions and public-content tables.

The repository cannot prove which generation was applied to the owner’s live Supabase project. Therefore no migration may revoke, drop, truncate or overwrite legacy objects before the read-only inventory and owner-controlled backup.

## Restoration sequence

### Step 0 — preserve first

- Run `supabase/manual/00_read_only_legacy_portal_inventory.sql` in the existing project.
- Create an owner-controlled backup/export.
- Do not run the retirement script.

### Step 1 — familiar secure foundation

Already implemented locally:

- branded responsive portal shell
- parent, teacher and admin roles
- linked children
- results and payments
- teacher assignments
- admission/payment separation
- audit logs
- disabled Monnify scaffold

### Step 2 — restore core daily workflows

Next secure modules, after schema inventory:

- Attendance / Mark Register
- Notices and read acknowledgement
- Timetable
- Homework
- result review/publish workflow matching the former labels
- familiar parent and teacher navigation order

### Step 3 — restore headmistress operations

After owner workflow confirmation:

- registrations/applications migration
- promotions
- duty roster
- staff messages and meeting minutes
- news/calendar/class-page management
- carefully reviewed extras that do not expose private or unverified content

### Step 4 — verified cut-over

- compare legacy and new record counts
- test parent, teacher and admin scenarios
- obtain owner approval
- switch portal configuration
- only then run `99_retire_legacy_school_data_after_verified_cutover.sql`
- preserve the legacy table as historical evidence; do not delete it

## Features not restored automatically

- plaintext/demo credentials
- public phone enumeration
- simulated OTP codes
- sample pupils, payment claims or testimonials
- public write access to school records
- pupil accounts before separate owner approval
- health/sick-bay or other especially sensitive modules without a dedicated privacy and access review

This is content and workflow preservation, not erasure: the familiar portal returns, while the unsafe mechanisms are replaced underneath it.
