# Maintenance notes

Read this before changing anything. It records the owner's rules, the parts of
the build that are easy to break by accident, and the things that have already
been broken more than once.

## Owner rules (do not override)

- **Real data only.** Never invent a pupil, staff member, date or result. If the
  information is missing, it waits for the owner.
- WhatsApp number is **09063932487**. Nothing else.
- No online assignment submission.
- Birthdays: staff and headmistress only.
- CBT exists only as Primary 6 Common Entrance practice.
- Professional look: **no pill navigation, no hamburger**. Desktop sidebars are
  fine.
- Day and dark token colours both supported.
- Payments are bank transfer to the school account. No card flow on the site.
- Keep the site simple. Remove files that are genuinely not needed — but check
  first, see "Before deleting anything".
- Offer suggestions each round; the owner approves or rejects each one.
- School identity (name, term, session, dates) is **code-managed** in
  `assets/js/store.js` (`SCHOOL_DEFAULTS`). It is deliberately not editable from
  the admin UI.

## Branches

All work lands on `preview`. `main` moves only when the owner says "go live".
As of this writing `main` is live and contains everything through the batch-48
merge.

## Setup

```bash
npm install                 # jsdom, needed by every test suite
python3 -m http.server 8080 # serve from the repo root
bash tools/run-all-tests.sh # 1417 checks across 43 suites
```

`node_modules/` is gitignored **and** stripped by workspace snapshots. If every
suite reports `CRASH`, that is the cause — run `npm install` and try again.

## Things that keep breaking

These have each regressed more than once. Check them after any pull or merge.

**1. Version pins in tests.** Assertions used to hardcode `treasure-v47`, so
every bump broke 19 suites at once. They are regex-based now
(`/treasure-v\d+/`). The only exceptions are the `no stale -NN versions`
guards, which must keep looking for their own specific old version — that is
the whole point of the check.

**2. Test walkers recursing into `tools/`.** The walkers scan the repo for old
version strings. If `tools` is not in the exclusion list they match the version
strings inside the test files themselves and fail. Exclusion list must be
`node_modules`, `.git`, `tools`.

**3. JSON-LD executed as JavaScript.** The harnesses collect `script:not([src])`
and eval the contents. A `<script type="application/ld+json">` block is data,
not code; if it is evaluated, every suite dies with
`renderEmergency is not a function`. Fix the harness selector — never delete
the structured data to make the error go away.

**4. `motion.css` getting unlinked.** It carries the skip link, focus-visible
rings and the `prefers-reduced-motion` collapse. Two separate rewrites have
dropped the `<link>` from every page. It must load **last**, after
`corporate.css`. Check with `grep -l motion.css *.html | wc -l` (expect 36;
`developer.html` is exempt).

**5. Image compression being undone.** `assets/img` belongs at roughly 8MB.
A rewrite restored 28 uncompressed originals and pushed it back to 37MB.
`seo.test.js` fails if the folder exceeds 12MB or any single file exceeds
1.2MB, so the suite will tell you.

**6. The public sidebar grid.** At `min-width:1100px` the body becomes a
`266px + 1fr` grid. Placement is written as a **default** — everything goes to
column 2 and `.navbar` is pulled back to column 1. Do not rewrite it as a list
of element types; that is what put the hero `<header>` and `.stats-band`
underneath the sidebar. The rail also needs `min-width:0; max-width:100%` and a
wrapping brand name, or the nowrap heading makes it 441px wide in a 266px track.

**7. `verify-batch4.js` hardcoding `/home/user/mums-school-website/`.** It has
come back twice. Paths derive from `SITE`.

**8. `sw.js` precaching fonts that no longer exist.** `addAll` rejects if any
entry 404s, so a font rename silently disables offline support. After changing
the type system, update the `CORE` list.

**9. Two SEO passes running at once.** Batches 43-48 added a second block
(`<!-- treasure-seo -->`) beside the generated `<!-- seo:start -->` one, so
every page carried two canonicals — and on the homepage they disagreed (`/`
versus `/index.html`). Duplicate canonicals let the crawler choose, which is
never what you want. `seo.test.js` now fails on any duplicate canonical,
`og:title` or `description`. If you hand-add a meta tag, check whether
`seo-build.py` already emits it.

**10. `seo-build.py`'s insertion anchor.** It used to look for `fonts.css` to
decide where to insert. Batch 48 retired that file, so the script silently
stopped writing tags to any page that lacked it — no error, just missing SEO.
It now falls back through any stylesheet, then `<title>`, then `</head>`. If
you restructure `<head>`, re-run the script and confirm `pages updated` is not
unexpectedly `0`.

**11. Duplicate `<h1>` from hidden views and print templates.** `developer.html`
had one in the login gate and another in the console header; only one view is
ever visible, but crawlers count both. `calendar.html` built an `<h1>` inside a
print-letterhead string. Use `.print-name` (styled in `motion.css`) or a `<p>`
for anything that is not the page's single real heading.

## Adding or renaming a page

```bash
python3 tools/seo-build.py
```

Idempotent. Writes description, canonical, Open Graph, Twitter and JSON-LD into
each page as static HTML (not injected by JS, so crawlers that skip scripts
still see it) and regenerates `sitemap.xml`.

Two different sets control this, and the distinction matters:

- **`NOINDEX`** — `receipt`, `admission-form`, `search`, `story`. Real pages
  that simply should not rank. They keep their canonical and social tags.
- **`PRIVATE`** — `developer.html`, `404.html`. Must not publish their own URL
  at all: no canonical, no `og:url`, no breadcrumb. `verify-batch26.js` asserts
  nothing anywhere links to the developer console, and a self-referencing
  canonical counts as a link.

Add new pages to whichever set applies. A page in either set still needs an
entry in `DESC` — `build()` skips anything without a description, and skipping
a page means it ships with **no robots tag at all**, which is the opposite of
what you wanted.

## Icons

`assets/img/icons.svg` is one sprite of 14 symbols on a 24x24 grid, filled with
`currentColor`. Use it like this:

```html
<svg class="ico" viewBox="0 0 24 24" width="22" height="22"
     fill="currentColor" aria-hidden="true" focusable="false">
  <use href="assets/img/icons.svg#ta-book"></use>
</svg>
```

Because the fill is `currentColor` the icon inherits the heading colour, so day
and dark themes both work with no extra rule. `.ico` is styled in `motion.css`.

Two things to know:

- A `<use>` pointing at a symbol that does not exist **fails silently** - no
  console error, the icon simply does not paint. `seo.test.js` checks every
  reference resolves against the sprite.
- Do not put emoji in headings. It is the fastest way to make a page look
  generated rather than designed, and it renders differently on every device.
  `seo.test.js` fails the build on emoji inside `<h1>`-`<h4>`.

Adding one: append a `<symbol id="ta-...">` to the sprite, keep it on the 24x24
grid, and render it at 40px before shipping - shapes that read fine at 200px
often turn to mush at icon size. Two of the originals had to be redrawn for
exactly that reason.

## Version bump ritual

Bump all four together or the service worker serves stale files:

1. `sw.js` — the `CACHE` constant (and its `CORE` precache list if fonts or
   core pages changed)
2. asset query strings — `?v=YYYYMMDD-NN` across all HTML, including `portal/`
3. `developer.html` — the `BUILD` string
4. `README.md` — two places
5. `docs/HANDOVER.md` — the "Current state" heading

One pass does the lot:

```bash
python3 - <<'EOF'
import glob
OLD, NEW = '48', '49'
for f in sorted(glob.glob('*.html')) + sorted(glob.glob('portal/*.html')) + ['sw.js']:
    s = open(f, encoding='utf-8').read()
    o = s
    s = s.replace(f'20260919-{OLD}', f'20260919-{NEW}').replace(f'treasure-v{OLD}', f'treasure-v{NEW}')
    if s != o:
        open(f, 'w', encoding='utf-8').write(s)
EOF
```

Then confirm nothing was missed:

```bash
grep -rl 'treasure-v48\|20260919-48' *.html portal/*.html sw.js
```

Current: **v50**.

## Data model

Keep these separate. They are not the same people and must never be merged.

- `db.teachers` — 7 demo login accounts, PIN 1234, portal only.
- `db.staffWall` — 10 real staff (W01–W10), display only, no accounts.
- `db.pupils` — demo accounts.
- `db.graduates` — 39 real Common Entrance graduates (2025: 21, exam numbers
  BS/OKN/141001–021; 2023: 18).
- `formerTeachers` — intentionally empty.

## Accreditation strip

Kogi State Government, Kogi MoEST, NAPPS, NYSC, Common Entrance. Centre code
**BS/OKN/141**. The badges link to the official sites.

## Before deleting anything

Check the file is referenced nowhere first:

```bash
grep -rlF "filename.ext" --include=*.html --include=*.css --include=*.js \
  --include=*.json . --exclude-dir=node_modules --exclude-dir=.git
```

For fonts, also confirm in a real browser which faces are actually downloaded —
a `@font-face` can exist for a family that no stack references. Every image in
`assets/img` is currently in use; there is nothing to remove there.

## Known gaps

- **Shaibu Memunat** — 11th staff member, role not supplied. Waiting on the
  owner. Do not guess.
- Common Entrance 2025 rows for **Itofa**, **Muhammed Kausara** and **Onimisi**
  came from a blurry photograph and need confirming.
- `class-feature.jpg` is a placeholder sourced from kogireports.com.
- Backlog: owner-supplied map latitude/longitude, tour video, the
  "TREASURE COLLEGE" naming question and absent-alert automation. The custom
  domain is already live. The former Moniepoint backend idea is superseded and
  must not be reactivated.
- Search/chat now uses the maintained verified-answer-first engine. The older
  corpus remains under separate encrypted review and must not be treated as
  public truth or training approval.

## Protected admission tracker and developer console

The local implementation is fail-closed. Before any authorised staging activation:

1. Follow `supabase/release/20261024_SQL_AGENT_HANDOFF.md`: apply all seven migrations in exact order to a disposable Supabase staging project, run all three rollback-only SQL suites and the read-only postflight. Production SQL remains separately prohibited.
2. Generate independent 32+ character random values for `ADMISSION_OTP_HASH_PEPPER` and `ADMISSION_OTP_ENCRYPTION_KEY`. Never place them in HTML, browser configuration, logs or Git.
3. Provision the intended account in `developer_capabilities` with only the required capabilities and a recorded reason. A school admin is not automatically a developer or OTP dispatcher.
4. Activate `PORTAL_ENABLED`, `PORTAL_ACCOUNTS_ENABLED`, `ADMISSION_TRACKING_ENABLED` and `DEVELOPER_CONSOLE_ENABLED` only after staged acceptance. Do not activate Monnify; payments remain bank transfer or physical office POS with manual approval.
5. Exercise request → queue → one-time reveal → WhatsApp/SMS user action → mark sent → verify → unlinked projection. Confirm reveal replay fails, the server ciphertext is null, resends invalidate former codes and audit details contain no code, phone or message.
6. Exercise a converted admission. Confirm the lightweight tracker exposes no linked child, tokens are absent from URLs, the wrong account cannot consume them, and only the matching full parent sign-in sees the particular admitted applicant/next step.
7. If a reveal is cleared before delivery, do not recover it from logs or the database. Ask the parent to request a new code. Clipboard erasure is never automatic; use the visible overwrite action.
8. Keep `developer-review.html` encrypted. If its passphrase is unavailable, recover an authorised unlocked export or re-key from approved source material; never add a bypass.

Build browser bundles with `npm run build:portal` and `npm run build:developer`. Regenerate `supabase-schema.sql` from ordered migrations before release evidence is recorded.
