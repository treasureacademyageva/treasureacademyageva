# School Office Operations Programme

**Implementation date:** 23 October 2026  
**Status:** built locally; migrations unapplied; gates inactive  
**Production SQL, deployment and activation:** none

## 1. Authoritative decisions

### Parent identity and access

Ordinary parent accounts are self-created through exactly one of these routes:

1. **Existing pupil:** school-issued, single-use, hash-only `TA-LINK` plus current class and the name the parent types from the register.
2. **Second parent:** single-use `TA-FAMILY` invitation bound to the intended second parent’s own Nigerian phone.
3. **New family:** restricted applicant account. It may submit and track one active family admission application but cannot read pupil lists, current-family records, fees, shop, results, bank details or payments.

A name, class or phone search is never proof of identity or relationship. A pupil has at most two active guardians, each with a separate account and password. The Headmistress provisions staff accounts and handles verified recovery; she does not create ordinary parent accounts.

### Classes and permanent pupil identity

The exact active progression is:

> Creche → Pre-Nursery → Nursery 1 → Nursery 2 → Primary 1 → Primary 2 → Primary 3 → Primary 4 → Primary 6 → Graduate Hall

There is no active Primary 5. Promotion, retention, transfer and graduation append or close enrolment-history rows; they never replace the pupil UUID. Initial cutover can record existing pupils in every active class. Routine fresh roster entry after cutover is Creche only; higher-class entry requires an authorised admission route.

### Payments

The only approved methods are:

- a parent-submitted **manual bank-transfer notification**, matched manually to the school statement; or
- an **in-person transaction on the school’s physical office POS**, recorded manually by an authorised administrator.

Both methods require office verification. The website does not collect card number, CVV, PIN or OTP, does not store card data, does not use WhatsApp as payment evidence, and does not use a payment gateway. An official receipt is generated only after verification. Either administrator may verify; only the Headmistress may reverse a verified payment.

Payment never approves admission, changes promotion, publishes results or controls account access.

### Charges and physical materials

- Term bills and transport are non-stock services and have no cart quantity.
- A fee component is explicitly `included`, `separate` or `not_applicable`. Included examinations or materials have zero separate amount and cannot become invoice lines.
- Term invoices may accept instalments.
- Physical materials use product variants/sizes, real stock, reservations and immutable movements. They normally require full verified payment before release.
- Handover is either parent/guardian office collection or teacher distribution to the linked pupil after office release.
- An unavailable-item request is demand only: not an order, charge, reservation or guarantee.

## 2. Versioned migrations

Apply in this exact order in a disposable staging project only:

1. `202610230001_secure_school_portal.sql`
2. `202610230002_portal_accounts.sql`
3. `202610230003_staff_operations_and_requests.sql`
4. `202610230004_parent_pupil_linking.sql`
5. `202610230005_self_registration_enrolment_and_graduates.sql`
6. `202610230006_fees_shop_transport_and_manual_payments.sql`

The root `supabase-schema.sql` mirrors all seven ordered migrations through `202610240001`. Migrations 005–007 do not alter or retire `public.school_data` or a former catalogue/payment object.

## 3. Migration 005

Migration 005 adds:

- restricted applicant stage and registration provenance on `profiles`;
- rate-limit audit hashes with no raw phone or network address;
- exact `class_progression`, with Primary 5 inactive as historical evidence only;
- append-only `student_enrolments`;
- promotion batches, pupil-level preview outcomes and atomic application;
- private `graduates`, consent audit and minimal anonymous `public_graduate_wall`;
- private parent notifications;
- admission checklists, scheduled follow-ups and next steps;
- service-only self-registration RPC using the existing hash-only pupil/family credentials;
- administrator RPCs for initial roster entry and promotion.

Primary 6 graduation preserves the student identity, closes the current enrolment, creates the private Graduate Hall record and notifies linked guardians. Public publication remains a separate consent decision.

## 4. Migration 006

Migration 006 adds:

- private owner-approved bank details;
- fee schedules, explicit inclusion treatment, term invoices and non-quantity lines;
- physical products, variants, sizes, eligible classes and owner-reconciliation state;
- reserved, available and damaged stock balances;
- immutable inventory movements;
- low-stock projection, manual audited adjustment, procurement and stocktake workflows;
- materials orders, payment-before-release and office/teacher fulfilment;
- restock demand and parent confirmation;
- fulfilled-order return/exchange requests, inspection, stock movements and audited monetary adjustment;
- capacity-controlled transport services and service invoices;
- manual bank-transfer and physical POS records;
- verification, official receipts and Headmistress-only reversal;
- preserved-source mappings for `shop_items`, `uniform_items` and `transport_routes`.

## 5. Preserved live data

Do not insert owner data into migrations. In isolated staging, reconcile the private owner export as follows:

| Preserved object | Expected rows | Staged destination | Publication rule |
|---|---:|---|---|
| `shop_items` | 25 | `shop_products`, `shop_variants`, `legacy_catalog_reconciliation` | inactive until identity, variant, eligibility and price are owner verified |
| `uniform_items` | 8 | same physical catalogue and reconciliation table | size-specific stock; inactive until owner verified |
| `transport_routes` | 3 | `transport_services`, `legacy_transport_reconciliation` | inactive until route, term, capacity and amount are owner verified |
| `fee_structure` | 10 | reviewed `fee_schedules` and `fee_schedule_items` | never copy a value without inclusion/double-charge review |
| `school_data` | 1 | no new authoritative destination | preserve untouched until separate verified retirement |

A row count is a reconciliation control, not permission to publish a former value.

## 6. Runtime gates

All new gates default to absent/false and fail closed:

| Gate | Purpose |
|---|---|
| `PORTAL_ENABLED` | secure portal shell and browser configuration |
| `PORTAL_ACCOUNTS_ENABLED` | trusted staff provisioning and account recovery |
| `PARENT_LINKING_ENABLED` | signed-in linking and family invitation workflows |
| `PORTAL_REGISTRATION_ENABLED` | public parent registration endpoint and registration UI |
| `PORTAL_OFFICE_ENABLED` | enrolment history, fees, shop, inventory, transport, fulfilment and graduates UI |
| `PUBLIC_INFORMATION_ENABLED` | verified operational public-information projection |
| `PUBLIC_GRADUATE_WALL_ENABLED` | minimal consent-approved public Graduate Wall projection |

`PORTAL_REGISTRATION_PEPPER` is required by the registration endpoint and must be a new private random value of at least 24 characters. It hashes rate-limit identifiers and must never be committed or exposed to the browser.

Activation is not implied by a migration, branch push or deployment. Each gate needs separate owner approval after staging acceptance.

## 7. Required staging acceptance

1. Preserve private exports and confirm former row counts.
2. Apply all seven migrations through `202610240001` in exact filename order to disposable staging.
3. Run `supabase/tests/rls_portal_policy.test.sql` inside a rollback transaction.
4. Test generic registration failure, duplicate phone, wrong/expired/replayed code, phone-bound family invitation, rate limits and two-guardian maximum.
5. Confirm a restricted applicant cannot read pupils, bank details, fees, catalogue, transport, graduates, orders or payments.
6. Test one application through checklist, follow-up, offer and admitted status. Confirm one student and one first enrolment row are created.
7. Import fictional or redacted all-class cutover pupils. Confirm routine non-Creche entry is rejected.
8. Preview each class promotion, change one outcome, reject pending outcomes, then apply atomically. Confirm Primary 4 moves to Primary 6 and Primary 6 moves to Graduate Hall.
9. Confirm a parent sees only linked private graduates. Confirm anonymous users see only approved, published Graduate Wall projection fields.
10. Reconcile 25 shop, 8 uniform, 3 route and 10 fee rows without activating an unverified value.
11. Test reservation concurrency, expiry/cancellation release, low-stock alerts, stocktake differences, procurement receipts and immutable movement rejection.
12. Test term instalments, included-component exclusion, exact physical-order payment, bank review, physical POS, receipt generation, rejection and Headmistress-only reversal.
13. Test office collection and teacher handover. Confirm the teacher cannot see balances, bank/payment references, parent contacts or unrelated pupils.
14. Test out-of-stock interest, procurement, availability notification, parent confirmation and later order. Confirm no auto-charge or guaranteed sale.
15. Test resellable return, damaged return and exchange stock movements; verify non-zero monetary adjustment is Headmistress-only.
16. Confirm former tables and all preserved rows remain unchanged.
17. Run repository production, visitor, portal/security, accessibility and browser suites.

## 8. Rollback and fail-closed response

Before cutover, rollback means leaving every new gate false and making no production SQL change. After an authorised staged/production migration, a runtime incident is contained by disabling `PORTAL_OFFICE_ENABLED`, `PORTAL_REGISTRATION_ENABLED` and `PUBLIC_GRADUATE_WALL_ENABLED` first. Preserve all audit and inventory/payment records; do not delete evidence. Database rollback requires an owner-controlled backup/restore plan, not ad-hoc down SQL.

The existing manual retirement script remains prohibited until verified cutover and separate explicit owner approval.
