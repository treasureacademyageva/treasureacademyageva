# Run 9 — Public Engagement and Shared Placements Rollback Plan

**Prepared:** 27 October 2026
**Current Production impact:** none; Run 9 is not pushed, deployed, migrated or activated

## 1. Immediate kill-switch order

For any engagement abuse, privacy, moderation-capacity or incorrect-count incident:

1. set `PUBLIC_CMS_COMMENTS_ENABLED=false`;
2. set `PUBLIC_CMS_ENGAGEMENT_ENABLED=false` if likes/views or the combined endpoint are affected;
3. set `PUBLIC_CMS_PLACEMENTS_ENABLED=false` if homepage CMS placement is affected;
4. redeploy/verify the exact-false configuration if the platform requires deployment for environment changes;
5. preserve all rows and immutable events for investigation.

The master `PUBLIC_CMS_ENABLED=false` remains the broader public CMS rollback, but it is not required to contain comments alone.

## 2. Expected fail-closed behavior

With comments false:

- comment summary, submit, edit, delete and report operations return unavailable;
- no new public comment form is enabled;
- the protected leadership audit remains available through the portal after authentication;
- existing records remain RLS-protected and retained.

With engagement false:

- the engagement API returns 404 before database access;
- detail pages omit engagement controls and continue to render accepted public content;
- no browser view receipt, like or comment operation is accepted.

With placements false:

- the placement API returns 404 before database access;
- the homepage retains its reviewed coded fallback;
- existing slot/audit rows remain retained but do not control public output.

## 3. Source rollback

Redeploy the last accepted pre-Run-9 source if a source rollback is required. The prior source does not route engagement or placement actions and does not load the public engagement/homepage placement bundles.

Do not push local `main` or promote a deployment merely to perform a rollback test. A future release must record the deployed before/after commit and verify that rollback does not restore a vulnerable version.

## 4. Database rollback posture

The migration is additive. Do not drop engagement tables, enum values, functions, projections, comments, reactions, receipts, reports, placements or immutable audit rows as an incident response.

Preferred rollback is:

- exact-false environment gates;
- source rollback if required;
- revoke a compromised account through the existing account controls;
- preserve evidence;
- deploy a reviewed additive correction.

PostgreSQL enum values are intentionally not destructively removed. Historical comments and audit events remain governed records even when their public feature is off.

## 5. Privacy incident containment

If a public response exposes a private identifier:

1. disable comments, then engagement;
2. capture only request ID, route, time, response schema and affected record ID—never copy private body/credentials into public evidence;
3. verify the fixed public views and endpoint column allowlists;
4. retain database history;
5. apply an additive projection/API correction;
6. rerun SQL privilege tests, API privacy tests and browser XSS/accessibility tests before considering reactivation.

## 6. Abuse or moderation-capacity incident

- disable comments independently;
- retain approved/pending/reported/hidden/deleted history;
- leadership reviews pending/reported records in the protected workspace;
- never bulk-approve or auto-publish backlog;
- do not expose actor/reporter lists;
- require a new explicit activation decision after staffing and abuse-control acceptance.

## 7. Count anomaly

Views/likes/comments are informational only. A count anomaly must never change admission, payment, progression, results, account access or publication authority.

For anomalous views:

- disable engagement if needed;
- inspect aggregate day/entry and receipt counts without attempting to recover raw IPs;
- preserve 31-day rotating HMAC receipts only for deduplication investigation;
- never add permanent full-IP/user-agent logging as a workaround.

For anomalous likes:

- verify unique account/content rows and active-profile checks;
- do not publish reacting-account lists.

## 8. Placement incident

- disable `PUBLIC_CMS_PLACEMENTS_ENABLED`;
- verify the homepage returns to the reviewed fallback;
- preserve slot and immutable placement event rows;
- correct a slot through the publisher RPC with a new reason rather than altering history;
- do not let popularity metrics select replacement content.

## 9. Stop conditions for any future release

Stop before activation if any of these occurs:

- Production preservation counts decrease unexpectedly;
- any earlier migration would be replayed or repaired;
- any anonymous/authenticated direct base-table privilege appears;
- active-account, role, pending-first or leadership checks fail;
- public output includes actor/reporter/moderator identity;
- ordinary refreshes increment more than once per entry/day receipt;
- bot/prefetch traffic is accepted as a view;
- comment editing stays public instead of returning to pending;
- moderation/placement reasons can be rewritten;
- Function count exceeds 12;
- any gate accepts non-lowercase `true` or defaults open;
- homepage CMS failure silently presents coded fallback as current CMS authority while the placement gate is active;
- any popularity count becomes an input to school operations or publication authority.

## 10. Re-acceptance checklist

Before re-enabling an affected gate:

1. complete 15-migration reconstruction;
2. pass all 9 rollback-safe SQL suites and postflight;
3. pass focused Run 8+9 Node tests;
4. pass engagement and portal browser/accessibility tests;
5. validate Vercel routing and 12/12 Function count;
6. verify no private fields in public JSON/HTML;
7. prove exact false → true → false behavior in an authorised protected window;
8. obtain a separate explicit activation decision.
