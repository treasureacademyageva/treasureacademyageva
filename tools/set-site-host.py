#!/usr/bin/env python3
"""Change the site's canonical host everywhere in one pass.

The canonical host appears in generated meta tags on every page, in robots.txt,
sitemap.xml, the web manifest and the docs. Changing it by hand means missing
one and leaving the site pointing at two different addresses, so do it here.

    python3 tools/set-site-host.py --check
    python3 tools/set-site-host.py https://www.treasureacademyageva.com

Run the test suite afterwards. See docs/CANONICAL-HOST.md for why this exists.
"""

import glob
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEO_BUILD = os.path.join(ROOT, "tools", "seo-build.py")

# Text files that may embed the host. Images and fonts are skipped.
PATTERNS = ["*.html", "portal/*.html", "*.txt", "*.xml", "*.webmanifest",
            "*.json", "*.md", "docs/*.md", "tools/*.py", "assets/js/*.js"]

SKIP_DIRS = ("node_modules", ".git", "assets/fonts", "assets/img")


def current_host():
    src = open(SEO_BUILD, encoding="utf-8").read()
    m = re.search(r'^SITE\s*=\s*"([^"]+)"', src, re.M)
    if not m:
        sys.exit("Could not find SITE in tools/seo-build.py")
    return m.group(1)


def files():
    seen = []
    for pat in PATTERNS:
        for f in glob.glob(os.path.join(ROOT, pat)):
            rel = os.path.relpath(f, ROOT)
            if any(rel.startswith(d) for d in SKIP_DIRS):
                continue
            if rel not in seen and os.path.isfile(f):
                seen.append(rel)
    return sorted(seen)


def reachable(url):
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "set-site-host"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:                      # noqa: BLE001
        return f"unreachable ({type(e).__name__})"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    old = current_host()
    arg = sys.argv[1]

    if arg == "--check":
        hits = sum(open(os.path.join(ROOT, f), encoding="utf-8",
                        errors="ignore").read().count(old) for f in files())
        print(f"current host : {old}")
        print(f"references   : {hits} across {len(files())} files")
        print(f"live check   : {old} -> {reachable(old + '/')}")
        return

    new = arg.rstrip("/")
    if not new.startswith("http"):
        sys.exit("Host must include the scheme, e.g. https://example.com")
    if new == old:
        print(f"Already set to {new}. Nothing to do.")
        return

    print(f"  {old}  ->  {new}")
    status = reachable(new + "/")
    print(f"  target responds: {status}")
    if status != 200:
        print("  warning: target did not return 200. Continuing anyway —")
        print("  a domain that is not wired up yet is a valid reason for this.")

    changed, total = 0, 0
    for rel in files():
        path = os.path.join(ROOT, rel)
        try:
            s = open(path, encoding="utf-8").read()
        except UnicodeDecodeError:
            continue
        if old not in s:
            continue
        n = s.count(old)
        open(path, "w", encoding="utf-8").write(s.replace(old, new))
        changed += 1
        total += n

    print(f"  rewrote {total} references in {changed} files")

    # Regenerate so canonical/og/sitemap are rebuilt from the new constant
    # rather than just string-replaced.
    r = subprocess.run([sys.executable, SEO_BUILD], cwd=ROOT,
                       capture_output=True, text=True)
    print("  " + (r.stdout.strip() or r.stderr.strip()).replace("\n", "\n  "))

    left = [f for f in files()
            if old in open(os.path.join(ROOT, f), encoding="utf-8",
                           errors="ignore").read()]
    print(f"  stragglers: {left if left else 'none'}")
    print("\nNow run:  bash tools/run-all-tests.sh")


if __name__ == "__main__":
    main()
