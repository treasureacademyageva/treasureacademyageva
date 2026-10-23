# Familiar Design Restoration — 23 October 2026

## Owner direction

The owner reported that the production release had lost the familiar logo, imagery and visual warmth, and explicitly directed restoration before teacher and administrator work continues.

## Restored

- The familiar school crest is back in public headers, compact page navigation, footers and the secure portal entry.
- The homepage again has a large visual hero, an illustrated school-community image and a four-image School Life gallery.
- The About page again opens with the familiar school-community artwork.
- The News lead story again has visual artwork; the existing 2024 excursion archive remains available.
- The secure portal maintenance screen again includes the familiar portal illustration.
- Logo metadata and structured data now follow the owner’s restoration direction.
- The shared build script now preserves these choices instead of changing the crest back to a `TA` text monogram on every rebuild.

## Truthful media treatment

The large campus, classroom, library and graduation visuals are described as **earlier-website illustrations**, not as verified current photographs of the Treasure Academy campus or pupils. The repository images visibly naming other schools (`sports.png` and `culture.png`) remain excluded from public homepage/news placement because publishing them as Treasure Academy material would be misleading. The known third-party placeholder `class-feature.jpg` also remains excluded.

The owner-restored historic crest retains its original “Treasure Kiddies” wording while the public site name remains Treasure Academy, Ageva. This is recorded rather than silently rewritten.

## Security preserved

This restoration does not bring back browser-only authentication, public registration, pupil login, fake receipts, credentials, fabricated testimonials, private records or online assignment submission. Existing accessibility, canonical redirects, payment safety, privacy controls and secure portal foundations remain in place.

## Account Function hotfix

The five account-management entry Functions now check both portal activation switches before loading the Supabase account module. When accounts are disabled they return a controlled `404` JSON response with no network request. This addresses the production `FUNCTION_INVOCATION_FAILED` behavior found after the previous merge while keeping the portal disabled until an approved staging cutover.
