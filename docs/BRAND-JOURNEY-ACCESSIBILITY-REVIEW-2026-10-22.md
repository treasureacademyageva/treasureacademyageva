# Brand, Journey and Accessibility Review — 22 October 2026

## Release candidate

- Release label: `20261022-ux3`
- Branch: `improve/brand-journey-accessibility-20261022`
- Base production commit: `14a78a349e69634c88d68430039baccd385cd984`
- Canonical site: `https://www.treasureacademyageva.com`
- Deployment state when this note was written: tested locally; production push still requires a secure GitHub connection. No chat-exposed token may be reused.

## Public experience

- The homepage states the school name, location and Creche–Primary offer immediately.
- Apply for Admission and Schedule a Visit remain early, consistent actions.
- Navigation, breadcrumbs, route actions, Search, Explore, footer and the five-item mobile dock use shared patterns.
- All useful public pages are reachable within two actions through navigation, Explore or local Search. The intentional `404.html` is the only page outside the normal graph.
- Mission/vision, programmes, archived school-life material, announcements, family help, admissions, fee safety and verified contact routes are available without inventing current facts.
- The retired parent portal remains a truthful support handoff rather than insecure browser authentication.
- Payments use manual bank transfer or the physical school-office POS after office verification. There is no online checkout, card-data collection, WhatsApp payment evidence or browser receipt system.

## Brand integrity

- A fail-closed owner registry now lives at `assets/data/brand-assets.json`.
- The public site uses a neutral text-based `TA` mark while the approved logo master is pending.
- The restored artwork that reads “Treasure Kiddies” is withheld from public pages and remains available only in the noindex owner/developer evidence area.
- Unverified campus and classroom photographs are no longer promoted as current homepage photography.
- The known `sports.png` image naming another school is not used on a public page.
- Restored excursion/graduation material is kept as archive material with provenance/consent warnings.
- Structured data omits the unverified logo and unverified `sameAs` social-profile claims.
- The social preview card is factual and text-based; it does not invent an official crest.
- Owner evidence requirements are documented in `docs/OWNER-BRAND-EVIDENCE-CHECKLIST-2026-10-22.md`.

## Journey evidence and privacy

- `TAUX2` diagnostics keep only session-scoped, allowlisted page, CTA, navigation, search-family, form-start, website-step completion, abandonment and broad environment categories.
- The code does not store names, phone numbers, child data, passwords, payment data, raw searches or form values in diagnostics.
- It distinguishes a completed website step from an external WhatsApp send, admission decision or payment confirmation.
- `TAUX1` diagnostic codes remain decode-compatible.
- Web Analytics remains disabled/unavailable and is not automatically requested. Speed Insights remains the only automatically loaded production measurement script when privacy preferences allow it.

## Developer Experience Studio

`developer-operations.html` now provides:

- brand/name/structured-data/contact/asset readiness;
- page-level accessibility and content evidence;
- privacy-safe TAUX1/TAUX2 import and aggregation;
- CTA, funnel, abandonment, device, channel and touchpoint summaries;
- editable persona and research fields without inferred demographics;
- empathy maps, day-in-the-life maps, current/future journeys and service blueprints;
- local Search and production-health labs;
- owner evidence decisions;
- Markdown, JSON and CSV handoffs for a future improvement agent.

Research maps and imported reports remain in that browser unless explicitly copied, downloaded or cleared. The operations page contains no pupil records or credentials and does not pretend to be secure school administration.

## Accessibility work

- Shared form errors are visible, programmatically associated and move focus to the first invalid control.
- Skip links move keyboard focus to main content.
- Focus indicators, invalid fields, disabled states, forced-colour behavior, tap targets and dark-theme contrast are strengthened.
- Horizontally scrollable components are keyboard focusable.
- Long verified email text wraps at 320 CSS pixels.
- Image dimensions, alt attributes and labels are structurally checked.
- Manual checks remain necessary for final owner-approved image descriptions, human screen-reader testing, content comprehension and real-device behavior. This release does not claim legal or ADA certification.

## Test evidence

- Static production audit: **16 passed, 0 failed**.
- Visitor UX static suite: **45 passed, 0 failed**.
- Browser visitor QA: **1,424 passed, 0 failed** across 56 pages at 320 px, 390 px and 1,365 px, plus dark-mode and parent-help scenarios.
- Automated accessibility component QA: **58/58 light-theme pages** and **4/4 representative dark-theme pages** with no serious/critical axe findings.
- Generated experience audit: **56 pages**, **55/56 within two actions**, **0 missing alt attributes**, **0 missing form labels**, **0 unsized images**; only the intentional 404 is unreachable from Home.
- Accessibility-tree spot checks confirmed the homepage and contact-page landmarks/headings, associated contact error alert, and labelled Developer Studio research/export controls.
- Consolidated stylesheet: about **45.7 KB gzip**.
- Public shell: below **5 KB gzip**.
- Journey diagnostics: below **5 KB gzip**.

## Owner actions still required

1. Revoke every GitHub personal access token pasted into chat; treat each as compromised and never reuse it.
2. Supply the approved Treasure Academy logo master and approval evidence.
3. Approve authentic campus/classroom/activity photographs with source, consent, placement and alt text.
4. Verify official social-profile URLs before publication or structured-data use.
5. Supply current approved documents such as a fee schedule, admissions guide and calendar with owner and review date.
6. Complete human keyboard, screen-reader, zoom and real-device review with representative parents/staff before making any legal compliance claim.
