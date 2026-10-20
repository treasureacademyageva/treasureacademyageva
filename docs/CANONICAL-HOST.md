# Canonical host

**Current production canonical:**

```text
https://www.treasureacademyageva.com
```

The owner registered `treasureacademyageva.com` through Northwest Registered
Agent and connected both the apex and `www` hostnames to the existing Vercel
project on 20 October 2026. HTTPS is active for both names. Northwest/Business
Identity remains the DNS provider so the existing MX, SPF, DKIM, DMARC and
other mail records stay in place.

## Routing policy

- `https://www.treasureacademyageva.com` is the primary public website.
- Every path on `https://treasureacademyageva.com` permanently redirects to the
  same path on `www` with HTTP 308 through the hostname-conditioned rule in
  `vercel.json`.
- `https://treasureacademyageva.vercel.app` remains attached as a fallback
  Vercel alias, but it is not the canonical URL advertised to search engines.

Vercel's dashboard-level domain redirect supports a temporary 307. To ensure a
permanent redirect, the apex domain must be directly assigned to the project,
not configured as a dashboard redirect; the `vercel.json` host rule then
handles the 308 response.

## Where the canonical appears

`tools/seo-build.py` is the source of truth. It writes the canonical and related
host into:

- canonical, Open Graph and Twitter metadata;
- School and breadcrumb JSON-LD;
- `robots.txt` and `sitemap.xml`;
- public-page URLs used by the static SEO build.

The Android app documentation also uses the custom host for WebView and app-link
examples.

## Changing the host again

Never edit all pages by hand. Use:

```bash
python3 tools/set-site-host.py --check
python3 tools/set-site-host.py https://new.example.com
bash tools/run-all-tests.sh
```

The command checks that the new host responds, replaces the old canonical,
regenerates the sitemap and reports any stragglers. Verify redirect behavior,
HTTPS, DNS mail records and the full test suite before releasing.
