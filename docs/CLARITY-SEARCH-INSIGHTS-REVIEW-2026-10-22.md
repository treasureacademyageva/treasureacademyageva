# Clarity, Search and Privacy-Safe Insights — Review Note

**Date:** 22 October 2026
**Branch:** `improve/clarity-search-insights-20261022`
**Base commit:** `71fabf986b2e879dff3c1e326aca27ae95116449`
**Release candidate:** `20261022-ux2`
**State:** Built and verified locally; not committed, pushed or deployed.

## Review summary

This round makes the public website easier to scan, improves local search beyond exact words and adds privacy-safe ways to diagnose website problems. It does not change the approved school facts, restore private records, reconnect the retired browser portal or add generative AI.

### Visitor-facing improvements

- Keeps identity and high-priority routes early on the homepage.
- Adds a capped, automatic “On this page” outline to longer pages.
- Improves heading, paragraph, list and form rhythm across the public shell.
- Keeps one predictable mobile action dock and shared navigation order.
- Adds a noindex Website Help page for voluntary problem reporting.
- Keeps homepage and Explore search words out of the URL.
- Explains clearly that search runs in the visitor’s browser.

### Meaning-aware local search

Search v2 applies, in order:

1. Unicode, punctuation, case and whitespace normalization.
2. Phrase normalization for reviewed school-specific expressions.
3. Conservative stemming and irregular word-family handling.
4. Reviewed meaning families such as enrolment/admissions, payments/fees, school dress/uniform, pick-up service/transport and former pupils/alumni.
5. Declared page intents, title and keyword matching.
6. Length-aware fuzzy matching as a fallback for likely spelling mistakes.
7. Safe direct answers for selected common questions.

It remains deterministic, on-device search. It is not described as AI and does not invent school facts.

### Privacy-safe insight model

The implementation deliberately separates three kinds of information:

- **Anonymous page/performance measurement:** first-party Vercel scripts only, disabled when Do Not Track or Global Privacy Control is active. Speed Insights is loaded from the documented first-party route. Web Analytics is probed and loaded only if the Vercel project starts serving it successfully.
- **Session diagnostics:** at most 16 coarse action categories in `sessionStorage`, with no persistent visitor ID, raw search text, typed form data, names, phone numbers, payment details, passwords or child records.
- **Voluntary reports:** the Website Help page creates a WhatsApp draft containing only broad selected categories, the current page path and an optional `TAUX1-` diagnostic code. It does not copy typed report details or raw search words. The visitor reviews the draft and taps Send; the website does not claim prior delivery.

The destination remains the verified WhatsApp number `09063932487` (`2349063932487`).

## Developer operations

`developer-operations.html` is a noindex, browser-local dashboard with:

- live checks for selected public routes;
- truthful status checks for Vercel Web Analytics and Speed Insights;
- a local search-relevance lab;
- broad search-family and result-count analysis without retaining raw words;
- generated page-level writing-quality metrics;
- decoding and browser-local aggregation of safe `TAUX1-` problem reports;
- CSV export containing only safe report fields;
- links to release and operational documents.

Current production service status remains:

- **Vercel Web Analytics:** not enabled; the endpoint returns 404. No pageview claim is made.
- **Vercel Speed Insights:** available on production.
- **Vercel custom analytics events:** not required and not used.

## Writing-quality build gate

`tools/build-content-quality-report.py` generates metrics only; it does not retain page paragraphs. The current result is:

| Check | Result |
|---|---:|
| Public shell pages checked | 56 |
| Total page words measured | 5,298 |
| Prose/list blocks over 65 words | 0 |
| Vague link labels | 0 |
| Pages with flagged clarity issues | 0 |

This is a mechanical clarity gate, not a substitute for owner review of facts.

## Build and verification results

| Verification | Result |
|---|---|
| Content build | 56 enhanced public pages; 54 search destinations; 30 sitemap URLs; 28 responsive image variants; 108 media decisions |
| Static production audit | PASS; 63 HTML files, 30 sitemap URLs, 37 unique canonicals |
| Production regression suite | 16 passed, 0 failed |
| Visitor UX/search/privacy suite | 35 passed, 0 failed |
| Browser visitor QA | 1,416 passed, 0 failed across 56 pages and three viewports |
| Encrypted review gateway | 5 passed, 0 failed, 1 secret-bearing test correctly skipped |
| Consolidated CSS | approximately 44.5 KB gzip; below the 50 KB limit |
| Whitespace validation | `git diff --check` passed |
| Visual review | Search, Website Help, Privacy and Developer Operations checked at mobile and desktop sizes; checkbox sizing corrected |

## Research applied

The implementation follows these external references reviewed for this round:

- Google Search Central SEO Starter Guide and AI features guidance: logical site structure, crawlability, people-first content and accurate visible facts remain the foundation.
- W3C WCAG 2.2 guidance: consistent navigation, multiple ways to locate pages, visible focus, unobscured focus and practical target sizes.
- web.dev: semantic navigation, reduced motion, discoverable LCP resources and careful native lazy loading.
- Nielsen Norman Group: immediate homepage identity, visible search, descriptive labels and mobile task priority.
- Vercel Analytics and Speed Insights documentation/privacy notices: first-party integration, anonymous aggregate measurements and avoidance of personal data in URLs or events.
- Typesense and reviewed fuzzy-search references: normalize consistently, rank exact matches before fuzzy fallback and combine fuzzy matching with a domain-specific synonym dictionary.

## Integrity and security retained

- No child, payment, pupil-result or private staff records were restored.
- No browser-only authentication was restored.
- The encrypted review package remains AES-256-GCM ciphertext with fail-closed review controls.
- No credentials or passphrases were added.
- Existing restoration and media provenance registers remain in force.
- The service worker does not cache private routes or `/_vercel/` insight requests.
- The prior production archive and rollback branch remain unchanged.

## Owner actions before production

1. Review Search, Website Help, Privacy and Developer Operations wording.
2. Confirm that the broad WhatsApp problem categories are appropriate.
3. Revoke the previously exposed temporary GitHub token; do not reuse it.
4. After approval, create and push a review commit on this branch for a separate Vercel preview.
5. Keep Web Analytics described as unavailable until the owner enables it in Vercel and a live check succeeds.
6. Promote only after protected-preview review and a final production crawl.

## Suggestions for the next round

- Add or adjust meaning families only from real visitor reports; do not guess school terminology at scale.
- Review the dashboard’s broad search-family counts monthly, then remove families that do not improve results.
- Assign one content owner to confirm time-sensitive admissions, dates, fees and contact instructions before each term.
- Recheck Core Web Vitals after enough real Speed Insights traffic exists; optimize measured routes rather than adding speculative code.
