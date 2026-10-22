# Content and Media Restoration Decision Register

**Created:** 22 October 2026
**Status:** Owner approved the release on 22 October 2026; unresolved provenance and publication-evidence items remain tracked for later confirmation
**Owner direction recorded:** Restore the previous website’s writing and media now; the owner will later identify anything that is not real or should change.

This register preserves that direction without pretending that unresolved provenance, publication authority or factual freshness has already been verified. The inventory contains 108 files: 80 restored/held source assets plus 28 locally generated responsive WebP derivatives. It records SHA-256 hashes, present references and item-level treatment in `docs/MEDIA-RESTORATION-INVENTORY-2026-10-22.csv`.

## Restored in the working branch

| Area | Restored | Current treatment | Decision still needed |
|---|---|---|---|
| Homepage | Campus hero, classroom image and four-image school-life gallery | Useful copy, truthful admission route and quick answers remain | Confirm each image is school-owned and permitted for homepage use |
| News | Existing 2024 Facebook excursion video and photo-post links | Links open Facebook; no video is copied or downloaded | Confirm the Facebook page/link is still school-controlled and should stay public |
| News history | 2017–2021 graduation write-ups | Separate archive pages; private marks, candidate numbers and record-sheet scans excluded | Confirm named former-pupil publication authority and final wording |
| News gallery | Campus, classroom, library, sports, culture, graduation and excursion media | Restored as a school-life gallery | Confirm source, authority, permitted placement and alt text for every item |
| Alumni | Graduation group image and links to restored history | No public results directory or candidate-number lookup | Confirm whether any individual alumni profiles should be published |
| Anthem page | Previous anthem, creed and pledge wording | Restored, clearly marked for owner review and kept `noindex` | Confirm final official wording and provide an approved audio file/link if one exists |
| Class pages | Creche, nursery and primary-stage illustrations | Restored to the ten crawlable class pages | Identify any illustration that is not real/approved and supply a replacement |
| Utility pages | Logo and relevant earlier banners on admissions, careers, calendar, homework, reading, uniform, transport, shop, PTA, support and campaign pages | Unsafe forms remain retired; useful copy is preserved or expanded | Confirm each campaign/banner image and any old operational wording |
| School shop | Earlier item-category images | Informational gallery only; no stock, price or order claim | Confirm current approved items, stock and prices before publishing a live catalogue |
| Careers | Earlier “why teach with us” and candidate-quality writing | No vacancy or application-delivery claim | Confirm current vacancies, requirements and approved application route |
| PTA | Earlier purpose and meeting explanation | No invented meeting date, levy or minutes | Supply current approved PTA details |
| Support | Earlier project categories | Labelled as previously listed; no donation/pledge receipt claim | Confirm which projects are currently approved priorities |
| Welcome pack | Six-step structure | Rewritten to use verified office support rather than insecure portal login | Confirm school-day, uniform and first-day details |
| Portal support | Previous portal illustration | Portal remains retired; page gives verified office contacts | Decide whether/when a managed authenticated portal will replace it |

## Inventory reconciliation

The regenerated inventory now classifies every file into one treatment: 57 restored to the public build, 28 generated responsive derivatives, 12 excluded private records, 5 excluded third-party marks, 5 retained but unreferenced files and 1 excluded known third-party placeholder. This removes the earlier ambiguity in which generated mobile variants could have been mistaken for separately restored source media.

## Existing media returned to deployment scope

The following families were removed from the blanket deployment exclusion after the owner’s restoration instruction:

- campus and school-community media (`hero-school`, `hero-kids`);
- classroom, library, sports, culture and graduation media;
- excursion photographs;
- homework, reading, lost-property, Open Day and Photo Day banners;
- uniform and school-shop images;
- creche, nursery and primary stage images;
- login/support artwork and the existing school flyer.

These files are restored, but their final provenance/authority fields are not fabricated. The build creates 28 smaller `-640.webp` or `-560.webp` derivatives from adjacent restored sources only to reduce mobile data use; those derivatives inherit the source asset’s unresolved owner-review status and are not new evidence of provenance. A managed CMS must eventually record source/owner, authority or consent reference, permitted placements, review date, expiry date where relevant and final alt text.

## Deliberately not republished

These remain out of the public website even after the restoration instruction because publishing them would expose private data, mislead families or republish a known third-party placeholder:

1. `assets/img/graduates/` — photographs of result sheets, candidate lists and pupil records.
2. Candidate numbers, subject marks and individual result tables.
3. Public browser accounts, passwords, PINs, sessions or demo pupil/parent records.
4. Browser-generated payment confirmations, receipts, admission submissions, bookings, orders or “message sent” claims.
5. Demo testimonials, donation amounts, votes and synthetic honours.
6. Unverified fee amounts, bank account details, routes, stock, prices, vacancies, term dates and exam timetables.
7. `assets/img/class-feature.jpg` — retained in the repository for owner comparison but excluded from deployment because it is a documented third-party placeholder from a news site; replace only with owner-provided media.
8. `assets/img/partners/` — third-party marks stay held until exact use/authority is confirmed.
9. Portal result, attendance, payment and staff-administration screens that had no secure shared backend.

## Decisions to request from the owner later

- Which restored images are real school media and which are generated, stock or placeholders?
- Which images show identifiable children, and where is the relevant publication authority recorded?
- Is the restored anthem/creed/pledge wording final and official?
- Should the named 2017 graduands remain public, and is publication authority recorded?
- Are the 2017–2021 ceremony dates and claims final as written?
- Is the linked Facebook account still controlled by the school?
- Which staff names, roles, qualifications and photographs are approved for a public staff page?
- Which fees, uniform rules, transport arrangements, PTA details, support projects and vacancies are current?
- Which third-party badges may be displayed, and what attribution/permission applies?

## Release gate

Before production deployment, review this register with the owner. Do not silently convert “restored for review” into “verified/consent-cleared.” Security and privacy exclusions above remain mandatory.
