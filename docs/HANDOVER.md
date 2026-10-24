# Treasure Academy — site handover

> **Which doc do I read?** This file is the running changelog: what each batch
> added and why. For how the site is put together and how to work on it safely
> — setup, the traps that keep catching people, the version ritual, the data
> model, what is safe to delete — read `docs/MAINTENANCE.md` first. Owner rules
> appear in both; `MAINTENANCE.md` has the fuller wording and wins if they ever
> drift apart.


## 24 October 2026 — owner-authorised dynamic maintenance release (local, inactive)

Proprietress Shaibu Sidikat Ruth directly authorised the complete programme. The protected maintenance branch now includes the full-write Proprietress title/scope, phone-verified first-password claims, teacher assignment history and independent movement/replacement approval, independently approved exceptional progression, separate Common Entrance candidacy, truthful standard/accelerated Graduate Hall labels, public portal/tracking/registration entry points, the approved Jibril/Paragon credits and a gated HMAC-signed school-side relay client. No password or private pupil/staff roster was added. Details and release order: `supabase/release/20261024_DYNAMIC_MAINTENANCE_RELEASE_PLAN.md`.

Local acceptance passed 8/8 ordered migrations, 4/4 rollback-safe SQL policy suites, the read-only postflight, 84/84 portal/security checks and the complete static/browser/accessibility suite. Exactly 10 Serverless Function entry files remain. This new migration, code release, account-claim seed, identity bootstrap and gates are **not yet production-applied or activated**. Production remains the clean deployed revision `7e1d30046e08fe84c4291cf81c7346db784c0573` with seven migrations and all protected gates false. The clean Paragon source ZIP is still required before relay activation.

## 24 October 2026 — production schema installed; code release pending

The owner authorised the existing Supabase project directly. All seven migrations are now recorded in production and the read-only postflight passed. Every one of the 25 former table counts remained unchanged (70 total rows), Auth remains empty, all release-marker tables and critical indexes are present, RLS/function grants passed, and Auth/database/REST/Storage remained healthy. No private data was imported, no account or developer capability was created, and every application/runtime gate remains off. Evidence: `supabase/release/20261024_PRODUCTION_SQL_EXECUTION_EVIDENCE.md`.

This current status supersedes the earlier historical statements below that production SQL had not yet run. The source commit/push/deployment is the next separately recorded operation.

## 23 October 2026 — School Office Operations Programme (local, inactive)

Migrations 005 and 006, parent self-registration, permanent enrolment history, the exact no-Primary-5 progression, promotion previews, Graduate Hall/consent-reviewed Graduate Wall, term invoices, physical inventory, procurement, fulfilment, transport, returns/exchanges and manual bank/physical-office-POS verification are implemented locally. Ordinary parents self-register using `TA-LINK`, phone-bound `TA-FAMILY` or a restricted applicant route; the Headmistress provisions staff, not ordinary parents. No payment gateway, online card form, card-data storage or WhatsApp payment-evidence workflow is part of the approved design. See `docs/SCHOOL-OFFICE-OPERATIONS-PROGRAMME-2026-10-23.md`.

No commit, push, deployment, production SQL, real-data import or gate activation was performed for this programme. `PORTAL_REGISTRATION_ENABLED`, `PORTAL_OFFICE_ENABLED` and `PUBLIC_GRADUATE_WALL_ENABLED` remain fail-closed in addition to all earlier gates.

## 23 October 2026 — staff operations and Website Request Centre implementation

The approved teacher/administrator programme is implemented on the protected branch, including the mobile four-image gallery, independent Headmistress/Assistant scope, leadership My Class workspaces, attendance, offline homework, CA1 20 + CA2 20 + Exam 60 result workflow, Operations Inbox, admission/payment/publication separation, bank-transfer verification, staff information, protected historical Headmistress sections and supporting audits. Structured school-number WhatsApp drafts now route to the website Request Centre; generic WhatsApp remains. Public/staff requests receive a database reference plus one-time private tracking code, of which only a hash is stored. See `docs/STAFF-OPERATIONS-AND-REQUEST-CENTRE-2026-10-23.md`.

No production SQL, Auth account, portal/request/public-information/parent-linking activation or deployment has occurred. Migrations 001–004, live RLS/session validation, owner-controlled account provisioning and each environment gate remain separate safety steps.

## 23 October 2026 — parent–pupil linking implementation

The owner approved and authorised local implementation of the complete parent-linking design after the teacher/administrator build. Existing pupils are added class by class and remain distinct from new admission applicants. A parent types the registered pupil name after choosing a class; the website never displays a pupil-name list. A candidate match shows a limited green confirmation, but private access requires a school-issued, hashed, single-use pupil-linking code. A successful code check links automatically without a second manual approval. A pupil may have at most two independently authenticated parent/guardian accounts; the first may share a separate, expiring second-parent invitation, never the original code. Linking happens once and future access uses normal phone/password sign-in. See `docs/APPROVED-PARENT-PUPIL-LINKING-DESIGN-2026-10-23.md`.

Migration 004, same-origin server Functions and the parent/admin workspaces implement linking locally behind `PARENT_LINKING_ENABLED`. Migration 005 supersedes the account-first part of this earlier design: ordinary parents now self-register with a valid private credential, while genuinely new families receive restricted applicant access. There is still no name/class-only access or pupil login. Nothing has been migrated, activated, populated with real pupils or deployed.

## 23 October 2026 — owner-directed familiar design restoration

The owner explicitly requested restoration of the familiar crest, imagery and visual richness before teacher/administrator work continues. Public navigation, footer and portal entry now use `assets/img/logo.jpg`; the homepage/About/News visual sections and portal illustration are restored without undoing the secure portal foundation. Large earlier-site visuals are described as illustrations rather than verified current campus photography. Images visibly naming other schools remain excluded. See `docs/DESIGN-RESTORATION-2026-10-23.md`. The account Function entry points were also changed to fail closed before loading Supabase dependencies when portal accounts are disabled.

## What this is
Static school website + staff/headmistress/pupil portals for **Treasure Academy, Ageva, Okene, Kogi State, Nigeria**.
Hosted on Vercel (preset "Other", no build command, output `./`, no env vars). Repo: github.com/treasureacademyageva/ng — work goes to the `preview` branch first; merge to `main` only when the owner says "go live". Never push straight to main.

## Current state (Batch 51 preview, `?v=20260929-ui51`, sw `treasure-v72`)
Batch 51 is complete on `preview` but is **not released to production**. Production remains the owner-authorized Batch 50 release until a new explicit go-live instruction.

Batch 43 additions (owner-directed): "Treasure Sans" (Sora-based) + "Treasure Serif" (Fraunces-based) self-hosted in `assets/fonts/` — Google Fonts CDN removed from all 40 pages; a real studio-commissioned font can replace those files later with zero code change. Treasure FX layer at end of `site.js`: button ripple, segmented `.seg` tabs with sliding ink (graduates now toggle All/2025/2023), `[data-countup]` animated stat numbers, `.tilt` 3D-hover cards, `.stag-grid` staggered reveals, `.spy-bar` scroll-spy jump nav (alumni has one). Brand motif = `--motif` inline SVG diamond-seed in corporate.css (applied to section tags). Owner is bringing a brand designer's artwork later — drop files in and reference them; no AI/stock imagery permitted per owner.
- **40 pages**: 36 root + 4 portal (admin/teacher/pupil + login). Page-count pins in verify-batch9/10 = 40.
- **Accounts vs public display (IMPORTANT, owner demanded b42):**
  - `db.teachers` = the 7 DEMO login accounts (PIN 1234) — portal logins only.
  - `db.staffWall` = the REAL 10 staff from the school's filing (W01–W10: Idris Ibrahim … Bose Momoh, School Administrator). Display only — NO pins, NO logins. The alumni staff wall, collage, search, search engine, and staff popups read this.
  - `db.pupils` = demo pupils (kept).
  - `db.graduates` = the REAL 39 Common Entrance graduates seeded from Kogi Ministry papers: Class of 2025 (21, with exam numbers BS/OKN/141001–021 + ENG/MAT/GEP/total) and Class of 2023 (18). Display only.
  - Migrations in store.js move any legacy `class:"Graduated"` pupil rows into `graduates`.
  - `formerTeachers` seed empty — real former staff names come from the owner (chat), never invented.
- **Footer accreditation strip**: real marks fetched from official sources — Kogi Govt (kogistate.gov.ng), Kogi MoEST (moest.kogistate.gov.ng), NAPPS (nappsng.org), NYSC (nysc.gov.ng), CE crest (same ministry). They LINK to those official sites (owner decision) with target=_blank rel=noopener. CE note under strip: centre BS/OKN/141.
- **Staff Code of Conduct**: sidebar page in teacher (10th) + admin (above Settings, 22 sections total) portals; first-login must-accept modal (no decline), acceptance stored (`teacher.cocA/cocAt`, `school.cocA/cocAt`).
- **Code-managed identity**: school name/term/session/dates are NOT editable in admin UI (purged b39); owner dictates changes in chat → code.
- **Voting**: no vote buttons on the public wall (b42). Legacy `window.voteTeacher(id)` still records toward the headmistress' Teacher-of-Term tally (admin can crown).
- JS docs/best practice: all new public records → display arrays (staffWall/graduates), accounts stay minimal.

## Quality system
- 40 suites: `verify-batch2.js … verify-batch41.js` in workspace root (not in repo). FRESH total after every batch: run all, sum "passed". Latest: **1307 checks, 0 failures** (b42).
- Run from /home/user: `npm install jsdom --no-audit --no-fund` first each session.
- Version pins inside ~17 suites (b15, b26–b41): sed `treasure-vNN` + `20260919-NN` on every bump; sw.js `treasure-vNN`; developer.html `var BUILD`. README ×2 with fresh sum.
- Data-truth asserts retire whenever owner changes data (b8 T007 Nursery 1, b9 Aunty Rafatu votes, b14 sort order = Creche first/Bose last, b40/b41 wall semantics).

## Owner standing rules (short list)
Real data from owner only (never invent names/dates); WhatsApp 09063932487 only; no online assignment submission; birthdays staff+headmistress only; CBT only as Primary 6 CE practice; professional look, no pills nav, no hamburger (sidebars OK desktop); day+dark token colors; payments = manually verified bank transfer or in-person physical school-office POS, with no online card form or WhatsApp payment evidence; keep site simple — delete unneeded files; suggestions each round (owner approves/rejects each).

## Open items for next rounds
- Shaibu Memunat (11th name on staff filing) — no role/quals given; owner must send details → add to staffWall (suggested Nursery 2).
- CE 2025 score rows for Itofa, Muhammed Kausara, Onimisi were blurry — correct on owner's clearer photo.
- Purge round 2 still unanswered (admin tabs to remove, owner replies numbers).
- BACKLOG: map latitude/longitude (ask owner), tour video, custom domain, TREASURE COLLEGE naming phase and absent-alert automation. The former Moniepoint idea is superseded and must not be reactivated.
- OWNER_IMAGES: upload real staff/group photos → drop into teacher profiles + staff group slot (class-feature.jpg currently a Kogi public-school news photo from kogireports.com).


## Batch 44 additions (launch readiness, owner-directed)
- SEO: every one of the 35 public pages carries unique meta description + canonical + Open Graph + Twitter card + theme-color + manifest/apple-touch links (marker `<!-- treasure-seo -->`); School JSON-LD on index; `robots.txt` (portal + developer disallowed) + `sitemap.xml` (35 URLs, generated per release date); portal pages all `noindex,nofollow`.
- PWA/app-readiness: `site.webmanifest` + icon-192/180/512 (for the future Kotlin/Gradle WebView app — start_url `/index.html`, standalone display).
- `404.html` (branded, noindex, links home/admissions/contact/portal).
- fees.html comparative pricing zone ("Compare fees at a glance", Per term/Per year seg tabs + 5 class bands + "Every fee covers" grid) — spaceship.com-inspired DNA per owner.
- Type scale polish (page-hero clamp headlines, tracking).
- CLEANUP NOTE: the 10 shop-*.jpg demo images LOOK unreferenced but are runtime shop-inventory photos pinned by verify-batch4 — NEVER delete assets/img/shop-*.jpg (restored after accidental deletion).
- Suite loaders now exclude ld+json scripts: `script:not([src]):not([type="application/ld+json"])` globally — preserve when writing new suites.
- 404.html page -> site total = 41 pages; b9/b10 walk pins = 41.


## Batch 46 additions (owner corrections + repo reconciliation)
- Staff Code of Conduct rewritten FAITHFULLY — the paper's 20 numbered rules, plain numbered list, no cards, no categories, "Sign — Management" (owner rejected the earlier categorized-card version).
- tools/tests carries the live suites: verify-batch2.js … verify-batch44.js plus seo.test.js (43 suites, 1422 checks). tools/run-all-tests.sh runs them from the repo root: `npm install jsdom --no-audit --no-fund && bash tools/run-all-tests.sh`.
- Preview→main PR opened as release bundle; merge to main still owner-commanded ("go live").
- Version now `20260919-50` / sw `treasure-v50`.


## Batch 47 additions (owner's typography brief + go-live)
- Type system swap (owner's trio): **Gidole** (real files, body/UI/nav) · **Sabon stack** (headings — loaded libre EB-Garamond-family files named "Garamond Libre", Sabon remains first fallback for licensed owners) · **Northwell stack** (signatures only — loaded libre Kristi files; class .sig). Old Treasure Sans/Serif font files REMOVED (retired deliberately; keep assets/fonts minimal).
- Application map: body/nav/buttons/forms = Gidole · h1/h2/sec-heads/hero/anthem = Garamond stack · .sig only for signatures (CoC "Sign — Management" uses it) · script/script font must NEVER be used for UI.
- PR #1 (preview→main) merged on owner's explicit command = GO LIVE. Main = production from here.


## Batch 48 additions (owner font decision: end of Google-catalog fonts)
- Owner rejected Google-catalog fonts entirely ("all those treasure fonts were replicas of Google fonts"). Type system now **100% Indian Type Foundry (fontshare.com, real designer foundry, free for commercial use, NOT on Google Fonts)**: **Clash Display 500/600** (headings), **General Sans 400/500** (body/UI), **Spline Sans Mono 400** (kickers, `.sec-tag` everywhere, and `.sig` sign-offs). The previous Gidole/Garamond/Kristi files were retired deliberately.
- Human-studio finish: mono kicker labels, `text-wrap:balance` headlines, 70ch measure on section intros, body line-height 1.55, weight discipline (body 400/500, headings 500/600 only).
- `.sig` now renders in mono-italic (studio document style) — not a playful script.
- Files live in assets/fonts/ (5 woff2). Rule holds: any new font must NOT be from Google Fonts or its mirrors; check with the owner before adding type families.


## Batch 49 additions (agent polish & fix pass, 26 Sept 2026 — preview)
Re-applied on top of owner commit 14959de (which had independently bumped sw->v69 / assets 20260926-7-63).
- **Canonical host fixed (long-standing SEO bug):** `tools/set-site-host.py https://www.treasureacademyageva.com` rewrote 250 refs across 40 files. Canonical/OG/Twitter/sitemap now point at the live host (HTTP 200) instead of the dead `treasureacademyageva.vercel.app` (404). Owner confirmed staying on ng-psi.vercel.app until a custom domain is bought.
- **Dark mode respects the OS preference:** `autoDark()` checks `prefers-color-scheme: dark` first, then falls back to the 7pm-6am rule. jsdom has no matchMedia so verify-batch16's 10am/10pm pins still hold.
- **Native controls follow the theme:** `color-scheme: dark` for `[data-theme="dark"]`/`[data-theme="dark-hc"]` in glass.css.
- **Version bump v49:** sw `treasure-v70`; assets unified to `20260926-8-64` on public + portal (portal had been left behind at 20260924-61); developer BUILD `treasure-v51`, page-asset label `20260919-51`. verify-batch47 exact-version guard updated to the new strings.
- **All 55 suites green — 12,269 checks** (owner's new verify-batch48 included). No content, DOM, fonts, nav or owner decisions changed.


## Batch 49b additions (critical security + contact fixes, 26 Sept 2026 — preview)
- **SECURITY — demo credentials no longer public.** Removed the `.demo-box` on portal/login.html that advertised Headmistress `HEAD001`/PIN `1234` + parent phones, and removed the "Password Generator" side panel (`genSuggest`) that returned a password suggestion for any pupil from a phone number. The four demo accounts still authenticate (Auth.staffLogin/pupilLogin) and the `fillDemo`/`fillStaff` helpers remain for the test harness, but nothing is shown to the public. verify-batch46 now asserts the credentials are NOT displayed and the generator hole is gone.
- **Phone number corrected.** `+234 814 194 378` (9 digits) -> `+234 814 194 3478` in SCHOOL_DEFAULTS (store.js), the School JSON-LD (seo-build.py) and every regenerated page.
- **tel: links now work without JS.** The 39 empty `href="tel:"` links across all pages now carry `tel:+2348141943478` as a static fallback (site.js still overrides from live data). A parent tapping "Call" gets a valid number even before scripts load.
- All 55 suites green — 12,270 checks.


## Batch 49c additions (homepage news leads with admissions, 26 Sept 2026 — preview)
- **Homepage "latest news" now leads with the fresh Sept 2026 admissions**, not the 2017–2021 graduations. Added seed newsEvents item `NEA26` ("2026/2027 Admissions Are Now Open", dated 2026-09-15, views:0/likes:0) so it sorts to the top of the date-desc feed; the five real graduation records are preserved and follow below. Backfill migration `admNewsV1` pushes NEA26 into existing localStorage saves too.
- Updated the feed assertions in verify-batch47 (six records; admissions leads; newest-5 shown) and verify-batch19 (featured = admissions). All 55 suites green — 12,270 checks.


## Batch 49d (canonical host flipped back to the live URL, 27 Sept 2026 — preview)
- The Vercel project was renamed, which FLIPPED the live URL: `treasureacademyageva.vercel.app` is now live (HTTP 200) and `ng-psi.vercel.app` now 404s — the reverse of the Batch 49 situation. Verified with live HTTP checks before changing anything.
- `tools/set-site-host.py https://www.treasureacademyageva.com` rewrote 254 references across 42 files (canonical, og:url/og:image, Twitter, JSON-LD url/logo/image + SearchAction, robots.txt Sitemap:, all sitemap.xml <loc>). Live check now 200, no stragglers in code.
- NOTE: the Batch 49 / 49b notes above describe the earlier (now-superseded) direction and read as contradictory after this flip — kept as history. This 49d entry is the current truth: canonical host = treasureacademyageva.vercel.app.

## Batch 49e (Privacy Policy + Safeguarding pages, 27 Sept 2026 — preview)
- NEW `privacy.html` and `safeguarding.html`, cloned from the standard page template (loader, skip-link, #main, manifest, chatbot + auth scripts) so all strict suites pass.
- Content written in plain, parent-friendly English and accurate to how the school actually runs (data collected at enrolment incl. blood group; localStorage/office storage; birthdays staff-only; bank-transfer fees; WhatsApp 09063932487; Call line +234 814 194 3478). Each page ends with a clearly-marked "For the school to complete before going live" box listing exactly what the owner must send (registered name, CAC/RC no., Ministry approval no., official email, DSL name/contact, review date).
- Wired site-wide: footer now has a Privacy Policy + Safeguarding legal-links row (site.js). DESC entries added to tools/seo-build.py; ran it → canonical/OG/Twitter/breadcrumb generated + both added to sitemap.xml (33 urls).
- Test pins updated for +2 public pages: verify-batch9/10 (41→43 html), verify-batch29 (tel 39→41; added aria-label to in-content tel links so no icon-only control), verify-batch44 (public pages + unique descriptions 35→37). Full suite: 55 suites, 12,270 checks green.
- STILL OPEN (owner-blocked): the placeholder items above must be pasted before these pages go live on main.

## Batch 49f (login demo-code removal, 27 Sept 2026 — preview)
- Removed dead/insecure demo login helpers from portal/login.html: `autoPassTreasure` (bot-check bypass), `demoSubmit`, `fillDemo`, `fillStaff` (one-tap logins with a hardcoded "1234" PIN). Confirmed nothing in the real UI called them — only the test harness did. Real human-verification still uses `passTreasure()`; real login unchanged.
- Reworded the "already logged in" notice from "Trying another demo? Logout first." to neutral "Signing in as someone else? Logout first."
- Updated verify-batch16 (assert helpers are gone + test real pupil phone login instead of the removed one-tap) and verify-batch18 (assert staff phone login resolves to T001 via Auth.staffLogin instead of fillStaff). 55 suites, 12,270 checks green.
- DECISION (kept, not deleted): seed pupils P001–P003 (Adaeze Okafor / Emeka Nwosu / Ada Nwosu — fake demo names, not real PII) were NOT removed. They are the backbone fixture of 17 test suites (auth, results, attendance, rank, testimonials) and the store seed (results L324, attendance L330). Deleting them = a large, risky teardown with little security benefit now that the login UI no longer exposes them. Recommend keeping as the portal demo fixture until the owner supplies real pupils; owner can then replace them.
- Real staff KEPT per owner: HEAD001 (Mrs. Salihu Nanahawa, Headmistress/admin) and T001 (Shaibu Memunat, Primary 1 teacher). NOTE: both still use default PIN "1234" — owner should set real PINs (cannot be invented).

## Batch 49g (real legal data + SEO/security hardening, 27 Sept 2026 — preview)
- Headmistress real phone added to HEAD001 seed: 0813 316 7728 (Mrs. Salihu Nanahawa).
- CAC/legal captured from owner: **Treasure Academy Ageva Limited**, **RC-9634403**, incorporated company, privately held since 2017. Now shown on privacy.html (Who we are), and added to homepage JSON-LD (legalName + identifier RC-9634403 + foundingDate 2017).
- Structured data: removed a DUPLICATE (conflicting-phone) School JSON-LD block on index.html; enriched the single authoritative School block with legalName/RC/foundingDate/sameAs(Facebook). seo.test still finds School as blocks[0].
- Privacy + Safeguarding TODO boxes updated: registered name/RC/founding + DSL (Headmistress, 0813 316 7728) now filled; still-needed = Ministry approval no. + official email (privacy) and local emergency contacts + review date (safeguarding).
- SECURITY/SEO: README.md no longer prints the demo credential table (was publicly indexed on GitHub as the #1 result for the school name and leaked HEAD001/T001/parent phones + PIN 1234). Replaced with a safe note. Tests updated: batch19/46 now assert README does NOT leak creds; batch44 matches the single spaced School block.
- Search findings (web): live vercel site not yet indexed; GitHub repo currently outranks it; NO competing "Treasure Academy" in Ageva/Okene/Kogi. See owner report for Search Console + repo-privacy recommendations.

## Batch 49h (real staff update — Abedoh Rafatu, 27 Sept 2026 — preview)
- Owner: Abedoh Rafatu is now the Primary 4 Class Teacher AND the Nursery 1 Assistant (dual role), replacing Tahab Oyiza Zainab. Phone 0706 492 3346.
- staffWall W05: Tahab Oyiza Zainab → Abedoh Rafatu. gender Female (matches the codebase's existing "Aunty Rafatu" refs), class "Primary 4", position "Class Teacher & Nursery 1 Assistant" (card renders "… - Primary 4"), quals "" (owner to send later), phone stored in record (not rendered publicly), assists:"Nursery 1". About kept in the house "What she does best…" style (required by verify-batch46) and role-based (no invented credentials).
- Nursery 1 head teacher remains Nasirun Yahaya (W04); Abedoh assists there.
- Chatbot now answers "who teaches Primary 4?" → Abedoh Rafatu (data-driven from staffWall).
- Tests updated: verify-batch40 (W05 name pin), verify-batch46 (quals map: Abedoh '' replaces Tahab), verify-ebira (Primary 4 answer). Wall still 11 teachers. 55 suites, 12,270 checks green.
- OPEN: Abedoh's qualification (blank), and whether she should also get a teacher-portal login (T002) — not added yet to avoid weak-PIN proliferation; her phone is on record if needed.

## Batch 49i (homepage news → auto-rotating carousel, 27 Sept 2026 — preview)
- #newsGrid is now a rotating carousel of the latest **4** items (was a static grid of 5). One card shows at a time; the next fades/slides in as the previous fades out. Auto-advances every 5s, pauses on hover, prev/next arrows + clickable dots, and respects prefers-reduced-motion (no auto-advance). Inline <style> so it also works in the single-file preview.
- All latest cards stay in the DOM (visually toggled), so the SEO/structure tests still see them. Lead card = "2026/2027 Admissions Are Now Open".
- Tests updated: verify-batch47 (now expects newest 4, carousel wording), verify-batch46 (news markup asserts ne-carousel). 55 suites, 12,270 checks green.

## Batch 49j (WebP conversion for 3G speed, 27 Sept 2026 — preview)
- New tool tools/webp-build.py: generates .webp siblings (quality 80, method 6) for photographic images >120KB, excluding logo/icon/og-cover/shop/favicon. Ran it → 18 files, 5.7MB → 2.7MB (~3MB / 52% saved).
- Wrapped 16 static <img> tags across 8 pages in <picture><source type="image/webp"> + original <img> fallback (about, homework, index gallery ×9, lost-found, openday, photo-day, reading, uniform). Inner <img> keeps width/height/alt/lazy so seo.test stays green; original PNG/JPG kept as fallback for old browsers.
- JS-data thumbnails (news carousel) still point at PNG originals (lazy, below-fold) — can migrate later if needed.
- No single image >1.2MB; all 55 suites, 12,270 checks green.

## Batch 49l (two real leadership accounts + create-password/OTP-to-developer, 27 Sept 2026 — preview)
CORRECTION of my earlier misread. The only two REAL accounts are the two leadership roles; nobody else gets a login, and the teacher wall stays a display of past/present staff.
- store.js admins: **HEAD001 = Mrs. Salihu Nanahawa (Headmistress, teaches Nursery 1)** and **ASST001 = Mrs. Abedoh Rafatu (Assistant Headmistress, teaches Primary 4)**. Both ship with NO password/PIN (`pin:null, password:null`) + `adminRole` + `title` + `teachesClass`. Migration `staffAccountsV1` upgrades existing saves (drops the old fixed PIN, adds the assistant).
- Auth: `staffLogin("admin",…)` now matches by staff ID OR phone and checks a password the user CREATED; returns `{nopassword:true}` on first login. Added `Auth.staffFind()` and `Auth.setStaffPassword()`. Session carries `adminRole`/`title`/`teachesClass`.
- First-login flow (login.html) reused for staff: pick WhatsApp or SMS → `TAVerify.issue()/issueStaff()` drops the code in the DEVELOPER inbox (no on-screen code anymore) → code verified via `TAVerify.check()` (now also matches staff `idRef`) → `setStaffPassword`.
- verify.js: `issue()` records `method` + `kind:"parent"`; new `issueStaff()` (kind:"staff", idRef, who, phone, method); `queue()` exposes `method`/`kind`/`who`.
- developer.html OTP inbox row now shows **"· send via WhatsApp/SMS"** and marks **staff login** rows.
- Tests updated to the new model (batch8/18/46) + fixed a pre-existing date time-bomb in batch2. Full suite **55 suites / 12,272 checks green**.

STILL TO DO (next): role-gate admin.html so the Assistant Headmistress sees only her agreed sections (headmistress-only: Teachers, Duty Roster, WhatsApp, Testimonials, Website Extras, Shop & Orders, Code of Conduct, Settings); add the "My Class" teacher section on each admin's side (Nursery 1 / Primary 4).

## Batch 49m (leadership role gates + working My Class, 27 Sept 2026 — preview)
- `portal/admin.html` is now role-aware from the authenticated leadership record (not a hardcoded Headmistress dashboard). The top identity and portal label show **Headmistress / Nursery 1** or **Assistant Headmistress / Primary 4**.
- Assistant Headmistress keeps the 17 confirmed sections: Overview, My Class, Staff Messages, Verify Pupils, Registrations, Applications, Pupils, Results, Attendance, Promotions, News/Events, Messages, Entrance Qs, Notices, Class Pages, Calendar, Timetable.
- These exact 8 sections are Headmistress-only and are hidden+disabled for the Assistant, their panels are locked, and the router independently rejects typed hashes/synthetic clicks: Teachers, Duty Roster, WhatsApp, Testimonials, Website Extras, Shop & Orders, Code of Conduct, Settings. The Assistant is not blocked by the Headmistress Code-of-Conduct acceptance modal.
- Added a real **My Class** section for each leadership account's assigned class. It contains: class stats; editable daily attendance with Present/Absent/Late, pupil notifications and parent WhatsApp links; CA1/CA2/Exam result input with grade/average, draft/submission and approved/published locking; class-scoped homework (optional photos); and a class roster with attendance + result status. Every write is scoped to `teachesClass` from the account record.
- Tests now cover the exact Assistant visible-section count and restricted list, route guard, no CoC gate, Primary 4 attendance/result/homework writes tagged to ASST001, and Headmistress's full 25-section/Nursery 1 view. Full suite: **55 suites / 12,283 checks green**.

## Batch 49n (launch blockers 1–8 + marquee polish, 27 Sept 2026 — preview)
Audit cleanup completed without inventing any owner data:
- Human-visible company identity is now in every rendered footer: **Treasure Academy Ageva Limited · RC 9634403**. About now has a **Registration & Approvals** panel containing the verified CAC number and Common Entrance centre no. BS/OKN/141. No Ministry approval number was guessed or published; add it only when the owner provides it.
- Removed the internal `[TO BE PROVIDED]`/developer to-do panels from public `safeguarding.html` and `privacy.html` (the email upgrade remains parked internally, not shown to parents).
- Homepage LCP image is `loading="eager" fetchpriority="high"`; every other reviewed image remains lazy.
- Fixed the broken `(headmistress controlled) -->` text artifact and removed the visible `--` before Weekend.
- Portal session/redirect destinations now use explicit `/portal/pupil.html` (and explicit admin/teacher equivalents), eliminating the ambiguous root `pupil.html` 404 path.
- The pages named in the audit already carry real seed content. Their empty-state copy was changed from “coming soon” to honest, useful guidance (Uniform, Exams, Transport, Staff, Open Day, Reading, PTA minutes) rather than hiding useful populated pages.
- Zero engagement counters are omitted from homepage/news cards and story metadata; non-zero views/likes/comments still render with singular/plural wording.
- Rebuilt the 18 approved root photographic WebPs at max 860px, quality 62, method 6. Root WebP payload: **2,777,046 → 1,063,570 bytes (61.7% reduction)**; largest is ~93KB. All 18 validate. `tools/webp-build.py` now reproduces these settings. `shop-*.jpg` remains excluded/untouched.
- Added `U.webpAsset()` for JS-rendered images; homepage news and news page cards/gallery/lightbox now prefer existing `.webp` siblings. The one gallery photo without a WebP keeps its already-small JPG.
- The announcement marquee now has one content run and no longer repeats the admissions text twice. CSS animates that single run across the viewport.
- Tests updated for the non-duplicated ticker, explicit portal link, hidden zero counters, RC/About/policy/LCP/artifact/placeholder/WebP checks. Full suite: **55 suites / 12,294 checks green**.

Still intentionally parked: current-session/news archive restructure; self-hosting Facebook MP4s; `info@` domain email; Ministry approval number until supplied by owner.

## Batch 49o (final pupil.html 404 compatibility fix, 27 Sept 2026 — preview)
- Exhaustive non-test source search found no current UI link to root `pupil.html`; current portal login links were already explicit `/portal/pupil.html`. The remaining 404 is a legacy/stale root URL.
- `assets/js/auth-ui.js` now also uses the explicit absolute `/portal/pupil.html` destination (no base-path concatenation).
- `vercel.json` now permanently redirects **`/pupil.html` → `/portal/pupil.html`**, so old bookmarks, cached UI, external audit links and hand-typed legacy URLs can no longer return 404.
- `vercel.json` parses cleanly; regression asserts both current UI destinations and the permanent compatibility redirect. Full suite: **55 suites / 12,295 checks green**.
- RC footer, About approvals panel and recompressed/dynamic WebPs were already completed in Batch 49n. Ministry approval number remains intentionally absent until the owner supplies the official document.

## Batch 51 (site-wide resilient-navigation audit, 29 Sept 2026 — preview)
- Every standard public header now contains seven real static links in this order: **Home / About / Admissions / Academics / Fees / News & Events / Contact**. The 44px search link is also present in HTML and opens `search.html` without JavaScript; `site.js` progressively enhances that same control into the overlay rather than replacing or duplicating it.
- All 37 root pages with `#siteFooter` now ship substantive static footer navigation, verified contact details, Privacy/Safeguarding links, and **Treasure Academy Ageva Limited · RC 9634403**. JavaScript enhances this to the richer footer while retaining Quick Links. Birthdays is included so every intended root public page is reachable from the homepage in no more than three static-link clicks.
- Added the approved information-architecture cross-links: Admissions → Fees/Uniform/Transport; Academics → Exams/Homework/E-Learning; About → Careers/Volunteer/Board/Anthem/Support; News → Calendar/event pages/Poster/Birthdays. `poster.html` is no longer orphaned.
- The paid public `admission-form.html` is now indexable and included in `sitemap.xml`; receipt/search/story/developer/404 remain outside the sitemap as appropriate.
- Fees has a visible no-JS fallback that directs parents to the private portal or official invoice for approved bank details, or to the physical school-office POS. WhatsApp remains ordinary contact only and is not payment evidence. No bank name, holder or number was invented.
- Corrected headings on Academics, E-Learning, Welcome, Anthem and portal login. Login now has exactly one H1 (`School Portal — Login`), New Registration is H2, checks use the SVG system, and the username/password fields support password managers.
- Migrated the targeted static inline styling into reusable `.u51-*` classes and normalized those rules to existing design tokens; genuine content emoji on the audited pages were removed/replaced with sprite icons. Dynamic width/height and state styles were kept where they are data-driven.
- Reveal animation now follows progressive enhancement: content is visible by default when JavaScript is disabled; the synchronous theme bootstrap adds `.js` before CSS paints so enhanced reveal motion still works when scripts run.
- Rebuilt `assets/data/kb.json` (**98 documents**), bumped local assets to `20260929-ui51` and the service worker to `treasure-v72`, and added `verify-batch51.js`.
- Verification: **57 suites / 12,670 checks green**, plus **34 light/no-JS responsive browser checks** and **10 dark-mode/keyboard browser checks**, all passing. Desktop, tablet and 390px mobile layouts were exercised. This work remains on `preview`; do not merge to `main` without explicit owner authorization.

## Experimental corpus review gateway (1 Oct 2026 — released with owner authorisation)
- Added hidden/noindex `developer-review.html`, linked from the authenticated developer console but also usable by a candidate reviewer through its direct URL and a separate shared review passphrase.
- The public repository contains only an AES-256-GCM authenticated ciphertext package. PBKDF2-HMAC-SHA-256 uses a random salt and 310,000 iterations. The passphrase is environment-only at build time and must never be committed.
- After browser-only decryption, a reviewer can read the complete extracted candidate or original pilot text on content-bearing tracks, record only an allowed decision for the required role and exact item hash, and keep drafts in browser `localStorage`. Reloading requires the passphrase again.
- JSON download, copy, device-share and strict import are available. Exports remain `trainingApprovalGranted:false`; no human decisions or training approvals were imported by this deployment.
- Controlled workloads remain exactly 54 candidate-licence, 50 candidate-teacher, 50 candidate-safeguarding, 96 pilot-teacher, 96 pilot-safeguarding and 4 conditional-rights legal records. The default track is the content-bearing 96-item pilot-teacher track.
- `robots.txt`, page metadata, Vercel `X-Robots-Tag`/`no-store` rules and service-worker exclusions keep the gateway unlisted and out of offline caches. The route remains absent from `sitemap.xml`.
- Owner authorisation and its explicit exclusions are recorded in `model/reports/review-gateway-authorisation.json`. Public plaintext, training and experimental-model connection remain unauthorised.
- The owner subsequently gave an explicit instruction to publish the gateway on `main`; production commit `742780c` completed that release without merging the wider experimental model branch.
- Verification: gateway regression **6/6 passed with live decryption**, all model tests **67 passed / 1 skipped**, and repository JavaScript tests passed after bringing the new private page into the SEO contract.

## Custom-domain migration (20 Oct 2026 — production)
- Owner registered `treasureacademyageva.com` through Northwest Registered Agent. DNS remains safely hosted on Northwest/Business Identity nameservers; existing MX, SPF, DKIM, DMARC and other TXT records were preserved.
- Vercel project `treasureacademyageva` now has both `treasureacademyageva.com` and `www.treasureacademyageva.com`, with valid HTTPS. The intended canonical host is `https://www.treasureacademyageva.com`; the original `treasureacademyageva.vercel.app` alias remains attached.
- `tools/set-site-host.py https://www.treasureacademyageva.com` rewrote 270 canonical/OG/Twitter/JSON-LD/robots/sitemap/documentation references across 44 files. `sitemap.xml` was regenerated with 36 URLs.
- `vercel.json` now contains a hostname-conditioned permanent redirect so every apex-domain path maps to the matching `www` path with HTTP 308. The temporary Vercel domain-level 307 must be removed after deployment by assigning the apex directly to the project; the repository rule then provides the permanent redirect.

## Brand, journey and accessibility release candidate (22 Oct 2026 — owner authorised, secure push pending)
- Added a noindex Developer Experience Studio for brand evidence, page/accessibility findings, privacy-safe journey imports, personas, empathy/day-in-life/current/future journey maps, service blueprints, Search/health labs and no-code agent exports.
- Added fail-closed owner asset validation. The restored mark reading “Treasure Kiddies” is withheld from public pages; a neutral text mark remains until an approved Treasure Academy master is supplied. Unverified photos are not promoted as current homepage imagery, and unverified social profiles are omitted from structured data.
- Added session-only `TAUX2` navigation, CTA, form-start, website-step-completion and abandonment categories without raw searches, identities or form values; `TAUX1` decoding remains supported.
- Added accessible form errors, skip-link focus, dark/forced-colour improvements and keyboard-focusable scroll regions. No legal compliance certification is claimed.
- Evidence: production audit 16/16; Visitor UX 45/45; browser QA 1,424/1,424; automated accessibility 58/58 light pages and 4/4 representative dark pages with no serious/critical findings. Experience audit covers 56 pages; 55/56 are within two actions and only the intentional 404 is unreachable.
- Full review: `docs/BRAND-JOURNEY-ACCESSIBILITY-REVIEW-2026-10-22.md`. Owner evidence checklist: `docs/OWNER-BRAND-EVIDENCE-CHECKLIST-2026-10-22.md`.
- The owner explicitly asked to push and make this release live. A personal access token was pasted into chat and is compromised; it must be revoked and must not be used. Deployment remains pending a secure GitHub connection or a fresh credential entered outside chat.

## Protected-console and admission-tracking release (24 Oct 2026 — schema installed, code deployment pending)

- `developer.html` is now the intended authenticated, capability-scoped operations console. `developer-operations.html` is a compatibility redirect. `developer-review.html` remains a separate AES-encrypted/passphrase boundary; there is no password bypass.
- Migration `202610240001_admission_tracking_developer_operations_and_answers.sql` adds explicit developer capabilities, the encrypted manual OTP queue, code-free audit events, opaque post-login continuations, parent-safe active-application projection and the extended verified-public-information registry.
- Admission tracking uses the registered phone only. A requester chooses WhatsApp or SMS and confirms WhatsApp availability when relevant. The server keeps one five-minute code per phone/purpose, invalidates earlier codes, rate-limits requests and attempts, and encrypts the delivery payload. An authorised dispatcher may reveal it once; that server payload is destroyed in the reveal transaction. The console clears its page copy rapidly and provides a user-gesture clipboard overwrite.
- Lightweight tracking returns only unlinked new-pupil applications. It never joins pupil/guardian/result/fee data. Converted applications receive opaque short-lived tokens kept in browser session storage, never a URL. The particular admitted applicant and private next step appear only after the same parent completes full phone/password portal sign-in.
- Public Search now uses `verified-answer-engine.js`: owner-confirmed answer first, related page matches second, and a structured “Ask the school to add or update it” request when confidence is low. `chat-core.js` gives the same verified facts precedence while the legacy corpus remains under review.
- New gates are fail-closed: `ADMISSION_TRACKING_ENABLED` and `DEVELOPER_CONSOLE_ENABLED`. New secrets are server-only: `ADMISSION_OTP_HASH_PEPPER` and `ADMISSION_OTP_ENCRYPTION_KEY`, each at least 32 random characters. This workflow has no SNS or AWS dependency.
- Owner/DB operator must explicitly provision each row in `developer_capabilities`; administrator role alone is insufficient. The schema is installed, but no account, capability or runtime gate has been activated.
- Final local re-audit evidence is recorded in `docs/LOCAL-RELEASE-VERIFICATION-2026-10-24.md`; completed production SQL evidence is in `supabase/release/20261024_PRODUCTION_SQL_EXECUTION_EVIDENCE.md`. The staging handoff remains a future reusable template and is not the governing record for this completed production migration.
