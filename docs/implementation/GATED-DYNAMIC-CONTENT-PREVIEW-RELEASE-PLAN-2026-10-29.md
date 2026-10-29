# Gated Dynamic Content Preview Release Plan

**Prepared:** 29 October 2026
**Release branch:** `release/gated-dynamic-content-preview-20261029`
**Accepted Production baseline:** `f4ec4569f957d42420c779494ca436ffba56b706`
**Release class:** Preview only; gate-closed; no Production activation authorised

## Purpose

This release combines the owner-requested public-site remediation with an authorised dynamic content foundation. It allows authorised staff to prepare Page, News, Event, Gallery, Search, class, fee, requirement and calendar information while leadership retains publication authority.

The release does not auto-import, publish, bind or activate held content. The reviewed static site remains the complete public fallback.

## Release scope

- Preserve the verified school identity, contacts, fees, class progression and safeguarding/payment boundaries.
- Keep application code, templates, forms, legal/privacy controls and verified school identity outside ordinary editorial control.
- Add fixed-route Page surfaces with code-owned `replace` or `supplement` modes.
- Keep admissions, requests, Search, shop, payment, receipt and other interactive routes in supplementary mode so CMS content cannot replace their safety shell.
- Route News through gated server delivery while retaining seven byte-for-byte reviewed static fallbacks.
- Allow Search to index a CMS Page only through an effective fixed Page surface or approved core slot.
- Deliver Page media only when attached to the current published revision and through an approved bounded signed variant.
- Keep 48 source-hashed Page candidates held for later verification; no candidate is imported or activated by this release.

## Mandatory gate state for Preview creation

All values below must be absent or exactly `false` before the first Preview deployment:

```text
PUBLIC_CMS_ENABLED=false
PUBLIC_CMS_PAGES_ENABLED=false
PUBLIC_CMS_SEARCH_ENABLED=false
PUBLIC_CMS_CORE_SLOTS_ENABLED=false
PUBLIC_CMS_MEDIA_ENABLED=false
PUBLIC_CMS_DOWNLOADS_ENABLED=false
PUBLIC_CMS_ENGAGEMENT_ENABLED=false
PUBLIC_CMS_COMMENTS_ENABLED=false
PUBLIC_CMS_PLACEMENTS_ENABLED=false
PUBLIC_INVENTORY_ENABLED=false
CMS_PORTAL_ENABLED=false
CMS_MEDIA_ENABLED=false
PARAGON_OTP_RELAY_ENABLED=false
MONNIFY_WEBHOOK_ENABLED=false
MONNIFY_OWNER_VERIFIED=false
```

Existing portal or office gates must not be changed as part of this Preview preparation. Provider credentials must never be committed to source or release evidence.

## Preview migration order

Use a non-Production Supabase project or an isolated Preview database.

1. Record the target project identifier privately and prove that it is not the Production project.
2. Confirm the migration ledger contains every migration through `20261027130000_current_classes_and_flexible_results.sql` in filename order.
3. Create an encrypted logical backup, authenticate it, decrypt it locally and prove a disposable restore before changing the target.
4. Apply exactly:

   ```text
   supabase/migrations/20261029140000_dynamic_public_page_surfaces.sql
   ```

5. Confirm the transaction completed and that the following exist:
   - `public.public_page_surfaces`;
   - `public.public_page_surface_events`;
   - `public.public_cms_published_page_surfaces`;
   - `public.cms_set_page_surface(...)`.
6. Confirm RLS is enabled on both new tables, anonymous users cannot read base binding/audit rows, and anonymous access is limited to the published projection.
7. Do not execute the held candidate manifests as SQL and do not create content rows during migration.
8. Deploy the release branch to Vercel Preview with every gate above closed.
9. Verify static Page and News fallbacks before considering any individual Preview gate.

Rollback-safe SQL policy suites are for disposable local/staging databases only. Do not run fixture-bearing test SQL against Production.

## Preview acceptance sequence

1. Verify the school name, crest, motto, address, telephone, WhatsApp, email, hours and registration details.
2. Verify Pre-Nursery → Nursery 1–2 → Primary 1–4 → Primary 6, with no live Crèche or Primary 5 page.
3. Verify fees, book quantities, writing-material wording and manual-payment separation.
4. Verify admissions, Request Centre, contact, portal links and all safety-shell routes remain functional with Page delivery unavailable.
5. Verify `/news` and all six historical News routes serve reviewed static HTML with the public CMS gate off.
6. Verify clean routes, canonicals, one H1, metadata, JSON-LD, mobile/dark layout and accessibility.
7. If desired, enable only `PUBLIC_CMS_ENABLED=true` plus one subordinate gate in Preview, after its content has been separately reviewed and published. Never enable a subordinate gate in Production during this release step.

## Operational rollback

The safe incident rollback is gate-first and non-destructive:

1. Set all public CMS, media, inventory, engagement and provider gates to `false`.
2. Redeploy the accepted Production baseline `f4ec4569f957d42420c779494ca436ffba56b706`, or the last accepted Preview deployment.
3. Confirm static Pages and the seven reviewed News fallbacks are available.
4. Confirm portal, payment, admission and safeguarding boundaries are unchanged.
5. Retain the additive database objects for investigation. Closed gates and the previous application do not depend on them, so emergency schema deletion is unnecessary.

## Controlled schema reversal, if later required

Schema removal is a separate approved maintenance migration, not an incident response command.

1. Export the Page surface and event rows for audit retention.
2. Confirm every Page surface is inactive and no current application release queries the new projection.
3. Restore the prior `public.public_search_documents` definition from `20261027110000_clean_routes_and_discovery_quality.sql`.
4. Revoke and drop `public.cms_set_page_surface(...)`.
5. Drop `public.public_cms_published_page_surfaces`.
6. Drop the immutable trigger, then `public.public_page_surface_events` and `public.public_page_surfaces`.
7. Drop `public.cms_page_surface_mode(text)` only after all generated-column dependencies are gone.
8. Run the read-only postflight and retain the reversal evidence.

Never delete audit or published content rows merely to make a rollback appear clean.

## Production hold

This plan does not authorise a push, Vercel Production deployment, Supabase Production migration, candidate import, publication, route binding, gate activation, provider call, real enquiry, OTP, application or payment. Those require a separately accepted Preview and explicit owner instruction.
