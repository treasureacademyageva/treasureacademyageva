import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const migrationPath = 'supabase/migrations/20261026060000_public_cms_foundation.sql';
const migration = read(migrationPath);
const suite = read('supabase/tests/public_cms_policy.test.sql');
const runner = read('tools/test-sql-migrations.sh');
const schema = read('supabase-schema.sql');

const cmsTables = [
  'public_cms_capabilities',
  'public_cms_capability_events',
  'public_media_assets',
  'public_content_entries',
  'public_content_revisions',
  'public_content_blocks',
  'public_content_tags',
  'public_content_tag_links',
  'public_content_media',
  'public_content_slug_aliases',
  'public_publication_events',
  'public_content_approvals',
  'public_site_content_slots',
  'public_content_quality_findings',
  'public_content_search_terms',
  'public_site_navigation_items',
  'public_content_views_daily',
  'public_content_reactions',
  'public_content_comments',
  'public_comment_moderation_events'
];

test('Run 5 has exactly one ordered additive CMS source migration', () => {
  const migrations = readdirSync(join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.equal(migrations.length, 12);
  assert.equal(migrations.at(-1), '20261026060000_public_cms_foundation.sql');
  assert.equal(migrations.filter((name) => name.startsWith('20261026060000_')).length, 1);
  assert.match(migration, /begin;[\s\S]+commit;\s*$/i);
  assert.doesNotMatch(migration, /(?:drop|truncate|delete\s+from|update)\s+(?:table\s+)?public\.school_data/i);
  assert.doesNotMatch(migration, /\bwordpress\b|\bwp_(?:posts|users|options)\b|\bdb\//i);
  assert.match(migration, /imports no content, media or identities/i);
});

test('every CMS foundation table enables RLS and broad write grants stay closed', () => {
  for (const table of cmsTables) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\s*\\(`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.doesNotMatch(migration, /grant\s+(?:all|insert|update|delete)(?:\s*,\s*(?:insert|update|delete))*\s+on\s+table\s+public\.public_/i);
  const selectGrants = migration.match(/grant select on table[\s\S]+?\n\s+to [^;]+;/gi) || [];
  const anonGrants = selectGrants.filter((block) => /\bto anon(?:,|;)/i.test(block));
  assert.ok(anonGrants.every((block) => !/public\.public_(?:media_assets|content_entries|content_revisions|content_blocks|content_tags|content_tag_links|content_media|content_slug_aliases|site_content_slots|content_search_terms|site_navigation_items)(?:,|\s)/i.test(block)));
  const engagementGrant = migration.match(/grant select on table[\s\S]+?to anon,authenticated;/gi) || [];
  assert.ok(engagementGrant.every((block) => !/public_content_(?:views_daily|reactions|comments)|public_comment_moderation_events/i.test(block)));
  assert.match(migration, /Engagement remains fail-closed: no policies or role grants until Run 9/i);
});

test('CMS authority is separate and developer access never implies publication', () => {
  const capabilityFunction = migration.match(/create or replace function public\.cms_current_actor_can[\s\S]+?\n\$\$;/i)?.[0] || '';
  assert.match(capabilityFunction, /leadership_scope in \('headmistress'.+?'assistant_headmistress'/is);
  assert.match(capabilityFunction, /p_capability in \('view_private','draft','review','publish'\)/i);
  const developerBranch = capabilityFunction.match(/when p_capability='view_private' and exists\([\s\S]+?from public\.developer_capabilities[\s\S]+?\) then true/i)?.[0] || '';
  assert.match(developerBranch, /information_review/i);
  assert.doesNotMatch(developerBranch, /can_publish|can_draft|can_review/);
  assert.match(migration, /Proprietress CMS administration required/i);
  assert.match(suite, /Developer must receive no drafting or publication authority/i);
  assert.match(suite, /CMS capability must not change the editor school-record role/i);
});

test('structured content rejects executable HTML, private material and unmanaged media', () => {
  assert.match(migration, /cms_block_payload_valid/i);
  assert.match(migration, /Malformed or unsafe CMS block payload/i);
  assert.match(migration, /\(java\|vb\)script/);
  assert.match(migration, /raw_html\|html\|script\|javascript\|on\[a-z\]\+/i);
  assert.match(migration, /Block media must have a matching controlled relationship/i);
  assert.match(migration, /Featured media must have a matching controlled relationship/i);
  assert.match(migration, /jsonb_typeof\(cell\) not in \('string','number','boolean','null'\)/i);
  assert.match(migration, /Event data is allowed only for Event content/i);
  assert.match(suite, /Raw HTML and event-handler XSS must be rejected/i);
  assert.match(suite, /Private phone material must be rejected from CMS documents/i);
  assert.match(suite, /Block media without a governed relationship must be rejected/i);
  assert.match(suite, /Unknown block wrapper fields must be rejected/i);
  assert.match(suite, /Table cells must be bounded scalar values/i);
});

test('immutable revisions, approval, scheduling, aliases and child-media safeguards are explicit', () => {
  for (const trigger of [
    'public_content_revisions_immutable',
    'public_content_blocks_immutable',
    'public_content_media_immutable',
    'public_content_aliases_immutable',
    'public_publication_events_immutable',
    'public_content_approvals_immutable'
  ]) assert.match(migration, new RegExp(`create trigger ${trigger}`, 'i'));
  assert.match(migration, /Child-media creator cannot approve their own safeguarding review/i);
  assert.match(migration, /m\.child_identifiable and m\.consent_status<>'approved'/i);
  assert.match(migration, /if not public\.cms_revision_is_publishable\(v_entry\.scheduled_revision_id,false\)/i);
  assert.match(migration, /workflow_status='changes_requested'[\s\S]+Scheduled publication blockers detected/i);
  assert.match(migration, /published_revision_id=case when v_entry\.archived_at is not null then null else published_revision_id end/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('public-cms-seo:'/i);
  assert.match(migration, /Published or scheduled SEO title must be unique/i);
  assert.match(migration, /Emergency publication is limited to time-bounded announcements/i);
  assert.match(suite, /Restored archived draft must remain anonymous-invisible/i);
  assert.match(suite, /Published and scheduled SEO titles must be unique/i);
  assert.match(suite, /Due scheduler must refuse content whose child consent was withdrawn/i);
});

test('anonymous access is constrained to effective published-only projections', () => {
  for (const view of [
    'public_cms_published_entries',
    'public_cms_published_blocks',
    'public_cms_published_tags',
    'public_cms_published_search_terms',
    'public_cms_published_media',
    'public_cms_published_slots',
    'public_cms_published_navigation',
    'public_cms_slug_redirects'
  ]) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}[\\s\\S]+?security_invoker=false,security_barrier=true`, 'i'));
  }
  const publishedEntryView = migration.match(/create or replace view public\.public_cms_published_entries[\s\S]+?;/i)?.[0] || '';
  assert.doesNotMatch(publishedEntryView, /source_note|created_by|change_note|metadata/i);
  assert.match(migration, /classification='public'/i);
  assert.match(migration, /effective_from is null or r\.effective_from<=now\(\)/i);
  assert.match(migration, /expires_at is null or r\.expires_at>now\(\)/i);
  assert.match(migration, /case when public\.cms_media_is_publicly_usable\(r\.featured_media_id\)/i);
  assert.match(migration, /case when public\.cms_media_is_publicly_usable\(r\.social_media_id\)/i);
  assert.match(migration, /b\.block_type='related_content'[\s\S]+target\.slug=\(s#>>'\{\}'\)[\s\S]+public\.cms_revision_is_public\(target\.published_revision_id\)/i);
  assert.match(suite, /Anonymous projection must expose exactly the accepted published revision/i);
  assert.match(suite, /must not expose a related-content pointer to an unpublished target/i);
  assert.match(suite, /Anonymous users must not read media consent, provenance or actor columns directly/i);
  assert.match(suite, /Consent withdrawal must remove media from the public projection immediately/i);
  assert.match(suite, /Consent withdrawal must suppress featured and social media pointers/i);
  assert.match(suite, /Consent withdrawal must immediately remove a formerly published child-media block/i);
  assert.match(suite, /Scheduled content must remain hidden before due time/i);
});

test('schema mirror and local SQL runner track migrations and suites dynamically', () => {
  assert.ok(schema.includes(migration.trim()), 'generated root schema must include the exact CMS migration');
  assert.ok(schema.trimEnd().endsWith(migration.trimEnd()), 'generated root schema must end with the current migration');
  assert.match(runner, /migrations=\(supabase\/migrations\/\*\.sql\)/);
  assert.match(runner, /suites=\(supabase\/tests\/\*\.test\.sql\)/);
  assert.match(runner, /\$\{#migrations\[@\]\}/);
  assert.match(runner, /\$\{#suites\[@\]\}/);
  assert.doesNotMatch(runner, /10\/10 migrations|5\/5 rollback-safe policy suites/);
  assert.match(suite, /^begin;/m);
  assert.match(suite, /^rollback;/m);
});
