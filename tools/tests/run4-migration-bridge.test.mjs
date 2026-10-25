import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = join(root, 'supabase/release/20261025_RUN4_PRODUCTION_MIGRATION_LEDGER.json');
const bridgeRoot = join(root, 'supabase/release/run-04-cli-workspace');
const migrationRoot = join(bridgeRoot, 'supabase/migrations');
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('Run 4 bridge maps the complete production ledger and only exact migrations 009/010', () => {
  execFileSync('python3', [join(root, 'tools/build-run4-migration-bridge.py')], { cwd: root });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.project_ref, 'biyizitalhylkwtshrqt');
  assert.equal(manifest.remote_history.length, 15);
  assert.deepEqual(manifest.pending.map(({ version }) => version), ['20261025000100', '20261025000200']);

  const files = readdirSync(migrationRoot).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(files.length, 17);
  assert.ok(files.every((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)));

  for (const row of manifest.remote_history) {
    const name = `${row.version}_${row.name}.sql`;
    const sql = readFileSync(join(migrationRoot, name), 'utf8');
    assert.match(sql, /ALREADY APPLIED; NEVER EXECUTE/);
    assert.match(sql, new RegExp(`raise exception 'Run 4 historical ledger marker ${row.version}`));
  }

  for (const row of manifest.pending) {
    const canonical = join(root, row.source);
    const generated = join(migrationRoot, `${row.version}_${row.name}.sql`);
    assert.equal(digest(canonical), row.source_sha256);
    assert.equal(digest(generated), row.source_sha256);
  }

  const readme = readFileSync(join(bridgeRoot, 'README.md'), 'utf8');
  assert.match(readme, /dry run must list exactly migrations 009 and 010/i);
  assert.match(readme, /Never use this workspace[\s\S]*`db reset`/);
});
