# Visitor Experience, Information Architecture and Search Research

**Date:** 22 October 2026
**Scope:** Every public page family in the Treasure Academy website
**Status:** Owner approved and deployed to production on 22 October 2026

## Visitor problems this phase addresses

The site has many useful destinations, but a visitor should not have to understand the repository or the school’s internal structure to find them. The redesign was therefore tested against five questions:

1. Can a new visitor immediately identify the school, education stages and location?
2. Can a parent reach admissions, classes, fees, term dates, uniforms or contact help without hunting?
3. Does every secondary page explain where the visitor landed and what they can do next?
4. Do mobile visitors see useful actions without opening a hidden menu or scrolling through a long introduction?
5. Can the site help with ordinary-language or slightly misspelled questions without sending family queries to an external AI service?

## Research principles used

- Nielsen Norman Group’s homepage guidance supports making the organisation and purpose immediately understandable and making high-priority actions obvious.
- Nielsen Norman Group’s search and information-scent guidance supports a visible search field, familiar language and descriptive link labels rather than vague calls to action.
- W3C WCAG 2.2 guidance supports consistent navigation order, more than one way to find pages, visible focus, unobscured focus and usable target sizes.
- web.dev performance guidance supports making the main image discoverable and eager, reserving lazy loading for offscreen images, avoiding render-blocking font behavior and honoring reduced-motion preferences.
- School-sector navigation guidance from Finalsite, Interactive Schools and the MarCom Society supports organising around visitor tasks—prospective families, current families and school information—rather than internal departments alone.
- Google Search guidance supports logical information architecture, descriptive URLs, accurate visible-content structured data and ordinary people-first SEO as the basis for search and generative discovery.

The implementation does not claim that a third party endorsed this particular site. These sources informed the design decisions described below.

## Implemented information architecture

### Global primary navigation

The stable desktop order is:

1. Home
2. About
3. Admissions
4. Classes
5. Fees
6. News
7. Contact

Search, visitor exploration, theme and admission actions are adjacent utilities rather than additional competing sections. Generated and lightweight pages use the same core labels and order.

### Five-action mobile dock

Every public page uses the same thumb-reachable order:

1. Home
2. Admissions
3. Explore
4. Search
5. Contact

This avoids a hidden hamburger as the only wayfinding mechanism and prevents visitors from relearning controls from page to page.

### Visitor-oriented explore map

`explore.html` groups destinations by intent:

- **I am choosing a school:** classes, admissions, fees, visits, story and safeguarding.
- **I am a current family:** term information, homework, uniforms, transport, payments and support.
- **I am looking for school information:** news, history, jobs, policies and community routes.

The same page provides direct contact and a visible search field.

### Sitemap and destination model

The maintained sitemap now covers 30 indexable URLs. Smart Search covers 53 public destinations, including useful `noindex` help pages that should remain reachable to humans without being presented as search-engine landing pages. Private developer/review pages and private records are excluded from the public shell and search index.

## Implemented page wireframes

### Homepage

1. School identity, stages and location
2. Admissions status
3. Clear value statement
4. Apply and visit actions
5. Visible search field and common queries
6. Compact identity facts
7. Five high-priority task cards
8. Admissions route
9. Programmes and school-life evidence
10. Purpose, history, verified updates and final contact

This sequence answers “Am I in the right place?” and “Can I find what I need?” before the longer storytelling sections.

### Secondary page

1. Consistent header
2. Page-specific hero with visible H1 and short context
3. Breadcrumb/route bar
4. One primary and one secondary action near the start
5. Page content
6. Consistent universal footer
7. Mobile dock

### Class and news detail page

1. Consistent header
2. Page/category identity
3. Visible H1
4. Back-to-parent route and relevant contact action
5. Media and reviewed detail
6. Related route, universal footer and mobile dock

### Search page

1. Clear statement that search runs locally in the browser
2. Ordinary-language query field
3. Common-query shortcuts
4. Safe direct answer when verified site information supports one
5. Ranked page results with context, path and topic
6. No conversational surveillance, external model call or invented answer

## Search behavior and safety

The private Smart Search is deterministic local JavaScript rather than a generative model. It:

- normalises questions and strips common question filler;
- uses title, description, section, keywords, visitor intent and route tokens;
- expands reviewed synonyms such as cost/fees, dress/uniform and location/directions;
- tolerates one-edit spelling errors and two edits on longer words;
- provides reviewed direct answers for fees, location, WhatsApp, term dates, admissions, school levels, transport, uniform and the retired portal;
- keeps typed queries on the device;
- does not index private data or send a child/family question to a third party;
- never fabricates fee amounts, dates, routes, account details or portal access.

This provides useful AI-like retrieval behavior without misrepresenting the site as a chatbot or introducing avoidable privacy and latency risks.

## Visual and interaction system

- One consolidated public stylesheet replaces five separate public style requests.
- Green, gold, slate and warm-neutral tokens support light and dark presentation.
- Headings, cards, route bars, buttons, forms, search results and footer sections use repeatable shapes, spacing and states.
- Focus indicators are explicit and sticky elements provide focus-safe spacing.
- Buttons and dock items meet practical touch-target dimensions.
- Motion is limited to short entrance and hover feedback; content is never hidden pending JavaScript or scrolling.
- `prefers-reduced-motion` removes nonessential animation.
- The mobile homepage hides two duplicate gallery tiles while retaining a route to the full gallery, reducing vertical length without removing the content.

## Performance approach

- Public pages request one bundled stylesheet, approximately 44 KB gzip.
- The shared public shell is approximately 2.3 KB gzip.
- Homepage above-the-fold local CSS, shell, store helper and responsive hero are approximately 100 KB compressed in total before protocol overhead; fonts are local and optional rather than text-blocking.
- The homepage hero is eager and high priority; offscreen media is lazy.
- Twenty-eight smaller WebP derivatives are generated from restored local sources and selected with responsive `srcset` markup.
- Load-blocking page overlays, scroll-dependent content reveal and the large legacy public script were removed.
- The service worker cache is versioned `20261022-ux1` and retains private/review exclusions.

These are transfer-size and implementation checks, not a substitute for post-deployment Core Web Vitals field data.

## Validation completed

- Rebuilt 24 utility pages, 10 class pages, 5 history pages, SEO metadata, search data, the shared stylesheet, responsive media and the restoration inventory.
- Static production audit: 62 HTML files, 30 sitemap URLs and 36 unique canonicals passed.
- Visitor-UX assertions: 21/21 passed.
- Real Chromium checks: 1,384/1,384 passed across 55 public pages at 320×700, 390×844 and 1365×768, including rendering, visible H1, horizontal fit, compact mobile header, early task access, dock behavior, local-resource failures and runtime errors.
- Browser interactions verified misspelled uniform retrieval and the safe direct fee answer.
- Selected pages were also checked with dark device preference.
- Local HTTP crawl: all 62 repository HTML files and 156 referenced local page/asset URLs returned below 400.
- Runtime and development dependency audit: zero known vulnerabilities after updating the affected transitive development package.

## Owner review still required

Code cannot determine whether restored photos have publication authority or whether operational details are current. Before deployment, the owner should review:

- restored image ownership and child-photo authority;
- named graduation-history publication authority;
- official anthem, creed and pledge wording;
- current fees, dates, uniform rules, transport arrangements, PTA details, vacancies, shop information and support projects;
- exact map pin and controlled social/business profiles;
- any desired wording changes in high-priority visitor routes.

The working branch deliberately keeps these decisions visible rather than converting unverified content into a claim.

## Sources consulted

- Google Search Central, SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Search Central, AI features and website guidance: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google Search Central, structured data introduction: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- W3C WAI, Form labels, instructions and validation: https://www.w3.org/WAI/tutorials/forms/
- W3C WCAG 2.2, Consistent Navigation: https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html
- W3C WCAG 2.2, Multiple Ways: https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html
- W3C WCAG 2.2, Focus Appearance, Focus Not Obscured and Target Size: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- web.dev, Website navigation: https://web.dev/articles/website-navigation
- web.dev, Motion and accessibility: https://web.dev/learn/accessibility/motion
- web.dev, Optimize Largest Contentful Paint: https://web.dev/articles/optimize-lcp
- web.dev, Browser-level image lazy loading: https://web.dev/articles/browser-level-image-lazy-loading
- Nielsen Norman Group, Homepage Design Principles: https://www.nngroup.com/articles/homepage-design-principles/
- Nielsen Norman Group, Search: Visible and Simple: https://www.nngroup.com/articles/search-visible-and-simple/
- Nielsen Norman Group, Information Scent: https://www.nngroup.com/articles/information-scent/
- Finalsite, School Website Navigation Strategies: https://www.finalsite.com/blog/p/~board/b/post/school-website-navigation-strategies
- Interactive Schools, Simplify Your School Website: https://www.interactiveschools.com/blog/simplify-your-school-website-essential-tips-for-better-parent-navigation
- MarCom Society, Website User Experience Best Practices: https://blog.marcomsociety.org/website-user-experience-best-practices/
