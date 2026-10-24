# Test suites

## Current release gate

Run the maintained web, security, answer, review, visitor, accessibility and browser suites:

```bash
npm install
npm run test:all-current
```

The browser runner starts a local static server on `127.0.0.1:4173` when one is not already available and stops only the server it started.

Run the complete migration chain and three rollback-safe SQL policy suites in a disposable **local** PostgreSQL database:

```bash
sudo pg_ctlcluster 17 main start   # workspace-specific, when needed
npm run test:sql-local
```

`tools/test-sql-migrations.sh` creates and drops a process-specific local database. It deliberately does not accept a remote database URL. `supabase/tests/local_supabase_harness.sql` is only a local Supabase/Auth approximation and must never be uploaded to a real Supabase project.

## Historical suites

`verify-batch*.js`, `attendance-notify.test.js`, `fees-chat.test.js`, the former SEO suite and the old stress corpus are retained as implementation history. Many intentionally assert retired browser-local authentication, demo pupils, Primary 5, artificial loaders, former page counts or superseded styling. They are **not** a release gate for the current secure Supabase architecture and must not be made green by restoring those unsafe behaviours.

`tools/run-all-tests.sh` is the preserved historical runner. Use `npm run test:all-current` for the maintained contract.

When adding a current feature, wire its checks into `package.json`, `tools/run-current-tests.sh`, one of the three SQL policy suites, or an appropriate maintained browser suite.
