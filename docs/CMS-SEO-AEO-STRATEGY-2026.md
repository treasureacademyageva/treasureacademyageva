# Public Website CMS, SEO and Answer-Engine Strategy

> **Superseded historical proposal — do not implement.** The owner-approved authority is
> [`TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md`](TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md).
> Treasure Academy will use its first-party Supabase/Vercel CMS and will not integrate WordPress.
> This file is retained only to preserve the decision history.

**Site:** Treasure Academy, Ageva
**Primary URL:** https://www.treasureacademyageva.com
**Prepared:** 21 October 2026
**Status:** superseded on 25 October 2026; never authorised for implementation; retained as historical evidence only

## 1. Decision

Use a **managed, conventional WordPress installation with the block editor** for public website content when the owner is ready to move beyond the current static deployment. Do not begin with a headless WordPress build.

Why:

- the owner needs the simplest possible editing workflow;
- a conventional managed WordPress service owns patching, backups and a visual editor;
- a headless CMS would keep two deployments, preview integration, API authentication and cache invalidation in the maintenance burden;
- the current static site can remain the safe production site while WordPress is built and reviewed on a password-protected staging host.

WordPress is for **public brochure content only**. It must not become the pupil-record system, result portal, payment ledger, medical-record store or safeguarding case system. Those functions require a separately specified authenticated school information system.

## 2. Non-negotiable data boundary

### Allowed in the public CMS

- approved school identity and contact information;
- class guides without identifiable pupil records;
- reviewed news and event information;
- current fees, uniform and transport guidance supplied by the owner;
- safeguarding and privacy policies;
- approved staff profiles;
- consent-cleared public media with provenance and review dates.

### Prohibited in the public CMS

- pupil or guardian passwords;
- individual results, candidate numbers, dates of birth or medical information;
- bank credentials, API secrets or unverified payment-account details;
- private safeguarding reports;
- unapproved testimonials;
- child photographs without documented authority;
- browser-generated receipts or claims that a submission reached the school.

## 3. Content model

The machine-readable version is `cms/wordpress-migration/content-model.json`.

1. **Core Page** — Home, About, Academics, Admissions, Contact, Privacy and Safeguarding.
2. **Class Guide** — one page for each class; learning focus, parent questions and reviewed date.
3. **Published Update** — news or a confirmed announcement; publication and expiry dates.
4. **Confirmed Event** — only after the owner provides start/end dates, location and organiser; automatically archives after the end date.
5. **Office Guidance** — fees, uniform, transport, calendar and PTA; requires a reviewed date and named source record.
6. **Staff Profile** — only owner-supplied public fields; no private phone number, home address or date of birth.
7. **Policy** — privacy and safeguarding, with owner, effective date and review date.
8. **Media Record** — file, source/owner, consent or authority record, permitted placement, expiry/review date and alt text.

## 4. Editorial workflow

`Draft → factual review → safeguarding/privacy review when required → owner approval → publish → scheduled review → archive`

Every operational item must have:

- source: owner or authorised office record;
- content owner;
- last reviewed date;
- next review or expiry date;
- public/private classification;
- media provenance and authority when media is present.

Expired events must leave navigation automatically. Old URLs should remain available as clearly archived pages or redirect to the current parent page, not silently show an expired form.

## 5. Roles and least privilege

- **Administrator:** one owner-controlled emergency account plus one managed-host support account only when contractually required.
- **School Editor:** edits ordinary pages and drafts updates; cannot install plugins/themes or manage users.
- **Publisher/Reviewer:** reviews and publishes public content; cannot change platform configuration.
- **Safeguarding Reviewer:** reviews child-related media and safeguarding wording; no general administrator capability.
- **Developer integration user:** separate, limited, revocable Application Password only if an approved integration is later required.

WordPress documents that roles/capabilities are its permission layer, and its REST guidance requires explicit permission callbacks for private endpoints. A nonce is CSRF protection, not authorisation. See:

- https://developer.wordpress.org/apis/security/user-roles-and-capabilities/
- https://developer.wordpress.org/rest-api/extending-the-rest-api/routes-and-endpoints/
- https://developer.wordpress.org/news/2023/08/understand-and-use-wordpress-nonces-properly/

## 6. WordPress security baseline

- managed hosting with current supported PHP and WordPress;
- HTTPS only; HSTS at the edge after verification;
- automatic core security updates and a tested monthly maintenance window;
- daily database backups, weekly full backups and a quarterly restore test;
- multifactor authentication for administrators and publishers;
- no shared accounts; immediate offboarding;
- minimum plugins, all from maintained reputable sources;
- disable theme/plugin editing in the dashboard;
- least-privilege filesystem permissions;
- rate-limited login and monitored administrator changes;
- validation, sanitisation and context-aware escaping for every custom field;
- no unauthenticated private REST routes;
- secrets in host environment configuration, never page content or Git;
- staging before production changes.

Official WordPress guidance says not to trust input, to validate/sanitise it and escape output, and to use the platform APIs: https://developer.wordpress.org/apis/security/. Hardening guidance: https://developer.wordpress.org/advanced-administration/security/hardening/.

## 7. Forms and records

For the first CMS release:

- keep admissions, payment verification, careers, support and sensitive feedback as verified office contact actions;
- if a server form is later added, provide a receipt only after a successful server response;
- validate on both client and server;
- use idempotency for payment or application creation;
- send no child, health, payment-reference or safeguarding data to analytics;
- define retention, deletion, access and incident procedures before collection begins.

W3C form guidance requires explicit labels and accessible instructions, warns that placeholders are not labels, and says client-side validation is not a security boundary:

- https://www.w3.org/WAI/tutorials/forms/labels/
- https://www.w3.org/WAI/tutorials/forms/instructions/
- https://www.w3.org/WAI/tutorials/forms/validation/

## 8. SEO implementation

The current static implementation now provides:

- one canonical `www` host;
- unique titles, descriptions, canonicals and social metadata;
- crawlable class pages and a crawlable published news article;
- Organization/School and WebSite data on the home page;
- breadcrumbs on indexable child pages;
- NewsArticle data for the published admissions update;
- an XML sitemap containing indexable, useful pages only;
- `noindex` on utilities, retired campaigns, search, dynamic legacy routes and private developer routes;
- truthful copy instead of review, result, fee, event or portal claims that are not backed by a shared service.

Do not add structured data for information that is absent from the visible page. Google expressly prohibits misleading structured data and fake reviews: https://developers.google.com/search/docs/appearance/structured-data/sd-policies.

Do not use self-serving review markup. Google states that an organisation controlling reviews about itself is ineligible for review-star treatment: https://developers.google.com/search/docs/appearance/structured-data/review-snippet.

## 9. Answer Engine Optimisation (AEO)

Treat AEO as accurate, well-organised SEO—not as a separate set of hacks.

- put the direct answer near the question;
- use clear headings, short answer paragraphs and descriptive links;
- publish unique school facts only after owner verification;
- keep dates, fees, events and contacts current;
- keep facts as text, not only in graphics;
- use semantic HTML and an accessible DOM;
- create leaf pages for classes and actual news;
- maintain stable canonicals and reduce duplicate/generic query pages;
- use structured data only where it accurately describes visible content.

Google's July 2026 guidance says ordinary SEO remains the foundation for generative AI search, recommends unique people-first content and clear technical structure, and says there is no need for `llms.txt`, special AI markup, artificial “chunking” or content rewritten only for AI systems: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide.

## 10. Search and local visibility owner actions

These require account ownership and cannot be completed in code:

1. verify the `www` property in Google Search Console;
2. submit `https://www.treasureacademyageva.com/sitemap.xml`;
3. inspect the home page, each class page and the admissions article;
4. create or verify the school's Google Business Profile;
5. provide an exact school map pin/coordinates;
6. confirm any official social profile before adding `sameAs`;
7. provision and test a domain mailbox before publishing it;
8. monitor Search Console indexing and the Generative AI performance report.

Google recommends Search Console for technical diagnosis and Business Profile for local details: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide.

## 11. Migration phases

### Phase A — current production

- keep the hardened static website on Vercel;
- use verified WhatsApp/Call for operations;
- use the content checklist below;
- do not reactivate the retired portal.

### Phase B — managed WordPress staging

- create a password-protected staging site;
- build a lightweight block theme matching the current day/dark tokens;
- install the reviewed `treasure-academy-core` starter plugin from this repository;
- create content types and roles;
- migrate only reviewed public content;
- add automatic expiry/review fields;
- run accessibility, SEO, security and content review.

### Phase C — controlled cutover

- take and test backups;
- freeze static content briefly;
- crawl staging and compare URL-by-URL;
- preserve current canonical URLs or add one-hop 301/308 redirects;
- update only website DNS records; preserve nameservers and mail records;
- monitor 404s, uptime, Search Console and form delivery;
- retain a rollback path to the static deployment.

## 12. Start-of-term content checklist

- [ ] Admission availability and process confirmed by owner.
- [ ] Fee schedule and bank-confirmation wording reviewed.
- [ ] Calendar and examination dates confirmed.
- [ ] Uniform and transport guidance reviewed.
- [ ] Staff profiles reviewed; leavers archived.
- [ ] Events have real dates and automatic expiry.
- [ ] News has a source and named approver.
- [ ] Media has provenance, authority, alt text and permitted placement.
- [ ] Privacy and safeguarding contacts tested.
- [ ] Sitemap and canonicals validated.
- [ ] Call, WhatsApp, email and directions tested.

## 13. Launch gate

Do not cut over to WordPress until all of these pass:

- no public demo credentials or pupil records;
- role/capability tests;
- server-side validation and output escaping tests;
- backup restore test;
- responsive keyboard and screen-reader review;
- link, sitemap, canonical and structured-data validation;
- performance budget;
- form delivery and duplicate-submission tests;
- owner sign-off on content, dates, contacts and media authority.
