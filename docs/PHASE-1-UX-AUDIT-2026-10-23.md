# Phase 1 UX and accessibility audit

**Project:** Treasure Academy, Ageva  
**Review date:** 23 October 2026  
**Scope:** desktop and mobile public experience plus the new parent/teacher/admin portal  
**Implementation approach:** incremental hybrid; preserve the working static site and evidence, add reusable portal components and secure server/database boundaries

## 1. Executive finding

The public site already contains broad information and strong safety language, but the main user problem is not page count. It is confidence: a parent must quickly know that this is the right school, what classes are offered, how to visit or apply, how fees are confirmed and whether a private portal is real. Staff need a secure work surface whose permissions are enforced in PostgreSQL rather than simulated in a browser.

The redesign therefore uses two connected layers:

1. **Public confidence layer:** fast, indexable pages with consistent Fees, Portal, Admissions and Contact routes; prominent Apply and Visit actions; owner-verified claims only.
2. **Private service layer:** a no-index portal for parent, teacher and admin roles. It fails closed if Supabase is not configured, stores sessions only for the browser session and exposes no pupil account.

No unverified image, logo, social profile, testimonial or private record is used to manufacture trust.

## 2. Method and evidence

This audit extends, rather than replaces:

- `docs/BRAND-JOURNEY-ACCESSIBILITY-REVIEW-2026-10-22.md`
- `docs/VISITOR-EXPERIENCE-RESEARCH-AND-IA-2026-10-22.md`
- `docs/HANDOVER.md`
- the 30-URL sitemap and local browser/accessibility test suites
- `assets/data/brand-assets.json`, the fail-closed asset registry

Evaluation combined repository inspection, responsive page review, keyboard/accessibility criteria, navigation-path analysis and security-boundary review. Automated accessibility checks remain necessary but cannot prove that alternative text is meaningful, the reading order makes sense, or a claim is authentic; those require manual review.

## 3. Audience audit

### Prospective and current parents

**Primary questions**

- Is this the correct Treasure Academy in Ageva?
- Which class fits my child?
- What does admission require and who confirms a place?
- What will I pay, to whom, and how will I know it was received?
- Can I safely see my child's results?
- How do I raise a safeguarding or records concern privately?

**Desktop risks**

- The large number of utility destinations can make the site feel more complex than the core decision requires.
- Historic/restored content can look current unless status and verification are explicit.
- Payment guidance spread across fees, admissions, receipt and support pages can cause parents to compare inconsistent fragments.

**Mobile risks**

- Repeated long sections create scroll fatigue before a user reaches a decisive action.
- Sticky controls and page-specific controls must not change position or meaning unexpectedly.
- Tables can force zoom unless placed in named horizontal-scroll regions.
- Slow or intermittent mobile data must not block contact, fees or admissions guidance.

**Redesign response**

- Keep Fees, Portal, Admissions and Contact in persistent navigation and portal utility navigation.
- Keep Apply Now and Schedule a Visit in early public-page action groups.
- Show bank-transfer-only and payment/admission separation before a parent enters the portal.
- Parent portal queries are limited to linked pupils by RLS; published results only are visible.
- Missing configuration produces a truthful maintenance state, not a pretend login.

### Teachers and authorised staff

**Primary questions**

- Which classes and subjects am I authorised to manage?
- Is this the correct pupil and term?
- Can I save a draft before a parent sees it?
- Will the CA/exam totals be constrained correctly?
- Can another teacher or parent change my records?

**Risks**

- Browser-only role hiding is not security.
- Dense grade-entry forms increase wrong-pupil and wrong-term errors.
- A teacher covering one subject could accidentally receive whole-class access.
- Publishing immediately can expose an unreviewed result.

**Redesign response**

- Teacher visibility and mutations are checked against `teacher_class_assignments` in database policy helpers.
- Grade uniqueness is pupil + subject + session + term.
- CA is constrained to 0–40 and exam to 0–60 in both interface and database.
- Draft is the default; publication is explicit.
- Administrators assign `*` subject scope only when whole-class access is intended.

### Pupils

There is **no pupil account** in the first release. A pupil is not asked to remember credentials or manage a private school record. Parents access linked children. Public learning guidance remains available without sign-in. P6 CBT remains Common Entrance practice only and is not expanded into a general portal account.

### Visitors and community members

**Primary questions**

- Where is the school and how do I contact it?
- Is a claimed event, job, social account or payment route current?
- Can I arrange a visit without disclosing child information publicly?

**Redesign response**

- Contact and visit routes remain public and one click from key navigation.
- Unverified media/social records stay behind the evidence gate.
- Website-problem reports hand off to verified WhatsApp and never claim automatic delivery.

### Administrators

**Primary questions**

- Can I create pupil/payment records without exposing them publicly?
- Can I separate admission decisions from payments?
- Can I see who changed a decision?
- Can I grant teachers the least class/subject access needed?

**Redesign response**

- Admission and payment statuses have separate tables, policies, forms and audit logs.
- The webhook database function contains no admission update.
- Role changes are guarded by a database trigger; new auth users default to parent.
- Admin forms favour additive/status operations and omit destructive deletion from the initial interface.

## 4. Accessibility audit and design requirements

| Area | Risk | Implemented requirement |
|---|---|---|
| Keyboard | custom tabs/forms can trap focus | native buttons, links, details and form controls; visible `:focus-visible`; skip link |
| Names/labels | placeholders disappear | every portal control has an explicit associated label; hints use `aria-describedby` |
| Errors | colour-only or generic failure | inline status/alert regions, text explanation and native constraint validation |
| Contrast | premium palettes often use low-contrast gold/grey | dark navy body text; gold reserved for accents; separate light/dark tokens |
| Motion | loaders and smooth scrolling can affect vestibular users | `prefers-reduced-motion` overrides animation and scrolling |
| Mobile touch | small top links and icon-only controls | 44–48px controls; compact theme control retains an accessible text name |
| Tables | data can require page zoom | labelled, keyboard-focusable horizontal-scroll regions |
| Zoom/reflow | fixed-width layout can clip | fluid grids collapse at 900px and 620px; no maximum-scale restriction |
| Privacy | live regions can announce too much | only operation status is live; tables are not placed in global live regions |
| Dark mode | hidden contrast regressions | explicit dark tokens rather than automatic colour inversion |

Manual checks still required before release: focus order at 200% zoom, VoiceOver/TalkBack form announcements, high-contrast/forced-colours mode, real-device table scrolling and alternative-text review for any newly verified owner media.

## 5. Performance and resilience

### Public pages

- Remain static and dependency-free at runtime.
- Do not load Supabase or the portal bundle on public pages.
- Continue local search without sending raw searches or form values to analytics.
- Retain explicit image dimensions and the verified-asset gate.

### Portal

- Supabase is isolated to one bundled portal asset; the public site pays no bundle cost.
- The portal config endpoint returns only browser-safe URL/publishable-key configuration.
- Missing configuration, failed network calls and unauthorised profiles fail closed.
- No service/secret key is available to browser code.
- Portal HTML, configuration and API responses use no-store caching; the unfingerprinted portal bundle uses revalidation rather than immutable caching.

## 6. Information architecture: 1–2 click rule

| Destination | From homepage | From any main public page | From portal |
|---|---:|---:|---:|
| Fees | 1 click in primary navigation/sticky action | 1 click | 1 click in utility navigation/quick links |
| Portal | 1 click | 1 click | current context |
| Admissions | 1 click and early CTA | 1 click | 1 click |
| Contact | 1 click and visit CTA | 1 click | 1 click |

Supporting pages (classes, safeguarding, privacy, transport, uniform) remain grouped below these four decision routes. The user should not need to understand internal site taxonomy before starting an enquiry.

## 7. Prioritised findings

### P0 — required before real data

1. Run the read-only legacy Supabase inventory and create an owner-controlled backup/export before changing any former portal table or policy.
2. Apply the versioned secure migration and policy tests in staging; do not reuse broad public-write `school_data` policies and do not retire the old table before verified cut-over.
3. Create the first admin through the protected owner runbook, then verify all parent/teacher/admin RLS scenarios.
4. Keep `PORTAL_ENABLED`, `MONNIFY_WEBHOOK_ENABLED` and `MONNIFY_OWNER_VERIFIED` false until their separate readiness checks pass.
5. Test backup/restore and emergency access revocation.

### P1 — required before portal launch

1. Owner confirms portal support responsibility and record-correction response process.
2. Seed no pupil data until parent identity and lawful operational process are confirmed.
3. Run keyboard, 200% zoom, screen reader, mobile and dark-mode tests against a staging Supabase project containing fictional test records only.
4. Replace any remaining public copy that describes the portal as permanently retired; describe activation truthfully.

### P2 — post-launch improvements

1. Add a parent-readable “last updated by school” timestamp for results and payments.
2. Add CSV export for admin reconciliation only after privacy review.
3. Add an admin assignment-deactivation workflow with confirmation and audit entry.
4. Add an uptime/status note only if the school can maintain it accurately.

## 8. Sources used

- Nielsen Norman Group, journey mapping and UX mapping: <https://www.nngroup.com/articles/journey-mapping-101/> and <https://www.nngroup.com/articles/ux-mapping-cheat-sheet/>
- web.dev, accessible forms and manual accessibility testing: <https://web.dev/learn/forms/accessibility> and <https://web.dev/learn/accessibility/test-manual>
- Supabase, RLS/API security/functions: <https://supabase.com/docs/guides/database/postgres/row-level-security>, <https://supabase.com/docs/guides/api/securing-your-api>, <https://supabase.com/docs/guides/database/functions>
- Monnify, webhooks and transaction verification: <https://developers.monnify.com/docs/webhooks>, <https://developers.monnify.com/docs/collections/manage-payments/verify-transactions>
