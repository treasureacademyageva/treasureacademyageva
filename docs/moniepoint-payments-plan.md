# Moniepoint / Monnify Payments — Research & Integration Plan

> **Rejected/superseded plan; retain only as historical research.** The owner’s 23 October 2026 decision is manual bank transfer or an in-person physical school-office POS, both manually verified. No gateway, virtual account, online card form, card-data storage or WhatsApp payment evidence is approved. Do not implement or activate the recommendations below.

**Treasure Academy, Ageva — school-fees collection** | Researched Sept 2026

## 1. What "Moniepoint API" actually is
- Moniepoint's online-collection product is called **Monnify** (built by the Moniepoint Group).
- Monnify gives your **backend server** APIs to: create **virtual accounts** for customers,
  confirm transactions, receive **webhooks** when money arrives, send invoices, and disburse funds.
- Important: the secret keys must live on a **backend server**, never inside website JavaScript.
  So this plan needs a small backend (Node.js/Python) + a database + real hosting with HTTPS.

## 2. Recommended option for a school: one virtual account PER PUPIL (best)
- When a pupil is admitted, the backend calls **Create Reserved Account** with the pupil's name
  (guardian email/phone). Monnify returns a permanent account number, e.g. `5790123456` + bank name.
- The parent saves it once and pays **every term's fees** into that same number via any bank app/USSD.
- Every payment triggers a **webhook** to the backend with:
  `paymentStatus: PAID`, `amountPaid`, `transactionReference`, `product.reference`
  (= the account reference you created), `paidOn`, payer `accountDetails`, `transactionHash`.
- The backend verifies the hash, matches `product.reference` → pupil, records the payment,
  and the portal shows **Paid** automatically. No narration-matching, no guesswork.
- Compliance: reserved accounts require the customer's **BVN or NIN** (use the guardian's).
  Get each guardian's BVN/NIN at admission/registration.
- Fees: no monthly fee; small fee **only on successful transactions**; same-day settlement (by 10pm).

## 3. Alternative: ONE school account + references (your original plan — workable but weaker)
- Parent starts a payment on the site → backend creates a **pending payment** with a unique
  reference (e.g. `TA-2026-P003-Term1`) and shows the single school account + exact amount.
- Parent transfers, then the backend matches the incoming webhook/bank alert to the pending
  record by **reference or exact amount** and marks it Paid.
- Weakness: parents forget references; two pupils can owe identical amounts; matching fails
  and needs manual confirmation. Use only if per-pupil accounts are not possible.

## 4. Exact payment flow (recommended option)
1. Admin admits pupil → backend creates reserved virtual account → number stored on pupil record.
2. Term bill is raised (fees per class — when you send the schedule, we encode it).
3. Parent opens pupil portal → "Pay Fees" → sees pupil's permanent account number + amount due.
4. Parent transfers from any bank. Monnify sends `SUCCESSFUL_TRANSACTION` webhook in seconds.
5. Backend: verify signature/hash → match account reference → check amount ≥ amount due →
   save transaction (idempotent on `transactionReference`) → mark bill Paid → portal updates.
6. Receipt: parent prints receipt from the portal; school's copy stays in Admin → Fees.
7. Nightly job re-queries Monnify transaction status for anything still "Pending" (safety net).

## 5. API endpoints the backend will use (Monnify)
- `POST /api/v1/auth/login` — get access token (API Key + Secret Key).
- `POST /api/v1/bank-transfer/reserved-accounts` — create per-pupil virtual account.
- `GET /api/v1/bank-transfer/reserved-accounts/{accountReference}` — account details.
- `GET /api/v2/transactions/{transactionReference}` — verify any transaction.
- `POST /api/v1/merchant/bank-transfer/init-transaction` — one-off invoice payments (option B).
- Webhook `SUCCESSFUL_TRANSACTION` → our `POST /webhooks/monnify` endpoint.

## 6. Security checklist (non-negotiable)
- Verify `transactionHash`/signature on every webhook; reject mismatches.
- Accept webhooks only from Monnify IPs; always HTTPS.
- Idempotency: never credit the same `transactionReference` twice.
- Never trust the browser: amounts and "Paid" status come from webhook/API only.
- Keep API Key / Secret Key / Contract Code in server environment variables.
- Reconcile daily: Monnify settlement report vs our ledger.

## 7. What the school must provide (when ready)
1. Monnify business sign-up + **API Key, Secret Key, Contract Code** (Developer section).
2. Registered business / school details + BVN/NIN of proprietor for onboarding.
3. Backend hosting with HTTPS + always-on (needed to receive webhooks any minute).
4. Fee schedule per class + bank settlement account (where Monnify pays out daily).
5. Guardian BVN/NIN collection added to the admission form.

## 8. Build phases
- **Phase 1 (no backend):** keep manual bank transfer + "Paid/Unpaid" toggle in Admin (already live).
- **Phase 2:** backend + database on real hosting; migrate portal data off browser storage.
- **Phase 3:** Monnify sandbox integration (virtual accounts + webhook + auto Paid).
- **Phase 4:** go live, print receipts from portal, daily reconciliation screen.

## 9. Sources
- Monnify wallet/reserved-account guide: https://developers.monnify.com/blog/building-a-wallet-service-with-monnify
- Transaction Completion Webhook: https://teamapt.atlassian.net/wiki/spaces/MON/pages/213909300/Transaction+Completion+Webhook
- Customer Reserved Account APIs: https://teamapt.atlassian.net/wiki/spaces/MON/pages/212008629
- Webhook event types: https://monnify-docs.playground.monnify.com/docs/webhooks/event-types
- Pricing (no monthly fee, same-day settlement): https://monnify.com/pricing

## 10. COST — exact numbers (researched Sept 2026, VAT exclusive)
- **Starting = FREE:** no setup fee, no monthly fee, free account creation. Sandbox testing is free.
- **Per successful payment only:** bank transfer **1.5% capped at ₦2,000**, OR **₦500 flat** per transfer
  (flat wins above ~₦33,333). Local cards/USSD: 1.5% capped at ₦2,000.
- **School-fee examples (school absorbs fee):** ₦10,000 → fee ₦150 → school gets ₦9,850. ₦25,000 → ₦375 → ₦24,625. ₦50,000 → ₦750 (or ₦500 flat) → ₦49,250+. ₦150,000 → capped ₦2,000 → ₦148,000.
- **Parents can bear the fee instead:** Monnify lets the payer cover it — parent pays e.g. ₦10,150, school gets full ₦10,000.
- **One-time per guardian:** NIN check ₦60 or BVN check ₦10 (needed once to open the pupil's virtual account).
- **Settlement:** same-day by 10pm, free, including weekends.
- **Backend hosting (needed at go-live for webhooks):** basic Nigerian shared hosting with free SSL runs roughly **₦2,400–₦15,000/year** depending on provider/plan.
- **Bottom line:** ₦0 to start and test; when live, only the small per-payment cut (passable to parents) + cheap yearly hosting.
- Sources: https://monnify.com/pricing, https://support.monnify.com/topics/intro-to-monnify-236/pricing-499

---

## 11. SINGLE STATIC ACCOUNT — FLOWS & COST (added 2026-09-15)

**The setup:** instead of a different virtual account per pupil, the school publishes ONE
static Monnify reserved account number (in the school's name) on the website, portal,
receipts and notice board. Every parent pays into that same number. A small backend
matches each credit to the right pupil and marks the invoice Paid.

### FLOW 1 — Parent pays school fees (normal case)
```
1. Parent logs into portal (or starts admission) -> sees invoice:
     Amount:  NGN 25,000
     Pay to:  9876543210 (Monnify, TREASURE ACADEMY AGEVA)
     Narration code:  TA/2026/0042        <- unique per invoice
2. Parent transfers NGN 25,000 from ANY bank app / USSD / branch,
   typing the narration code TA/2026/0042 as the transfer narration.
3. Monnify detects the credit INSTANTLY -> fires a webhook to the
   school backend: { amount, sender name, narration, reference, time }.
4. Backend matches narration TA/2026/0042 -> invoice #0042 (Adaeze O., Primary 4):
     amount correct? YES -> mark invoice PAID automatically.
5. Parent instantly sees receipt in portal (+ SMS/email copy).
```
No staff touches anything in the normal case.

### FLOW 2 — Parent forgets the narration code (fallback matching)
```
1-3. Same as above, but narration is empty or wrong ("school fees", "Adaeze", ...).
4. Backend tries smart matching, in order:
     a) Exact amount + only ONE unpaid invoice of that amount -> auto-match.
     b) Sender account name resembles a guardian name on an unpaid invoice
        of that amount -> auto-match (logged, reviewable).
     c) Otherwise -> credit goes to the UNMATCHED queue.
5. Admin opens dashboard -> sees "NGN 25,000 from MUSA IBRAHIM, no code"
   -> one click pairs it to the right pupil -> invoice marked PAID,
   receipt generated, parent notified.
```

### FLOW 3 — Admin reconciliation (daily safety net)
```
1. Dashboard lists every credit of the day: matched (green) vs unmatched (amber).
2. Admin confirms/pairs any leftovers, adds notes where needed.
3. Day totals + per-class collection report + export for the bursar.
```

### FLOW 4 — Settlement (money reaches the school's real bank account)
```
1. Collections sit in the Monnify wallet during the day.
2. Monnify auto-sweeps to the school's registered bank account SAME DAY by 10pm
   (up to 3 express settlements per day available).
3. Backend records each settlement; dashboard shows "collected vs settled".
```

### Edge cases
- **Underpayment:** invoice stays PARTLY PAID with balance shown; parent pays the rest with the same code.
- **Overpayment / double payment:** excess becomes credit on the pupil's account, usable for next term.
- **Wrong amount, no code, ambiguous:** stays UNMATCHED until admin pairs it — money is never lost, it is always visible in the dashboard.

### COST (single account — same price table, no extra account fees)
Creating and keeping the static account number is free (no setup/monthly fees).
You pay ONLY per successful payment, exactly as in section 10:
- Bank transfer into the account: 1.5% capped at NGN 2,000, OR NGN 500 flat.
- Cards/USSD (if enabled later): 1.5% capped at NGN 2,000.
- Fee can be borne by the PARENT (school receives full fee) or the school.
- Same-day settlement to the school bank account: free.
- Backend hosting: ~NGN 2,400-15,000/year.

Worked example (NGN 25,000 fee, parent bears fee, percentage option):
parent pays NGN 25,375 -> school receives full NGN 25,000 same day by 10pm.
Sources: https://support.monnify.com/topics/intro-to-monnify-236/pricing-499
         https://monnify.com/pricing

---

## 12. MAKING IT CHEAPER — RESEARCHED OPTIONS (added 2026-09-15)

Key insight: gateway fees are charged PER TRANSACTION, not per account — so one
account vs many accounts costs the same on Monnify. Real savings come from
elsewhere. Cheapest-first for a NGN 25,000 fee (school bears fee):

| Option | Fee on NGN 25,000 | Fee on NGN 100,000 | Notes |
|---|---|---|---|
| Manual claim flow (BUILT into portal) | NGN 0 | NGN 0 | Parent transfers to school's own account, submits claim, admin confirms. Costs staff minutes only. |
| Paystack for Schools | NGN 300 flat | NGN 300 flat | Educational rate: 0.7% capped NGN 1,500 cards; NGN 300 flat all other methods. Must register as school. |
| Flutterwave / Squad transfers | from ~NGN 50 | from ~NGN 50 | Roundup-advertised "from" rates; confirm sales quote. |
| Monnify 1.5% | NGN 375 | NGN 1,500 | Capped at NGN 2,000. |
| Monnify NGN 500 flat | NGN 500 | NGN 500 | Wins over 1.5% above ~NGN 33,333. |
| Normal Paystack/Flutterwave/Squad | ~NGN 475 (1.5%+100) | ~NGN 1,600 | Capped NGN 2,000. |
| Parent bears the fee | NGN 0 to school | NGN 0 to school | Works on any gateway above. |

Tricks that work:
1. MANUAL FIRST: the portal now has a full transfer-claim flow (parent submits
   sender/amount/date/reference; admin confirms in one click). NGN 0 forever.
2. PAYSTACK SCHOOL RATE: flat NGN 300 per transfer of ANY size beats every
   percentage option the moment a fee exceeds NGN 20,000.
3. PARENT BEARS FEE: school receives 100% on any gateway.
4. COLLECT ONCE: under any flat-fee option, one annual payment costs 1x flat
   instead of 3x termly flats.
5. MONNIFY = MONIEPOINT: Monnify is Moniepoint group's product for online
   collections — there is no separate cheaper "Moniepoint API" for this.
   (Moniepoint's 0.5%-capped-NGN100 rate is for in-person POS transfers only.)
6. ASK FOR SCHOOL RATES: gateways offer education discounts on request.

Sources: https://support.paystack.com/en/articles/2130306 (school rates)
  https://awajis.com/online-payment-gateways-in-nigeria/ (2026 gateway roundup)
  https://afrotools.com/blog/paystack-fees-explained/ (1.5%+100 cap 2000)
  https://moniepoint.com/blog/receive-transfer-payments-with-your-pos (POS 0.5% cap 100)
