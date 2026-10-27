# Run 9 — Public Engagement and Shared Placements Acceptance Evidence

**Date:** 27 October 2026
**Authority:** owner-approved dynamic-platform master plan
**Boundary accepted:** repository and disposable local PostgreSQL/browser environment only
**Production source:** unchanged Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`

## 1. Outcome

Run 9 is complete at its local boundary. It adds privacy-safe aggregate views, signed-in removable likes, independently gated premoderated comments, leadership moderation, public role-safe labels and audited CMS homepage placements.

Nothing was activated. No Production SQL, source deployment, content import, comment, like, placement, view aggregate, Auth mutation or Cloudinary request occurred. All new behavior requires the existing exact master public gate and its own exact subordinate gate.

## 2. Pre-Run-9 cross-run audit

The authorised audit covered the accepted Runs 1–8 source, migrations, routes, gate hierarchy, Function budget, portal session behavior and regression surface.

Results:

- dependency audit: zero high-or-greater production dependency vulnerabilities;
- Vercel inventory before Run 9: 12/12 Functions, 42 rewrites, eight redirects and no duplicate rewrite source;
- no unresolved application `TODO`, `FIXME` or `HACK` marker;
- engagement base tables remained RLS-enabled with no anonymous/authenticated policy or grant;
- homepage News still used the reviewed coded fallback while the fixed published-slot projection remained dormant;
- public engagement could reuse browser-session-only portal authentication without persistent public-page credentials;
- the twelfth Function had to be consolidated rather than adding a thirteenth.

An initial visual inspection of `safeJson()` misread source escaping and suspected ordinary `u`/digit corruption. Byte inspection proved the regex already contains one Unicode regex escape while the replacement strings correctly contain two source escapes. A new regression now parses every JSON-LD block and covers ordinary lowercase `u`, digits `2/0/8/9`, `<>&`, script-closing input and actual U+2028/U+2029 separators. The suspected source defect was a false positive; the missing full-parse test coverage was real and is closed.

During the first uncommitted Run 9 SQL reconstruction, an existing Run 6 test detected that the replaced capability helper had omitted leadership `safeguarding_review`. It was restored before commit or provider action. The complete reconstructed suite then passed.

## 3. Additive database boundary

Migration:

```text
supabase/migrations/20261027090000_public_engagement_and_placements.sql
```

It is additive and data-neutral. It adds:

- `reported`, `hidden` and `deleted_by_author` comment lifecycle states;
- daily privacy-safe receipt records keyed by content, Lagos date and 64-hex HMAC;
- one signed-in report per account/comment;
- immutable homepage placement events;
- fixed aggregate and approved-comment public projections;
- server-only view recording;
- active-account like add/remove;
- active parent/staff comment submit/edit/delete/report;
- leadership moderation queue and state transition RPC;
- publisher-only site-slot control.

No anonymous or ordinary authenticated account receives direct access to viewer receipts, reaction actors, comment actors, report actors or moderation fields. Public comments expose only body, timestamps and `Verified Parent`/`School Staff`.

## 4. Privacy-safe views

A count can be requested only after the document has remained visible for four seconds. The server rejects known bots, headless/crawler user agents, prefetch and prerender purposes. It resolves the current published entry rather than trusting a browser-supplied count.

The server derives:

```text
HMAC(daily HMAC key, published entry ID + source network address)
```

The database stores only the 64-hex receipt, entry and Lagos day. It never stores full IP address or user agent. The entry/day/hash primary key makes refreshes idempotent. Accepted writes increment only a daily aggregate. Receipts older than 31 days are removed during accepted writes; aggregate counts remain.

## 5. Likes

- active parent/staff account required;
- server revalidates the bearer session and active profile;
- database revalidates active state and role;
- unique account/content/reaction constraint;
- idempotent add and explicit removal;
- public output contains aggregate count only;
- no reacting-account list is public or returned by the endpoint.

## 6. Comments and moderation

`PUBLIC_CMS_COMMENTS_ENABLED` is exact-true and subordinate to both `PUBLIC_CMS_ENABLED` and `PUBLIC_CMS_ENGAGEMENT_ENABLED`.

Controls accepted:

- no anonymous submission;
- active authorised parent/staff only;
- every submission starts `pending`;
- plain text, bounded length and private-field/link/markup checks;
- maximum five submissions per hour and three pending comments per actor;
- author edit returns an approved/rejected/reported/hidden comment to `pending`;
- author deletion records `deleted_by_author` without hard-deleting history;
- only accepted leadership can approve, reject, hide or return to review;
- every moderation decision requires a bounded immutable reason;
- two different signed-in reports move an approved comment out of public output to `reported` pending leadership review;
- reporter/actor identity is not public;
- public role labels are limited to `Verified Parent` and `School Staff`;
- no pupil names, phone numbers, payment evidence, credentials, medical records or safeguarding incident details are accepted as obvious public-comment content.

The protected CMS includes the leadership queue, report reasons, state controls and immutable audit history.

## 7. Homepage placements

Publishers can assign only current public content to:

- `home.alert` position 0;
- `home.news` positions 0–2;
- `home.event` positions 0–2.

Content type, effective/expiry ordering, current publication and recorded reason are database-enforced. Slot changes never publish content and popularity never chooses a slot. Every set/deactivation event is immutable.

The homepage keeps its reviewed coded fallback while the gate is false. When the exact gate is true, a successful fixed-projection response replaces that fallback using DOM text nodes only. A gated empty or failed response displays a truthful unavailable/empty state and does not silently reuse coded facts as CMS authority.

## 8. Public UI and accessibility

News/Event detail pages can server-render:

- aggregate views, likes and approved-comment counts;
- approved privacy-safe comments;
- disabled anonymous like control plus portal sign-in guidance;
- signed-in like removal;
- pending comment form;
- own-comment status/edit/delete;
- private concern report form.

The panel explains that popularity cannot affect admission, payment, results, progression, access or publication. Day/dark, mobile, forced-colour, keyboard labels/status and severe axe checks passed. Untrusted comment/placement data uses escaped server text or DOM `textContent`; it never enters an HTML sink.

## 9. Routing and Function ceiling

The existing dispatcher now separates renderer requests from `action=engagement` and `action=placements`. Public rewrites are:

```text
/api/public/content/engagement -> /api/public-content?action=engagement
/api/public/content/placements -> /api/public-content?action=placements
```

The local Function count remains exactly 12/12.

## 10. Acceptance results

### Focused Node/API

```text
npm run test:public-content
17/17 passed
```

Coverage includes exact-false gates, Function count, privacy-safe output, HMAC receipt stability, refresh deduplication, bot/prefetch rejection, same-origin JSON, active authentication, pending-first comments, fixed placements, SSR escaping and full JSON-LD parsing.

### Disposable PostgreSQL 17

```text
bash tools/test-sql-migrations.sh
15/15 ordered migrations
9/9 rollback-safe policy suites
read-only postflight passed
```

The Run 9 suite proves RLS/privileges, server-only receipts, receipt retention, like uniqueness/removal, inactive-account denial, pending-first comments, private-field rejection, leadership-only moderation, edit-to-review, report deduplication/threshold, public-label privacy, immutable audits and publisher-only placements.

### Browser/accessibility

```text
node tools/tests/run9-public-engagement-browser.e2e.js
passed
```

It proves delayed visible view recording, authoritative count refresh, anonymous control state, comment-XSS inertness, browser JSON-LD parsing, mobile overflow, dark theme and zero serious/critical axe findings.

### Static/build checks

- CMS, portal and public-engagement bundles rebuilt from tracked source;
- JavaScript syntax checks passed;
- `vercel.json` and `package.json` parse;
- `git diff --check` passed;
- `bash tools/run-current-tests.sh` passed: production audit 16/16, visitor UX 45/45, answers 10/10, portal security 87/87, developer bootstrap 12/12, combined Run 4–7 TAP 34/34, focused Run 8–9 17/17, chatbot 11/11, current-answer coverage 20/20, visitor browser 1447/1447, accessibility 59 light + 5 dark and every secure/operations/portal/CMS/public-content/public-engagement/header browser suite.

## 11. Production and provider state

Provider-safe state:

- Vercel Production now has encrypted exact-`false` values for `PUBLIC_CMS_ENGAGEMENT_ENABLED`, `PUBLIC_CMS_COMMENTS_ENABLED` and `PUBLIC_CMS_PLACEMENTS_ENABLED`;
- creating those inactive values caused no deployment and enabled no behavior;
- no push or deployment;
- no Production SQL;
- no engagement/content/placement row;
- no public CMS route/gate activation;
- no Cloudinary request/upload;
- no school account-claim or admission-tracking activation;
- no OTP/test message;
- Production source remains `a552618e40791a592cb9e586b2963d61ed46ad2c`.

## 12. Activation remains a separate decision

A future release must apply the accepted database/source boundary with every new gate false, prove active-account and moderation behavior in a protected acceptance window, confirm leadership coverage and only then request separate engagement/comment/placement activation decisions. Comments can be disabled independently without disabling read-only public content.
