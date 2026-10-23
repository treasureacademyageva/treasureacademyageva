# Current/future journeys, conversion funnel and information architecture

**Date:** 23 October 2026  
**Scope:** public discovery → visit/application → fee confirmation → admission decision → parent/staff service

## 1. Current-to-future understanding gaps

| User question | Current-state risk | Future-state answer | Proof/control |
|---|---|---|---|
| Is this the right school? | identity and restored content can compete for attention | Treasure Academy, Ageva, location and Creche–Primary 6 context appear before secondary content | canonical host, verified contact/location data, no unverified logo claim |
| What should I do first? | many destinations without a decision path | choose Apply Now, Schedule a Visit, Fees or Portal | early CTA group and persistent primary navigation |
| Is the media authentic? | a repository file may be mistaken for current owner-approved media | only owner-verified assets are represented as authentic; uncertain files remain preserved but gated | `brand-assets.json` registry and restoration inventory |
| How much will I pay? | old/static numbers may look current | published fee guidance is labelled; office confirmation precedes transfer | Fees route + verified contact + no fake receipt proof |
| Does payment mean admission? | a payment step can feel like acceptance | payment and admission are visibly separate; admin records the decision | separate enums/tables/forms/audit; webhook cannot update students |
| Can I see my child’s record? | old browser-only portal was not shared secure data | school-issued Supabase account; parent sees linked child only | auth session + RLS parent link |
| Can staff see every child? | browser role controls can be bypassed | teachers see only matching active class/subject assignments | RLS helper checks assignments |
| Is online checkout available? | Monnify code can be mistaken for an active payment promise | no checkout exists; webhook returns 404 unless both activation switches are true | environment gate and bank-transfer-only UI |
| Was my report sent? | hand-off links can imply automatic submission | interface states that WhatsApp/call is a hand-off and the user completes it | transparent copy; no delivery claim |

## 2. Journey A — prospective parent

### Current state

1. Arrives from search, a shared link or WhatsApp.
2. Scans identity, location and class range.
3. Opens Admissions, then separately looks for fees, contact and visit guidance.
4. May encounter restored/historic destinations and wonder which information is current.
5. Contacts the office to resolve uncertainty.

**Likely emotions:** interested → uncertain → cautious → reassured only after direct contact.  
**Main abandonment points:** identity not immediate; fee/current-status ambiguity; long scroll; no clear visit route; unverified-looking content.

### Future state

1. **Recognise:** school name, Ageva context and class range appear immediately.
2. **Choose:** Apply Now and Schedule a Visit are prominent; Fees and Contact are adjacent.
3. **Understand:** concise admissions steps distinguish enquiry, document review, payment and admin decision.
4. **Verify:** bank instructions are confirmed through the verified office; payment is not acceptance.
5. **Act:** start an enquiry or visit hand-off without entering child data into public analytics.
6. **Recover:** if not ready, share the exact Fees/Admissions link; if unclear, use Contact in one click.

**Target emotion:** informed and in control, not rushed.

## 3. Journey B — admissions and payment funnel

### Funnel stages, abandonment and recovery

| Stage | User action | Main abandonment causes | Recovery design | Success signal (privacy-safe) |
|---|---|---|---|---|
| 1. Discover | opens homepage/landing page | wrong-school doubt; slow page; unclear location | immediate text identity; static fast page; canonical domain | page reached (aggregate only if analytics is later verified) |
| 2. Consider | reviews classes, mission, safeguarding, activities | generic claims; unverified imagery; missing class fit | verified facts only; class routes; visit CTA | clicks class, safeguarding or visit route |
| 3. Understand cost | opens Fees | stale amount fear; hidden extras; unsafe bank instruction | current-status labels; office confirmation; bank-transfer-only statement | Fees route reached |
| 4. Prepare | opens Admissions/requirements | too many documents; unclear sequence; mobile scroll | short checklist and staged next steps | Admissions route reached |
| 5. Enquire/visit | calls or opens WhatsApp | no reply expectation; fear of oversharing | verified channel; minimal first-message guidance; schedule-visit option | hand-off chosen; never claim message delivery |
| 6. Apply | obtains/returns approved form | fake online submission; uncertain record receipt | office-confirmed process; no claim of online submission | admin records application outside public site |
| 7. Review | school checks child/class/documents | parent assumes payment guarantees place | explicit pending/under-review/offered states | authorised admin records status |
| 8. Pay | receives verified bank details and transfers | wrong account; amount mismatch; no reference | office verification; expected payment record; bank reference | admin matches bank evidence |
| 9. Confirm | checks portal/office | pending status anxiety; fake receipt expectation | linked payment record, status, description, amount and term | parent sees authorised record |
| 10. Decide/onboard | admin records admission decision | payment wrongly treated as approval | completely separate admin admission action and audit | admission status changed by admin |

### Guardrails

- No public form is described as submitting an admission to the school unless a verified server workflow exists.
- No browser receipt page proves that funds reached the school.
- No webhook, payment status or bank reference changes admission status.
- Monnify checkout remains absent; its webhook is a dormant server scaffold.
- Raw searches, names, phone numbers, child records, passwords, payment information and form values are excluded from insights.

## 4. Journey C — current parent

### Future state

1. Opens Portal in one click from public navigation.
2. Sees bank-transfer-only and no-auto-admission statements before sign-in.
3. Signs in with a school-issued account; no public sign-up and no pupil account.
4. Sees only linked children.
5. Opens published Results or Payments using consistent portal navigation.
6. If data is wrong, uses verified support without sending a password or full private record publicly.
7. Signs out; session ends with the browser session.

### Failure/recovery states

| Failure | User-facing response | Security response |
|---|---|---|
| portal not configured | truthful setup-in-progress page | no Supabase URL/key returned; no pretend session |
| network unavailable | no-submission/error message and retry guidance | no cached private table data added by application code |
| wrong credentials | generic sign-in failure | Supabase Auth handles credential verification/rate controls |
| profile missing/inactive | contact-office guidance | sign out; no table rendering |
| child not linked | “No linked child yet” | RLS returns no other child data |
| result still draft | no parent result row | parent policy requires `published_at` |
| payment pending | status remains pending; office support route | no value/admission granted |

## 5. Journey D — teacher

1. Signs in through the same portal entry.
2. Sees active class/subject assignments and the resulting pupil scope.
3. Chooses pupil, subject, session and term.
4. Enters CA (0–40), exam (0–60) and an optional professional comment.
5. Saves a staff draft by default.
6. Reviews and explicitly publishes to the linked parent.
7. Receives clear success or failure; the database enforces unique and permission constraints.

**Abandonment/error causes:** no assignment, wrong class code, connectivity, duplicate term record, uncertainty over publish state.  
**Recovery:** empty-state instruction to contact admin; upsert by deterministic key; draft-by-default; explicit text status.

## 6. Journey E — administrator

1. Creates a user through the protected Supabase administrative process.
2. New profile defaults to parent; admin deliberately promotes staff roles.
3. Links pupils to verified parents.
4. Assigns teachers to a class and subject scope.
5. Creates a pending bank-transfer payment record.
6. Matches bank evidence, records a bank reference and marks payment paid.
7. Separately reviews admissions evidence and records the admission status.
8. Reviews admission/payment/webhook audit outcomes.

**Critical rule:** steps 6 and 7 are separate interface, policy, trigger and audit actions.

## 7. Target information architecture

### Primary layer — always easy to reach

1. **Admissions** — requirements, process, Apply Now
2. **Fees** — current guidance, bank-transfer safety, confirmation
3. **Portal** — parent/staff secure sign-in or truthful inactive state
4. **Contact / Visit** — verified channels, location and Schedule a Visit

### Secondary layer — decision support

- Academics and classes (Creche, Pre-Nursery, Nursery 1–2, Primary 1–6)
- About, mission/vision and school story
- Activities, events and notices
- Safeguarding and privacy
- Uniform, transport and supplies

### Service layer — authenticated

- Parent: Overview → My children → Results → Payments
- Teacher: Overview → Assigned classes → Results
- Admin: Overview → Pupils → People & classes → Results → Payments → Audit

### Evidence/review layer — not marketed as public truth

- brand asset registry
- media restoration inventory
- owner approval records
- migration and deployment runbooks
- Monnify disabled scaffold/readiness checklist

## 8. Navigation consistency rules

- The same words mean the same destination: use **Fees**, **Portal**, **Admissions**, **Contact**.
- “Apply Now” leads to admissions guidance, not an unverified online submission claim.
- “Schedule a Visit” leads to a verified contact hand-off and does not claim a booking was delivered.
- Portal role tabs do not move or change labels during ordinary use.
- Mobile retains familiar controls and horizontal portal navigation; it does not create a different information model.
- Back-to-public-site routes remain visible from the portal.

## 9. Release measurements without sensitive analytics

If owner-verified analytics becomes available later, measure only aggregate route events such as:

- homepage → Admissions
- homepage → Schedule a Visit hand-off
- Fees → Contact hand-off
- public site → Portal
- portal configuration available/unavailable (server operational metric, no user identity)

Never attach raw search terms, names, phone numbers, child IDs, credentials, grades, payment references, amounts, form values or WhatsApp message text. Vercel Web Analytics remains “unavailable” until separately enabled and verified.
