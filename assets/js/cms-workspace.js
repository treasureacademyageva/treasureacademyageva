const CONTENT_TYPES = ['news', 'event', 'page', 'announcement'];
export const CMS_BLOCK_TYPES = [
  'paragraph', 'heading', 'unordered_list', 'ordered_list', 'quote', 'callout',
  'image', 'video', 'gallery', 'verified_fact', 'table', 'button', 'related_content'
];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_PATH = /^\/[a-zA-Z0-9/_?#=&.%-]*$/;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const PUBLIC_PAGE_PATHS = [
  '/', '/about', '/academics', '/admission-form', '/admissions', '/alumni', '/anthem', '/birthdays', '/board', '/calendar',
  '/careers', '/classes', '/classes/pre-nursery', '/classes/nursery-1', '/classes/nursery-2', '/classes/primary-1',
  '/classes/primary-2', '/classes/primary-3', '/classes/primary-4', '/classes/primary-6', '/contact', '/credits',
  '/elearning', '/exams', '/site-map', '/fees', '/holiday', '/homework', '/lost-found', '/openday', '/photo-day',
  '/poster', '/privacy', '/pta', '/reading', '/receipt', '/request-centre', '/safeguarding', '/search', '/shop',
  '/story', '/support', '/testimonials', '/transport', '/uniform', '/volunteer', '/website-help', '/welcome'
];
const SUPPLEMENT_PAGE_PATHS = new Set([
  '/', '/admission-form', '/admissions', '/birthdays', '/contact', '/elearning', '/site-map', '/homework',
  '/lost-found', '/poster', '/reading', '/receipt', '/request-centre', '/search', '/shop', '/website-help'
]);

const ui = {
  panel: 'content',
  editor: null,
  selectedEntryId: null,
  selectedMediaId: null,
  listType: 'all',
  listStatus: 'all',
  listQuery: ''
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden' || key === 'multiple') node[key] = Boolean(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  });
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child?.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

function replace(node, ...children) {
  node.replaceChildren(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function displayDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('en-NG', withTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }
    : { dateStyle: 'medium', timeZone: 'Africa/Lagos' }).format(date);
}

function badge(value) {
  const text = String(value || 'unknown');
  return el('span', { class: `badge badge--${text.toLowerCase().replace(/[^a-z]+/g, '-')}`, text: titleCase(text) });
}

function messageNode() {
  return el('div', { class: 'form-message', 'aria-live': 'polite', tabindex: '-1' });
}

function setMessage(node, message, error = false) {
  node.textContent = message;
  node.className = `form-message ${error ? 'form-message--error' : 'form-message--success'}`;
  node.setAttribute('role', error ? 'alert' : 'status');
  node.focus();
}

let fieldCounter = 0;
function field(label, control, hint = '') {
  const id = control.id || `cms-field-${++fieldCounter}`;
  control.id = id;
  if (hint) control.setAttribute('aria-describedby', `${id}-hint`);
  return el('div', { class: 'field' },
    el('label', { for: id, text: label }),
    hint ? el('p', { id: `${id}-hint`, class: 'field__hint', text: hint }) : null,
    control
  );
}

function input(name, value = '', attrs = {}) {
  return el('input', { name, value, type: 'text', ...attrs });
}

function textarea(name, value = '', attrs = {}) {
  const node = el('textarea', { name, rows: attrs.rows || 4, ...attrs });
  node.value = value || '';
  return node;
}

function select(name, choices, selected = '', attrs = {}) {
  const node = el('select', { name, ...attrs });
  choices.forEach((choice) => {
    const value = typeof choice === 'string' ? choice : choice.value;
    const label = typeof choice === 'string' ? titleCase(choice) : choice.label;
    node.append(el('option', { value, text: label, selected: String(value) === String(selected) }));
  });
  return node;
}

function checkbox(name, label, checked = false, hint = '') {
  return el('label', { class: 'check-row' },
    el('input', { type: 'checkbox', name, checked }),
    el('span', {}, el('strong', { text: label }), hint ? el('small', { text: hint }) : null)
  );
}

function button(label, onClick, options = {}) {
  return el('button', {
    type: options.type || 'button',
    class: options.small ? 'table-action' : `button${options.secondary ? ' button--secondary' : ''}`,
    onClick,
    disabled: options.disabled
  }, label);
}

function empty(title, text) {
  return el('div', { class: 'empty-state' }, el('h3', { text: title }), el('p', { text }));
}

function notice(kind, title, text) {
  return el('div', { class: `alert alert--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    el('span', { 'aria-hidden': 'true', text: kind === 'warning' ? '!' : kind === 'error' ? '×' : 'i' }),
    el('div', {}, el('strong', { text: title }), el('p', { text }))
  );
}

function table(headers, rows, label) {
  if (!rows.length) return null;
  return el('div', { class: 'table-scroll', role: 'region', tabindex: '0', 'aria-label': label },
    el('table', {},
      el('thead', {}, el('tr', {}, headers.map((item) => el('th', { scope: 'col', text: item })))),
      el('tbody', {}, rows.map((row) => el('tr', {}, row.map((cell) => el('td', {}, cell)))))
    )
  );
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function emptyCmsState(error = false) {
  return {
    available: false,
    error,
    capabilities: {
      view_private: false, draft: false, review: false, publish: false, comment_moderate: false,
      safeguarding_review: false, administer: false, emergency_publish: false
    },
    entries: [], revisions: [], blocks: [], tags: [], tagLinks: [], searchTerms: [],
    media: [], contentMedia: [], publicationEvents: [], approvals: [], findings: [],
    moderationComments: [], commentEvents: [], siteSlots: [], siteSlotEvents: [],
    migrationCandidates: [], migrationEvents: [], revisionSources: [], coreSlots: [], coreSlotEvents: [],
    pageSurfaces: [], pageSurfaceEvents: [], reviewQueue: [], capabilityRows: [], capabilityEvents: []
  };
}

export function canUseCms(cms) {
  return cms?.available === true && cms?.capabilities?.view_private === true;
}

async function capability(supabase, name) {
  const { data, error } = await supabase.rpc('cms_current_actor_can', { p_capability: name });
  if (error) throw error;
  return data === true;
}

async function rows(supabase, tableName, columns, options = {}) {
  let query = supabase.from(tableName).select(columns);
  if (options.order) query = query.order(options.order, { ascending: options.ascending === true });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function optionalRows(supabase, tableName, columns, options = {}) {
  try { return await rows(supabase, tableName, columns, options); }
  catch (error) {
    if (['42P01', 'PGRST200', 'PGRST205'].includes(String(error?.code || ''))) return [];
    throw error;
  }
}

export async function loadCmsWorkspaceData(supabase) {
  const names = ['view_private', 'draft', 'review', 'publish', 'comment_moderate', 'safeguarding_review', 'administer', 'emergency_publish'];
  const values = await Promise.all(names.map((name) => capability(supabase, name)));
  const capabilities = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  if (!capabilities.view_private) return { ...emptyCmsState(), capabilities };

  const common = await Promise.all([
    rows(supabase, 'public_content_entries', 'id,content_type,slug,canonical_path,workflow_status,current_revision_number,current_revision_id,published_revision_id,scheduled_revision_id,scheduled_for,created_by,created_at,updated_at,published_at,archived_at,archived_by,archive_reason,cancelled_at', { order: 'updated_at', limit: 200 }),
    rows(supabase, 'public_content_revisions', 'id,entry_id,revision_number,title,summary,category,search_keywords,content_language,locale,classification,source_note,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,effective_from,expires_at,event_starts_at,event_ends_at,event_timezone,event_venue,event_public_address,event_status,attendance_mode,public_action_label,public_action_path,metadata,created_by,change_note,created_at', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_content_blocks', 'id,revision_id,block_position,block_type,payload,created_by,created_at', { order: 'block_position', ascending: true, limit: 1000 }),
    rows(supabase, 'public_content_tags', 'id,slug,name,created_at', { order: 'name', ascending: true, limit: 300 }),
    rows(supabase, 'public_content_tag_links', 'revision_id,tag_id,created_at', { limit: 1000 }),
    rows(supabase, 'public_content_search_terms', 'revision_id,term,source,created_at', { limit: 1000 }),
    rows(supabase, 'public_media_assets', 'id,provider,provider_asset_id,provider_resource_type,provider_version,original_mime_type,byte_size,width,height,duration_seconds,lifecycle_state,title,alt_text,attribution,source_note,checksum_sha256,child_identifiable,provenance_status,consent_status,safeguarding_status,created_by,created_at,updated_at,upload_completed_at,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,archived_at,archived_by,archive_reason,retention_policy', { order: 'updated_at', limit: 300 }),
    rows(supabase, 'public_content_media', 'id,revision_id,media_id,placement,placement_position,caption,created_at', { limit: 1000 }),
    rows(supabase, 'public_publication_events', 'id,entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail,created_at', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_content_approvals', 'id,entry_id,revision_id,approval_kind,decision,reviewer_id,reason,created_at', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_content_quality_findings', 'id,entry_id,revision_id,finding_code,severity,status,detail,created_at,resolved_at,resolved_by,resolution_reason', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_site_content_slots', 'id,slot_key,entry_id,slot_position,active,effective_from,expires_at,created_by,created_at,updated_at', { order: 'slot_key', ascending: true, limit: 50 }),
    rows(supabase, 'public_site_slot_events', 'id,slot_id,entry_id,actor_id,action,slot_key,slot_position,reason,created_at', { order: 'created_at', limit: 300 }),
    rows(supabase, 'public_comment_moderation_events', 'id,comment_id,actor_id,previous_status,new_status,reason,created_at', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_content_migration_candidates', 'id,source_key,source_kind,source_locator,source_sha256,content_type,slug,historical_child_media_held,status,staged_by,staged_at,verified_by,verified_at,verification_reason,imported_entry_id,imported_at', { order: 'staged_at', limit: 300 }),
    rows(supabase, 'public_content_migration_events', 'id,candidate_id,actor_id,action,reason,created_at', { order: 'created_at', limit: 500 }),
    rows(supabase, 'public_content_revision_sources', 'revision_id,candidate_id,source_sha256,linked_by,linked_at', { order: 'linked_at', limit: 500 }),
    rows(supabase, 'public_core_page_slots', 'id,page_path,mount_key,slot_position,entry_id,active,effective_from,expires_at,created_by,updated_by,created_at,updated_at', { order: 'page_path', ascending: true, limit: 200 }),
    rows(supabase, 'public_core_page_slot_events', 'id,slot_id,entry_id,actor_id,action,page_path,mount_key,slot_position,reason,created_at', { order: 'created_at', limit: 500 }),
    optionalRows(supabase, 'public_page_surfaces', 'id,page_path,render_mode,entry_id,active,effective_from,expires_at,created_by,updated_by,created_at,updated_at', { order: 'page_path', ascending: true, limit: 100 }),
    optionalRows(supabase, 'public_page_surface_events', 'id,surface_id,page_path,entry_id,actor_id,action,render_mode,reason,created_at', { order: 'created_at', limit: 500 })
  ]);

  let reviewQueue = [];
  const reviewResult = await supabase.rpc('cms_content_review_queue');
  if (reviewResult.error) throw reviewResult.error;
  reviewQueue = reviewResult.data || [];

  let moderationComments = [];
  if (capabilities.comment_moderate) {
    const result = await supabase.rpc('cms_comment_moderation_queue');
    if (result.error) throw result.error;
    moderationComments = result.data || [];
  }

  let capabilityRows = [];
  let capabilityEvents = [];
  if (capabilities.administer) {
    [capabilityRows, capabilityEvents] = await Promise.all([
      rows(supabase, 'public_cms_capabilities', 'profile_id,can_draft,can_review,can_publish,can_safeguarding_review,can_emergency_publish,granted_by,grant_reason,granted_at,revoked_at,revoked_by,revoke_reason,updated_at', { order: 'updated_at', limit: 200 }),
      rows(supabase, 'public_cms_capability_events', 'id,profile_id,actor_id,action,detail,created_at', { order: 'created_at', limit: 500 })
    ]);
  }

  const [entries, revisions, blocks, tags, tagLinks, searchTerms, media, contentMedia, publicationEvents, approvals, findings,
    siteSlots, siteSlotEvents, commentEvents, migrationCandidates, migrationEvents, revisionSources, coreSlots, coreSlotEvents,
    pageSurfaces, pageSurfaceEvents] = common;
  return {
    available: true, error: false, capabilities, entries, revisions, blocks, tags, tagLinks,
    searchTerms, media, contentMedia, publicationEvents, approvals, findings,
    moderationComments, commentEvents, siteSlots, siteSlotEvents,
    migrationCandidates, migrationEvents, revisionSources, coreSlots, coreSlotEvents,
    pageSurfaces, pageSurfaceEvents, reviewQueue, capabilityRows, capabilityEvents
  };
}

export function normalizeList(value, { slugs = false, max = 40 } = {}) {
  const output = [];
  const seen = new Set();
  String(value || '').split(/[\n,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean).forEach((item) => {
    if (output.length >= max || seen.has(item)) return;
    if (item.length < 2 || item.length > 80 || (slugs && !SLUG.test(item))) return;
    seen.add(item);
    output.push(item);
  });
  return output;
}

export function lagosIso(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? new Date(`${text}:00+01:00`)
    : new Date(text);
  return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString();
}

function relation(assetId, placement, position = 0, caption = '') {
  return { asset_id: assetId, placement, position, ...(caption ? { caption } : {}) };
}

export function buildCmsDocument(fields, blocks) {
  const contentType = String(fields.contentType || 'news');
  const document = {
    title: String(fields.title || '').trim(),
    summary: String(fields.summary || '').trim(),
    category: String(fields.category || '').trim(),
    search_keywords: normalizeList(fields.searchKeywords),
    language: 'en',
    locale: 'en-NG',
    classification: fields.classification === 'private' ? 'private' : 'public',
    source_note: String(fields.sourceNote || '').trim(),
    next_review_date: String(fields.nextReviewDate || ''),
    seo_title: String(fields.seoTitle || '').trim(),
    seo_description: String(fields.seoDescription || '').trim(),
    effective_from: lagosIso(fields.effectiveFrom),
    expires_at: lagosIso(fields.expiresAt),
    metadata: {},
    blocks: blocks.map((block) => ({ type: block.type, payload: block.payload })),
    tags: normalizeList(fields.tags, { slugs: true, max: 20 }),
    search_terms: normalizeList(fields.searchTerms),
    media: []
  };

  if (contentType === 'event') {
    document.event = {
      starts_at: lagosIso(fields.eventStartsAt),
      ends_at: lagosIso(fields.eventEndsAt),
      venue: String(fields.eventVenue || '').trim(),
      public_address: String(fields.eventAddress || '').trim(),
      status: String(fields.eventStatus || 'scheduled'),
      attendance_mode: String(fields.attendanceMode || 'in_person'),
      action_label: String(fields.actionLabel || '').trim(),
      action_path: String(fields.actionPath || '').trim()
    };
  }

  const seen = new Set();
  const addRelation = (item) => {
    if (!UUID.test(String(item.asset_id || ''))) return;
    const key = `${item.asset_id}:${item.placement}:${item.position}`;
    if (!seen.has(key)) { seen.add(key); document.media.push(item); }
  };
  blocks.forEach((block, index) => {
    if (block.type === 'image' || block.type === 'video') addRelation(relation(block.payload.asset_id, 'body', index));
    if (block.type === 'gallery') asArray(block.payload.asset_ids).forEach((id, position) => addRelation(relation(id, 'gallery', position)));
  });
  if (UUID.test(String(fields.featuredMediaId || ''))) {
    document.featured_media_id = fields.featuredMediaId;
    addRelation(relation(fields.featuredMediaId, 'featured'));
  }
  if (UUID.test(String(fields.socialMediaId || ''))) {
    document.social_media_id = fields.socialMediaId;
    addRelation(relation(fields.socialMediaId, 'social'));
  }
  asArray(fields.downloadMediaIds).forEach((id, position) => addRelation(relation(id, 'download', position)));

  Object.keys(document).forEach((key) => {
    if (document[key] === '' || (Array.isArray(document[key]) && document[key].length === 0 && !['blocks', 'media'].includes(key))) delete document[key];
  });
  return document;
}

export function validateCmsDraft(contentType, slug, document) {
  const errors = [];
  if (!CONTENT_TYPES.includes(contentType)) errors.push('Choose a supported content type.');
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 120) errors.push('Use a lowercase hyphenated slug between 2 and 120 characters.');
  if (document.title?.length < 4 || document.title?.length > 180) errors.push('Title must contain 4–180 characters.');
  if (document.summary?.length < 10 || document.summary?.length > 500) errors.push('Summary must contain 10–500 characters.');
  if (!Array.isArray(document.blocks) || document.blocks.length < 1 || document.blocks.length > 100) errors.push('Add between 1 and 100 structured blocks.');
  if (document.seo_title && (document.seo_title.length < 4 || document.seo_title.length > 70)) errors.push('SEO title must contain 4–70 characters.');
  if (document.seo_description && (document.seo_description.length < 20 || document.seo_description.length > 180)) errors.push('SEO description must contain 20–180 characters.');
  if (document.source_note && document.source_note.length > 2000) errors.push('Source note must not exceed 2,000 characters.');
  if (document.expires_at && document.effective_from && Date.parse(document.expires_at) <= Date.parse(document.effective_from)) errors.push('Expiry must follow the effective time.');
  if (contentType === 'event') {
    if (!document.event?.starts_at) errors.push('Event start is required.');
    if (document.event?.ends_at && Date.parse(document.event.ends_at) < Date.parse(document.event.starts_at)) errors.push('Event end must not precede its start.');
  }
  document.blocks?.forEach((block, index) => {
    if (!CMS_BLOCK_TYPES.includes(block.type)) errors.push(`Block ${index + 1} has an unsupported type.`);
  });
  const encoded = JSON.stringify(document);
  if (/(<[\s/]*[a-z][^>]*>|(?:java|vb)script\s*:|data\s*:\s*text\/html|css\s*expression\s*\()/i.test(encoded)) {
    errors.push('Executable markup and script-like content are not accepted.');
  }
  return errors;
}

function revisionForEntry(cms, entry, revisionId = null) {
  return cms.revisions.find((item) => item.id === (revisionId || entry.current_revision_id));
}

function documentFromRevision(cms, entry, revision) {
  const revisionBlocks = cms.blocks.filter((item) => item.revision_id === revision.id)
    .sort((a, b) => a.block_position - b.block_position)
    .map((item) => ({ type: item.block_type, payload: item.payload }));
  const links = cms.contentMedia.filter((item) => item.revision_id === revision.id);
  const tagIds = new Set(cms.tagLinks.filter((item) => item.revision_id === revision.id).map((item) => item.tag_id));
  const tags = cms.tags.filter((item) => tagIds.has(item.id)).map((item) => item.slug);
  const searchTerms = cms.searchTerms.filter((item) => item.revision_id === revision.id).map((item) => item.term);
  return {
    contentType: entry.content_type,
    slug: entry.slug,
    title: revision.title,
    summary: revision.summary,
    category: revision.category || '',
    classification: revision.classification,
    sourceNote: revision.source_note || '',
    nextReviewDate: revision.next_review_date || '',
    seoTitle: revision.seo_title || '',
    seoDescription: revision.seo_description || '',
    effectiveFrom: revision.effective_from || '',
    expiresAt: revision.expires_at || '',
    searchKeywords: asArray(revision.search_keywords).join(', '),
    tags: tags.join(', '),
    searchTerms: searchTerms.join(', '),
    featuredMediaId: revision.featured_media_id || '',
    socialMediaId: revision.social_media_id || '',
    downloadMediaIds: links.filter((item) => item.placement === 'download').map((item) => item.media_id),
    eventStartsAt: revision.event_starts_at || '',
    eventEndsAt: revision.event_ends_at || '',
    eventVenue: revision.event_venue || '',
    eventAddress: revision.event_public_address || '',
    eventStatus: revision.event_status || 'scheduled',
    attendanceMode: revision.attendance_mode || 'in_person',
    actionLabel: revision.public_action_label || '',
    actionPath: revision.public_action_path || '',
    blocks: revisionBlocks
  };
}

function safePath(value) {
  return ALLOWED_PATH.test(String(value || '')) && !String(value).includes('//') && !String(value).includes('..');
}

function renderPreviewBlock(block, cms) {
  const payload = block.payload || {};
  if (block.type === 'paragraph') return el('p', { text: payload.text || '' });
  if (block.type === 'heading') return el(`h${['2', '3', '4'].includes(String(payload.level)) ? payload.level : '2'}`, { text: payload.text || '' });
  if (block.type === 'quote') return el('blockquote', {}, el('p', { text: payload.text || '' }));
  if (block.type === 'callout') return notice(payload.style === 'warning' ? 'warning' : 'info', 'Notice', payload.text || '');
  if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    const tag = block.type === 'ordered_list' ? 'ol' : 'ul';
    return el(tag, {}, asArray(payload.items).map((item) => el('li', { text: item })));
  }
  if (block.type === 'verified_fact') return el('aside', { class: 'cms-preview__fact' },
    el('strong', { text: 'Verified information' }), el('p', { text: payload.text || '' }),
    safePath(payload.source_path) ? el('a', { href: payload.source_path, text: 'Supporting source' }) : null);
  if (block.type === 'button') return safePath(payload.path)
    ? el('p', {}, el('a', { class: 'button', href: payload.path, text: payload.label || 'Open' })) : null;
  if (block.type === 'table') return table(asArray(payload.headers), asArray(payload.rows), 'Content preview table');
  if (block.type === 'related_content') return el('div', { class: 'cms-preview__related' }, el('strong', { text: 'Related content' }),
    el('ul', {}, asArray(payload.slugs).map((slug) => el('li', { text: slug }))));
  if (block.type === 'image' || block.type === 'video') {
    const media = cms.media.find((item) => item.id === payload.asset_id);
    return el('figure', { class: 'cms-preview__media' },
      el('div', { class: 'cms-media-placeholder', text: `${titleCase(block.type)} derivative — ${media?.title || 'governed asset'}` }),
      el('figcaption', { text: block.type === 'image' ? (payload.alt || media?.alt_text || 'Alt text required') : (payload.title || media?.title || 'Video title required') }));
  }
  if (block.type === 'gallery') return el('div', { class: 'cms-preview__gallery', 'aria-label': 'Gallery preview' },
    asArray(payload.asset_ids).map((id) => {
      const media = cms.media.find((item) => item.id === id);
      return el('div', { class: 'cms-media-placeholder', text: media?.title || 'Governed image' });
    }));
  return null;
}

export function renderCmsPreview(documentValue, cms = emptyCmsState()) {
  return el('article', { class: 'cms-preview', 'aria-label': 'Private content preview' },
    el('p', { class: 'eyebrow', text: 'Private preview — not published' }),
    el('h2', { text: documentValue.title || 'Untitled draft' }),
    el('p', { class: 'cms-preview__summary', text: documentValue.summary || '' }),
    asArray(documentValue.blocks).map((block) => renderPreviewBlock(block, cms))
  );
}

function payloadControl(key, label, value = '', attrs = {}) {
  const control = attrs.kind === 'textarea'
    ? textarea('', Array.isArray(value) ? value.join('\n') : value, { rows: attrs.rows || 3 })
    : input('', value, { type: attrs.type || 'text' });
  control.removeAttribute('name');
  control.dataset.key = key;
  return field(label, control, attrs.hint || '');
}

function mediaSelect(cms, selected, type = 'all', multiple = false) {
  const options = cms.media.filter((item) => item.upload_completed_at && !item.archived_at && (type === 'all' || item.provider_resource_type === type));
  const node = el('select', { 'data-key': multiple ? 'asset_ids' : 'asset_id', multiple, size: multiple ? '5' : null });
  if (!multiple) node.append(el('option', { value: '', text: 'Choose governed media' }));
  options.forEach((item) => node.append(el('option', {
    value: item.id,
    selected: multiple ? asArray(selected).includes(item.id) : selected === item.id,
    text: `${item.title} — ${titleCase(item.lifecycle_state)}${item.child_identifiable ? ' — child media' : ''}`
  })));
  return node;
}

function replacePayloadControls(container, type, payload, cms) {
  const controls = [];
  if (type === 'paragraph' || type === 'quote') controls.push(payloadControl('text', 'Text', payload.text, { kind: 'textarea', rows: 5 }));
  if (type === 'heading') {
    const level = select('', [{ value: '2', label: 'Heading 2' }, { value: '3', label: 'Heading 3' }, { value: '4', label: 'Heading 4' }], String(payload.level || 2));
    level.removeAttribute('name'); level.dataset.key = 'level';
    controls.push(payloadControl('text', 'Heading text', payload.text), field('Heading level', level));
  }
  if (type === 'ordered_list' || type === 'unordered_list') controls.push(payloadControl('items', 'List items — one per line', payload.items, { kind: 'textarea', rows: 5 }));
  if (type === 'callout') {
    const style = select('', ['info', 'warning', 'success'], payload.style || 'info');
    style.removeAttribute('name'); style.dataset.key = 'style';
    controls.push(payloadControl('text', 'Callout text', payload.text, { kind: 'textarea' }), field('Callout style', style));
  }
  if (type === 'image') controls.push(field('Governed image', mediaSelect(cms, payload.asset_id, 'image')), payloadControl('alt', 'Alternative text', payload.alt, { hint: 'Describe the image’s meaning. Use decorative only when it adds no information.' }), checkbox('', 'Decorative image', payload.decorative === true));
  if (type === 'image') controls[2].querySelector('input').dataset.key = 'decorative';
  if (type === 'video') controls.push(field('Governed video', mediaSelect(cms, payload.asset_id, 'video')), payloadControl('title', 'Accessible video title', payload.title));
  if (type === 'gallery') controls.push(field('Governed gallery images', mediaSelect(cms, payload.asset_ids, 'image', true), 'Use Ctrl or Command to select more than one approved or pending governed image.'));
  if (type === 'verified_fact') controls.push(payloadControl('text', 'Verified fact', payload.text, { kind: 'textarea' }), payloadControl('source_path', 'Supporting internal source path', payload.source_path || '/'));
  if (type === 'table') controls.push(payloadControl('headers', 'Column headers separated by |', asArray(payload.headers).join(' | ')), payloadControl('rows', 'Rows — one per line, cells separated by |', asArray(payload.rows).map((row) => row.join(' | ')).join('\n'), { kind: 'textarea', rows: 5 }));
  if (type === 'button') controls.push(payloadControl('label', 'Button label', payload.label), payloadControl('path', 'Internal path', payload.path || '/'));
  if (type === 'related_content') controls.push(payloadControl('slugs', 'Related slugs — one per line', payload.slugs, { kind: 'textarea' }));
  replace(container, controls);
}

function defaultPayload(type) {
  if (type === 'heading') return { text: '', level: 2 };
  if (type === 'ordered_list' || type === 'unordered_list') return { items: [''] };
  if (type === 'callout') return { text: '', style: 'info' };
  if (type === 'image') return { asset_id: '', decorative: false, alt: '' };
  if (type === 'video') return { asset_id: '', title: '' };
  if (type === 'gallery') return { asset_ids: [] };
  if (type === 'verified_fact') return { text: '', source_path: '/' };
  if (type === 'table') return { headers: ['Heading'], rows: [['']] };
  if (type === 'button') return { label: '', path: '/' };
  if (type === 'related_content') return { slugs: [''] };
  return { text: '' };
}

function blockEditor(block, cms) {
  const wrapper = el('fieldset', { class: 'cms-block-editor' });
  const legend = el('legend', { text: 'Structured content block' });
  const type = select('', CMS_BLOCK_TYPES, block.type || 'paragraph');
  type.removeAttribute('name');
  type.className = 'cms-block-editor__type';
  const payload = el('div', { class: 'cms-block-editor__payload' });
  replacePayloadControls(payload, type.value, block.payload || defaultPayload(type.value), cms);
  type.addEventListener('change', () => replacePayloadControls(payload, type.value, defaultPayload(type.value), cms));
  const controls = el('div', { class: 'table-actions' },
    button('Move up', () => { const previous = wrapper.previousElementSibling; if (previous?.classList.contains('cms-block-editor')) wrapper.parentNode.insertBefore(wrapper, previous); }, { small: true }),
    button('Move down', () => { const next = wrapper.nextElementSibling; if (next?.classList.contains('cms-block-editor')) wrapper.parentNode.insertBefore(next, wrapper); }, { small: true }),
    button('Remove', () => { if (wrapper.parentNode.querySelectorAll('.cms-block-editor').length > 1) wrapper.remove(); }, { small: true })
  );
  wrapper.append(legend, field('Block type', type), payload, controls);
  return wrapper;
}

function collectBlock(wrapper) {
  const type = wrapper.querySelector('.cms-block-editor__type').value;
  const values = {};
  wrapper.querySelectorAll('[data-key]').forEach((control) => {
    const key = control.dataset.key;
    if (control.type === 'checkbox') values[key] = control.checked;
    else if (control.multiple) values[key] = [...control.selectedOptions].map((item) => item.value);
    else values[key] = control.value.trim();
  });
  if (['ordered_list', 'unordered_list', 'related_content'].includes(type)) {
    const key = type === 'related_content' ? 'slugs' : 'items';
    values[key] = String(values[key] || '').split('\n').map((item) => item.trim()).filter(Boolean);
  }
  if (type === 'heading') values.level = Number(values.level);
  if (type === 'table') {
    values.headers = String(values.headers || '').split('|').map((item) => item.trim()).filter(Boolean);
    values.rows = String(values.rows || '').split('\n').map((line) => line.split('|').map((item) => item.trim())).filter((row) => row.some(Boolean));
  }
  return { type, payload: values };
}

function selectedValues(selectNode) {
  return [...selectNode.selectedOptions].map((item) => item.value).filter(Boolean);
}

function collectEditor(form, contentType) {
  const values = new FormData(form);
  const fields = {
    contentType,
    title: values.get('title'), summary: values.get('summary'), category: values.get('category'),
    classification: values.get('classification'), sourceNote: values.get('source_note'), nextReviewDate: values.get('next_review_date'),
    seoTitle: values.get('seo_title'), seoDescription: values.get('seo_description'), effectiveFrom: values.get('effective_from'),
    expiresAt: values.get('expires_at'), searchKeywords: values.get('search_keywords'), tags: values.get('tags'),
    searchTerms: values.get('search_terms'), featuredMediaId: values.get('featured_media_id'), socialMediaId: values.get('social_media_id'),
    downloadMediaIds: selectedValues(form.elements.download_media_ids), eventStartsAt: values.get('event_starts_at'),
    eventEndsAt: values.get('event_ends_at'), eventVenue: values.get('event_venue'), eventAddress: values.get('event_address'),
    eventStatus: values.get('event_status'), attendanceMode: values.get('attendance_mode'), actionLabel: values.get('action_label'),
    actionPath: values.get('action_path')
  };
  const blocks = [...form.querySelectorAll('.cms-block-editor')].map(collectBlock);
  return { document: buildCmsDocument(fields, blocks), changeNote: String(values.get('change_note') || '').trim() };
}

function datetimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function mediaOptions(cms, selected, type = 'all', multiple = false) {
  const node = el('select', { name: type === 'download' ? 'download_media_ids' : '', multiple, size: multiple ? '5' : null });
  if (!multiple) node.append(el('option', { value: '', text: 'No governed media' }));
  cms.media.filter((item) => item.upload_completed_at && !item.archived_at && (type === 'all' || type === 'download' || item.provider_resource_type === type)).forEach((item) => {
    node.append(el('option', { value: item.id, selected: multiple ? asArray(selected).includes(item.id) : selected === item.id, text: `${item.title} — ${titleCase(item.lifecycle_state)}` }));
  });
  return node;
}

function friendlyError(error) {
  const message = String(error?.message || '');
  if (/revision conflict/i.test(message)) return 'Another editor created a newer revision. Refresh the CMS before trying again.';
  if (/slug|duplicate|unique/i.test(message)) return 'That slug or retained route is already in use.';
  if (/authority|required|permission|forbidden|42501/i.test(message)) return 'Your account does not have authority for this CMS action.';
  if (/blocker|invalid|malformed|22023/i.test(message)) return 'The server rejected one or more fields. Review the structured content and required approvals.';
  return 'The CMS action could not be completed. No public content was changed.';
}

async function runMutation(buttonNode, output, task) {
  buttonNode.disabled = true;
  try { await task(); }
  catch (error) { setMessage(output, friendlyError(error), true); }
  finally { buttonNode.disabled = false; }
}

function editorView(context) {
  const { cms } = context.state;
  const editing = ui.editor?.entryId ? cms.entries.find((item) => item.id === ui.editor.entryId) : null;
  const revision = editing ? revisionForEntry(cms, editing) : null;
  const initial = ui.editor?.draft || (editing && revision ? documentFromRevision(cms, editing, revision) : {
    contentType: ui.editor?.contentType || 'news', slug: '', title: '', summary: '', category: '', classification: 'public',
    sourceNote: '', nextReviewDate: '', seoTitle: '', seoDescription: '', effectiveFrom: '', expiresAt: '', searchKeywords: '',
    tags: '', searchTerms: '', featuredMediaId: '', socialMediaId: '', downloadMediaIds: [], eventStartsAt: '', eventEndsAt: '',
    eventVenue: '', eventAddress: '', eventStatus: 'scheduled', attendanceMode: 'in_person', actionLabel: '', actionPath: '',
    blocks: [{ type: 'paragraph', payload: { text: '' } }]
  });
  const contentType = editing?.content_type || initial.contentType;
  const form = el('form', { class: 'data-form cms-editor' });
  const output = messageNode();
  const blocks = el('div', { class: 'cms-block-list' }, asArray(initial.blocks).map((item) => blockEditor(item, cms)));
  const typeControl = select('content_type', CONTENT_TYPES, contentType, { disabled: Boolean(editing) });
  const slugControl = input('slug', editing?.slug || initial.slug, { required: true, minlength: '2', maxlength: '120', pattern: '[a-z0-9]+(?:-[a-z0-9]+)*', disabled: Boolean(editing) });

  form.append(
    notice('info', editing ? `Revision ${editing.current_revision_number + 1}` : 'New content identity', 'Saving creates an immutable revision. It does not publish the record.'),
    el('div', { class: 'form-grid' }, field('Content type', typeControl), field('Lowercase route slug', slugControl, editing ? 'Use the audited slug-change action after creation.' : 'Letters, numbers and single hyphens only.')),
    field('Title', input('title', initial.title, { required: true, minlength: '4', maxlength: '180' })),
    field('Summary / standfirst', textarea('summary', initial.summary, { required: true, minlength: '10', maxlength: '500', rows: 4 })),
    el('div', { class: 'form-grid' },
      field('Category', input('category', initial.category, { maxlength: '80' })),
      field('Classification', select('classification', ['public', 'private'], initial.classification || 'public'))
    ),
    field('Structured body', blocks, 'Use allowlisted blocks only. Raw HTML, scripts and arbitrary embeds are not accepted.'),
    button('Add content block', () => blocks.append(blockEditor({ type: 'paragraph', payload: { text: '' } }, cms)), { secondary: true }),
    el('details', { class: 'form-panel' }, el('summary', { text: 'Search, provenance and review fields' }),
      el('div', { class: 'data-form' },
        field('Source / provenance note', textarea('source_note', initial.sourceNote, { maxlength: '2000', rows: 3 }), 'Do not enter private child details, passwords, OTPs or provider credentials.'),
        el('div', { class: 'form-grid' }, field('Tags', input('tags', initial.tags), 'Comma-separated lowercase slugs.'), field('Parent-facing search terms', input('search_terms', initial.searchTerms), 'Comma-separated verified phrases.')),
        field('Additional search keywords', input('search_keywords', initial.searchKeywords)),
        el('div', { class: 'form-grid' }, field('Next review date', input('next_review_date', initial.nextReviewDate, { type: 'date' })), field('Effective from — Africa/Lagos', input('effective_from', datetimeInputValue(initial.effectiveFrom), { type: 'datetime-local' }))),
        field('Expires at — Africa/Lagos', input('expires_at', datetimeInputValue(initial.expiresAt), { type: 'datetime-local' }))
      )
    ),
    el('details', { class: 'form-panel' }, el('summary', { text: 'SEO and governed media placement' }),
      el('div', { class: 'data-form' },
        field('SEO title', input('seo_title', initial.seoTitle, { maxlength: '70' })),
        field('SEO description', textarea('seo_description', initial.seoDescription, { maxlength: '180', rows: 3 })),
        el('div', { class: 'form-grid' }, field('Featured image', (() => { const node = mediaOptions(cms, initial.featuredMediaId, 'image'); node.name = 'featured_media_id'; return node; })()), field('Social image', (() => { const node = mediaOptions(cms, initial.socialMediaId, 'image'); node.name = 'social_media_id'; return node; })())),
        field('Explicit safe derivative downloads', mediaOptions(cms, initial.downloadMediaIds, 'download', true), 'This grants only transformed download placement after publication; originals remain unavailable.')
      )
    ),
    el('details', { class: 'form-panel', open: contentType === 'event' }, el('summary', { text: 'Event fields — used only for Event content' }),
      el('div', { class: 'data-form' },
        el('div', { class: 'form-grid' }, field('Starts at — Africa/Lagos', input('event_starts_at', datetimeInputValue(initial.eventStartsAt), { type: 'datetime-local' })), field('Ends at — Africa/Lagos', input('event_ends_at', datetimeInputValue(initial.eventEndsAt), { type: 'datetime-local' }))),
        el('div', { class: 'form-grid' }, field('Venue', input('event_venue', initial.eventVenue, { maxlength: '200' })), field('Public address / safe description', input('event_address', initial.eventAddress, { maxlength: '500' }))),
        el('div', { class: 'form-grid' }, field('Event state', select('event_status', ['scheduled', 'postponed', 'cancelled', 'moved_online', 'completed'], initial.eventStatus)), field('Attendance mode', select('attendance_mode', ['in_person', 'online', 'hybrid', 'not_applicable'], initial.attendanceMode))),
        el('div', { class: 'form-grid' }, field('Public action label', input('action_label', initial.actionLabel, { maxlength: '80' })), field('Internal action path', input('action_path', initial.actionPath)))
      )
    ),
    field('Revision change note', textarea('change_note', '', { required: true, minlength: '3', maxlength: '500', rows: 3 }), 'State what changed. This becomes immutable audit evidence.'),
    output
  );

  const preview = el('div', { class: 'cms-preview-host' });
  const previewButton = button('Preview draft', () => {
    const type = editing?.content_type || form.elements.content_type.value;
    const result = collectEditor(form, type);
    const slug = editing?.slug || form.elements.slug.value;
    const errors = validateCmsDraft(type, slug, result.document);
    if (errors.length) { setMessage(output, errors.join(' '), true); return; }
    replace(preview, renderCmsPreview(result.document, cms));
    preview.querySelector('article')?.focus?.();
  }, { secondary: true });
  const saveButton = button(editing ? 'Save immutable revision' : 'Create draft', null, { type: 'submit' });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMutation(saveButton, output, async () => {
      const type = editing?.content_type || form.elements.content_type.value;
      const slug = editing?.slug || form.elements.slug.value.trim();
      const result = collectEditor(form, type);
      const errors = validateCmsDraft(type, slug, result.document);
      if (result.changeNote.length < 3) errors.push('Add a revision change note.');
      if (errors.length) { setMessage(output, errors.join(' '), true); return; }
      let entryId;
      if (editing) {
        await context.rpc('cms_create_revision', { p_entry_id: editing.id, p_expected_version: editing.current_revision_number, p_document: result.document, p_change_note: result.changeNote });
        entryId = editing.id;
      } else {
        entryId = await context.rpc('cms_create_entry', { p_content_type: type, p_slug: slug, p_document: result.document, p_change_note: result.changeNote });
      }
      ui.editor = null;
      ui.selectedEntryId = entryId;
      ui.panel = 'workflow';
      await context.refresh(editing ? 'A new immutable CMS revision was created.' : 'The CMS draft was created. Nothing was published.');
    });
  });
  form.append(el('div', { class: 'button-row' }, saveButton, previewButton, button('Cancel editor', () => { ui.editor = null; context.rerender(); }, { secondary: true })), preview);
  return form;
}

function contentPanel(context) {
  const { cms } = context.state;
  if (ui.editor) return editorView(context);
  const controls = el('div', { class: 'cms-filter-bar' });
  const typeFilter = select('', [{ value: 'all', label: 'All types' }, ...CONTENT_TYPES.map((value) => ({ value, label: titleCase(value) }))], ui.listType);
  const statusValues = ['all', 'draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'archived'];
  const statusFilter = select('', statusValues, ui.listStatus);
  const query = input('', ui.listQuery, { type: 'search', placeholder: 'Search title or slug', 'aria-label': 'Search CMS content' });
  const apply = () => { ui.listType = typeFilter.value; ui.listStatus = statusFilter.value; ui.listQuery = query.value.toLowerCase().trim(); renderList(); };
  typeFilter.addEventListener('change', apply); statusFilter.addEventListener('change', apply); query.addEventListener('input', apply);
  controls.append(typeFilter, statusFilter, query);
  const list = el('div', { class: 'cms-entry-list' });
  const renderList = () => {
    const records = cms.entries.filter((entry) => {
      const revision = revisionForEntry(cms, entry);
      const matchesType = ui.listType === 'all' || entry.content_type === ui.listType;
      const matchesStatus = ui.listStatus === 'all' || entry.workflow_status === ui.listStatus;
      const haystack = `${entry.slug} ${revision?.title || ''}`.toLowerCase();
      return matchesType && matchesStatus && (!ui.listQuery || haystack.includes(ui.listQuery));
    });
    replace(list, records.length ? records.map((entry) => {
      const revision = revisionForEntry(cms, entry);
      return el('article', { class: 'cms-entry-card' },
        el('div', {}, el('p', { class: 'eyebrow', text: titleCase(entry.content_type) }), el('h3', { text: revision?.title || entry.slug }), el('p', { text: revision?.summary || 'Revision unavailable' })),
        el('div', { class: 'cms-entry-card__meta' }, badge(entry.workflow_status), el('code', { text: entry.canonical_path }), el('span', { text: `Revision ${entry.current_revision_number}` }), el('span', { text: `Updated ${displayDate(entry.updated_at, true)}` })),
        el('div', { class: 'table-actions' },
          cms.capabilities.draft && entry.workflow_status !== 'archived' ? button('Edit', () => { ui.editor = { entryId: entry.id }; context.rerender(); }, { small: true }) : null,
          button('Workflow & history', () => { ui.selectedEntryId = entry.id; ui.panel = 'workflow'; context.rerender(); }, { small: true }),
          button('Preview', () => { const doc = revision ? buildCmsDocument(documentFromRevision(cms, entry, revision), documentFromRevision(cms, entry, revision).blocks) : null; if (doc) replace(context.previewHost, renderCmsPreview(doc, cms)); }, { small: true })
        )
      );
    }) : empty('No matching CMS records', 'Adjust the filters or create a governed draft.'));
  };
  renderList();
  return el('div', { class: 'cms-panel' },
    el('div', { class: 'cms-toolbar' }, controls, cms.capabilities.draft ? button('Create content', () => { ui.editor = { contentType: 'news' }; context.rerender(); }) : null),
    list,
    context.previewHost
  );
}

function actionForm(title, controls, label, handler, options = {}) {
  const form = el('form', { class: 'data-form' });
  const output = messageNode();
  const submit = button(label, null, { type: 'submit' });
  form.append(...controls.filter(Boolean), output, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMutation(submit, output, () => handler(new FormData(form), output));
  });
  return el('details', { class: 'form-panel', open: options.open }, el('summary', { text: title }), form);
}

function profileName(context, id) {
  if (!id) return 'System';
  if (id === context.state.profile.id) return context.state.profile.full_name;
  return context.state.data.profiles?.find((item) => item.id === id)?.full_name || 'Authorised or former user';
}

function workflowPanel(context) {
  const { cms } = context.state;
  const entry = cms.entries.find((item) => item.id === ui.selectedEntryId) || cms.entries[0];
  if (!entry) return empty('No CMS workflow yet', 'Create a draft before review, approval or publication.');
  ui.selectedEntryId = entry.id;
  const revision = revisionForEntry(cms, entry);
  const documentValue = revision ? buildCmsDocument(documentFromRevision(cms, entry, revision), documentFromRevision(cms, entry, revision).blocks) : null;
  const approvals = cms.approvals.filter((item) => item.revision_id === entry.current_revision_id).reverse();
  const revisions = cms.revisions.filter((item) => item.entry_id === entry.id).sort((a, b) => b.revision_number - a.revision_number);
  const events = cms.publicationEvents.filter((item) => item.entry_id === entry.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const revisionMediaIds = new Set(cms.contentMedia.filter((item) => item.revision_id === entry.current_revision_id).map((item) => item.media_id));
  const hasChildMedia = cms.media.some((item) => revisionMediaIds.has(item.id) && item.child_identifiable);
  const creatorNeedsIndependentSafeguarding = hasChildMedia && revision?.created_by === context.state.profile.id;
  const actions = [];

  if (cms.capabilities.draft && ['draft', 'changes_requested'].includes(entry.workflow_status)) {
    actions.push(actionForm('Submit current revision for factual review', [field('Reason', textarea('reason', '', { required: true, minlength: '3', maxlength: '500' }))], 'Submit for review', async (values) => {
      await context.rpc('cms_submit_for_review', { p_entry_id: entry.id, p_reason: String(values.get('reason')).trim() });
      await context.refresh('The current CMS revision was submitted for review.');
    }));
  }

  const kinds = [];
  if (cms.capabilities.review || cms.capabilities.publish) kinds.push({ value: 'factual', label: 'Factual review' });
  if (cms.capabilities.safeguarding_review && !creatorNeedsIndependentSafeguarding) kinds.push({ value: 'safeguarding', label: 'Safeguarding review' });
  if (cms.capabilities.publish) kinds.push({ value: 'publication', label: 'Publication approval' });
  if (kinds.length) {
    actions.push(actionForm('Record review or approval', [
      field('Review kind', select('kind', kinds, kinds[0].value)),
      field('Decision', select('decision', [{ value: 'approved', label: 'Approve' }, { value: 'changes_requested', label: 'Request changes' }, { value: 'revoked', label: 'Revoke earlier approval' }], 'approved')),
      field('Recorded reason', textarea('reason', '', { required: true, minlength: '3', maxlength: '500' }))
    ], 'Record decision', async (values) => {
      await context.rpc('cms_record_approval', { p_entry_id: entry.id, p_kind: values.get('kind'), p_decision: values.get('decision'), p_reason: String(values.get('reason')).trim() });
      await context.refresh('The review decision was added to immutable CMS history.');
    }));
  }

  if (cms.capabilities.publish) {
    actions.push(actionForm('Publish now or schedule', [
      field('Publication reason', textarea('reason', '', { required: true, minlength: '3', maxlength: '500' })),
      field('Optional schedule time — Africa/Lagos', input('publish_at', '', { type: 'datetime-local' }), 'Leave blank to publish now. Scheduling remains subject to due-time revalidation.'),
      cms.capabilities.emergency_publish ? checkbox('emergency', 'Proprietress emergency override', false, 'Use only when authorised; requires a detailed reason and the server still enforces emergency-notice constraints.') : null
    ], 'Apply publication decision', async (values) => {
      const publishAt = String(values.get('publish_at') || '');
      await context.rpc('cms_publish', { p_entry_id: entry.id, p_reason: String(values.get('reason')).trim(), p_scheduled_for: publishAt ? lagosIso(publishAt) : null, p_emergency: values.get('emergency') === 'on' });
      await context.refresh(publishAt ? 'The revision was scheduled and will be revalidated when due.' : 'The approved revision was published.');
    }));
    if (entry.workflow_status !== 'archived') actions.push(actionForm('Archive this content identity', [field('Archive reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))], 'Archive content', async (values) => {
      await context.rpc('cms_archive', { p_entry_id: entry.id, p_reason: String(values.get('reason')).trim() });
      await context.refresh('The CMS record was archived without deleting its history.');
    }));
    actions.push(actionForm('Change canonical slug', [field('New lowercase slug', input('slug', entry.slug, { required: true, minlength: '2', maxlength: '120', pattern: '[a-z0-9]+(?:-[a-z0-9]+)*' })), field('Route-change reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))], 'Change slug and retain alias', async (values) => {
      await context.rpc('cms_change_slug', { p_entry_id: entry.id, p_new_slug: String(values.get('slug')).trim(), p_reason: String(values.get('reason')).trim() });
      await context.refresh('The canonical slug changed and the former path was retained as an audited alias.');
    }));
  }

  const revisionCards = revisions.map((item) => el('article', { class: 'cms-revision-card' },
    el('div', {}, el('strong', { text: `Revision ${item.revision_number}: ${item.title}` }), el('p', { text: `${displayDate(item.created_at, true)} · ${item.change_note}` })),
    el('div', { class: 'table-actions' },
      button('Preview', () => { const doc = buildCmsDocument(documentFromRevision(cms, entry, item), documentFromRevision(cms, entry, item).blocks); replace(context.previewHost, renderCmsPreview(doc, cms)); }, { small: true })
    ),
    cms.capabilities.draft && item.id !== entry.current_revision_id ? actionForm('Restore as a new draft revision', [
      field('Restore reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))
    ], 'Create restored revision', async (values) => {
      await context.rpc('cms_restore_revision', { p_entry_id: entry.id, p_revision_id: item.id, p_note: String(values.get('reason')).trim() });
      await context.refresh('The selected revision was copied into a new immutable draft revision.');
    }) : null
  ));

  return el('div', { class: 'cms-panel' },
    el('article', { class: 'cms-entry-card cms-entry-card--selected' },
      el('div', {}, el('p', { class: 'eyebrow', text: titleCase(entry.content_type) }), el('h3', { text: revision?.title || entry.slug }), el('p', { text: revision?.summary || '' })),
      el('div', { class: 'cms-entry-card__meta' }, badge(entry.workflow_status), el('code', { text: entry.canonical_path }), el('span', { text: `Current revision ${entry.current_revision_number}` }))
    ),
    documentValue ? renderCmsPreview(documentValue, cms) : null,
    creatorNeedsIndependentSafeguarding ? notice('warning', 'Independent safeguarding review required', 'This revision contains identifiable-child media and you created the revision. A different accepted safeguarding reviewer must record that decision.') : null,
    el('div', { class: 'cms-action-grid' }, actions),
    el('h3', { text: 'Current revision approvals' }),
    table(['Kind', 'Decision', 'Reviewer', 'Reason', 'Date'], approvals.map((item) => [titleCase(item.approval_kind), badge(item.decision), profileName(context, item.reviewer_id), item.reason, displayDate(item.created_at, true)]), 'Current CMS approvals') || empty('No approvals recorded', 'Factual and publication approval are required before ordinary publication; child media can add safeguarding requirements.'),
    el('h3', { text: 'Revision history' }),
    el('div', { class: 'cms-revision-list' }, revisionCards),
    el('h3', { text: 'Workflow audit' }),
    table(['Date', 'Action', 'From', 'To', 'Actor', 'Reason'], events.map((item) => [displayDate(item.created_at, true), titleCase(item.action), titleCase(item.previous_status || 'new'), badge(item.new_status), profileName(context, item.actor_id), item.reason || '—']), 'CMS workflow audit') || empty('No workflow events', 'Creation and every status transition are recorded here.'),
    context.previewHost
  );
}

async function accessToken(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again');
  return data.session.access_token;
}

async function mediaApi(context, path, options = {}) {
  const token = await accessToken(context.state.supabase);
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Media request failed'), { status: response.status });
  return result;
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function validateMediaFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (!IMAGE_TYPES.has(mime) && !VIDEO_TYPES.has(mime)) throw new Error('Choose JPEG, PNG, WebP, AVIF, HEIC, MP4, WebM or QuickTime media.');
  const max = IMAGE_TYPES.has(mime) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > max) throw new Error(`The selected ${IMAGE_TYPES.has(mime) ? 'image' : 'video'} exceeds its governed size limit.`);
  return { mime, mediaType: IMAGE_TYPES.has(mime) ? 'image' : 'video' };
}

export function cloudinaryFormData(file, upload) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', String(upload.apiKey));
  ['asset_folder', 'discard_original_filename', 'invalidate', 'overwrite', 'public_id', 'tags', 'timestamp', 'type', 'unique_filename', 'upload_preset', 'use_filename'].forEach((key) => {
    if (upload[key] !== undefined) form.append(key, String(upload[key]));
  });
  form.append('signature', upload.signature);
  form.append('signature_algorithm', upload.signatureAlgorithm);
  return form;
}

async function completeWithRetry(context, reservationId) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await mediaApi(context, '/api/cms/media/complete', { method: 'POST', body: { reservationId } }); }
    catch (error) {
      last = error;
      if (error.status !== 409 || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw last;
}

function uploadForm(context) {
  const form = el('form', { class: 'data-form' });
  const file = input('file', '', { type: 'file', required: true, accept: [...IMAGE_TYPES, ...VIDEO_TYPES].join(',') });
  const output = messageNode();
  const submit = button('Upload for independent review', null, { type: 'submit' });
  form.append(
    notice('warning', 'Governed upload only', 'Originals remain authenticated. Child-identifiable media requires affirmative consent, independent safeguarding review and separate publication approval.'),
    field('Image or video', file, 'Images: maximum 10 MiB. Videos: maximum 50 MiB. SVG and executable formats are not accepted.'),
    field('Media title', input('title', '', { required: true, minlength: '2', maxlength: '180' })),
    field('Alternative text', textarea('alt_text', '', { required: true, minlength: '2', maxlength: '500', rows: 3 })),
    field('Source / provenance note', textarea('source_note', '', { required: true, minlength: '8', maxlength: '2000', rows: 3 }), 'State who supplied it and why the school may hold it. Do not put a consent document or private child details here.'),
    checkbox('child_identifiable', 'This media contains an identifiable child', false, 'The creator cannot review their own identifiable-child media.'),
    output, submit
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMutation(submit, output, async () => {
      const selected = file.files?.[0];
      const valid = validateMediaFile(selected);
      setMessage(output, 'Calculating a local integrity checksum…');
      const checksumSha256 = await sha256(selected);
      const values = new FormData(form);
      const signed = await mediaApi(context, '/api/cms/media/sign', {
        method: 'POST',
        body: {
          mediaType: valid.mediaType,
          mimeType: valid.mime,
          byteSize: selected.size,
          checksumSha256,
          title: String(values.get('title')).trim(),
          altText: String(values.get('alt_text')).trim(),
          sourceNote: String(values.get('source_note')).trim(),
          childIdentifiable: values.get('child_identifiable') === 'on'
        }
      });
      setMessage(output, 'Uploading to the authenticated school media environment…');
      const provider = await fetch(signed.upload.url, { method: 'POST', body: cloudinaryFormData(selected, signed.upload) });
      if (!provider.ok) throw new Error('The provider did not accept the governed upload. The retained reservation can be reviewed safely.');
      await completeWithRetry(context, signed.reservationId);
      await context.refresh('The upload was confirmed. It remains pending until independent review and publication approval.');
    });
  });
  return form;
}

function mediaPanel(context) {
  const { cms } = context.state;
  const selected = cms.media.find((item) => item.id === ui.selectedMediaId) || cms.media[0];
  if (selected) ui.selectedMediaId = selected.id;
  const cards = cms.media.map((item) => el('article', { class: `cms-media-card${item.id === selected?.id ? ' cms-media-card--selected' : ''}` },
    el('div', { class: 'cms-media-placeholder', text: item.provider_resource_type === 'video' ? 'Governed video' : 'Governed image' }),
    el('div', {}, el('h3', { text: item.title }), el('p', { text: item.alt_text }),
      el('div', { class: 'cms-entry-card__meta' }, badge(item.lifecycle_state), badge(item.provenance_status), item.child_identifiable ? badge('child identifiable') : badge('no child identified')),
      button('Review asset', () => { ui.selectedMediaId = item.id; context.rerender(); }, { small: true }))
  ));
  const detail = !selected ? empty('Media library is empty', 'No asset is created until an authorised upload succeeds and the provider confirms it.') : el('div', { class: 'cms-media-detail' },
    el('h3', { text: selected.title }),
    selected.child_identifiable && selected.created_by === context.state.profile.id
      ? notice('warning', 'Independent reviewer required', 'You created this identifiable-child asset, so the database will reject any attempt by you to review or approve it.') : null,
    el('dl', { class: 'cms-definition-list' },
      el('div', {}, el('dt', { text: 'Lifecycle' }), el('dd', {}, badge(selected.lifecycle_state))),
      el('div', {}, el('dt', { text: 'Provenance' }), el('dd', {}, badge(selected.provenance_status))),
      el('div', {}, el('dt', { text: 'Consent' }), el('dd', {}, badge(selected.consent_status))),
      el('div', {}, el('dt', { text: 'Safeguarding' }), el('dd', {}, badge(selected.safeguarding_status))),
      el('div', {}, el('dt', { text: 'Format / size' }), el('dd', { text: `${selected.original_mime_type || 'Awaiting confirmation'} · ${selected.byte_size ? `${Math.ceil(selected.byte_size / 1024)} KiB` : '—'}` })),
      el('div', {}, el('dt', { text: 'Retention' }), el('dd', { text: 'Manual only — no automatic deletion' }))
    ),
    context.state.features.media && selected.upload_completed_at ? button('Load transformed thumbnail', async (event) => {
      const buttonNode = event.currentTarget; buttonNode.disabled = true;
      try {
        const result = await mediaApi(context, `/api/cms/media/delivery?mediaId=${encodeURIComponent(selected.id)}&variant=${selected.provider_resource_type === 'video' ? 'poster' : 'thumb'}`);
        const image = el('img', { src: result.url, width: result.width, alt: selected.alt_text, class: 'cms-safe-thumbnail' });
        buttonNode.replaceWith(image);
      } catch { buttonNode.disabled = false; context.setStatus('The safe media derivative is unavailable while the media gate is closed.', true); }
    }, { secondary: true }) : null
  );

  if (selected && selected.upload_completed_at && !(selected.child_identifiable && selected.created_by === context.state.profile.id)) {
    const kinds = [];
    if (cms.capabilities.review || cms.capabilities.safeguarding_review) kinds.push({ value: 'provenance', label: 'Provenance' });
    if (cms.capabilities.safeguarding_review) kinds.push({ value: 'consent', label: 'Consent' }, { value: 'safeguarding', label: 'Safeguarding' });
    if (cms.capabilities.publish) kinds.push({ value: 'publication', label: 'Publication' });
    if (kinds.length) {
      const kindControl = select('kind', kinds, kinds[0].value);
      const decisionControl = select('decision', [], 'approved');
      const syncDecisions = () => {
        const choices = kindControl.value === 'consent'
          ? ['approved', 'denied', 'expired', 'not_required']
          : ['approved', 'rejected'];
        replace(decisionControl, choices.map((value) => el('option', { value, text: titleCase(value) })));
      };
      kindControl.addEventListener('change', syncDecisions);
      syncDecisions();
      detail.append(actionForm('Record independent media review', [
        field('Review kind', kindControl),
        field('Decision', decisionControl),
        field('Consent reference — required only for approved consent', input('reference', '', { maxlength: '500' }), 'The reference is stored privately and is never included in public projections or manifest responses.'),
        field('Detailed reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))
      ], 'Record media review', async (values) => {
        await context.rpc('cms_review_media', { p_media_id: selected.id, p_review_kind: values.get('kind'), p_decision: values.get('decision'), p_reference: String(values.get('reference') || '').trim() || null, p_reason: String(values.get('reason')).trim() });
        await context.refresh('The independent media review was recorded without exposing its private reference.');
      }));
    }
  }
  if (selected && (cms.capabilities.publish || cms.capabilities.administer) && !selected.archived_at) {
    detail.append(actionForm('Archive media without deleting the provider asset', [field('Archive reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))], 'Archive media', async (values) => {
      await context.rpc('cms_archive_media', { p_media_id: selected.id, p_reason: String(values.get('reason')).trim() });
      await context.refresh('The media record was archived. The provider asset and audit history were retained.');
    }));
  }

  const adminTools = cms.capabilities.administer && context.state.features.media ? el('div', { class: 'cms-admin-tools' },
    button('Check provider quota', async () => {
      try {
        const usage = await mediaApi(context, '/api/cms/media/usage');
        context.setStatus(`Cloudinary usage checked: highest metric ${usage.highestPercent ?? 'unavailable'} percent${usage.warning ? ' — warning threshold reached.' : '.'}`);
      } catch { context.setStatus('Provider quota is unavailable while the media gate is closed.', true); }
    }, { secondary: true }),
    button('Export retained manifest', async () => {
      try {
        const manifest = await mediaApi(context, '/api/cms/media/manifest?limit=500&offset=0');
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const link = el('a', { href: URL.createObjectURL(blob), download: 'treasure-academy-media-manifest.json' });
        document.body.append(link); link.click(); URL.revokeObjectURL(link.href); link.remove();
      } catch { context.setStatus('The retained media manifest could not be exported.', true); }
    }, { secondary: true })
  ) : null;

  return el('div', { class: 'cms-panel' },
    context.state.features.media && cms.capabilities.draft
      ? el('details', { class: 'form-panel' }, el('summary', { text: 'Upload governed media' }), uploadForm(context))
      : notice('info', 'Upload gate closed', 'The library remains available for review, but new provider uploads stay disabled until a separately authorised media acceptance window.'),
    adminTools,
    el('div', { class: 'cms-media-layout' }, el('div', { class: 'cms-media-grid' }, cards.length ? cards : empty('No governed media', 'The library starts empty and never imports historical child media automatically.')), detail)
  );
}

function accessPanel(context) {
  const { cms } = context.state;
  if (!cms.capabilities.administer) return notice('error', 'CMS administration unavailable', 'Only the Proprietress can grant or revoke explicit CMS capabilities.');
  const staff = (context.state.data.profiles || []).filter((item) => ['admin', 'teacher'].includes(item.role) && item.active && item.account_status === 'active');
  const form = el('form', { class: 'data-form' });
  const profileSelect = select('profile_id', staff.map((item) => ({ value: item.id, label: `${item.full_name} — ${item.position_title || titleCase(item.role)}` })), staff[0]?.id || '');
  const checks = {
    draft: checkbox('can_draft', 'Draft and revise content'),
    review: checkbox('can_review', 'Factual review'),
    publish: checkbox('can_publish', 'Publication authority'),
    safeguarding: checkbox('can_safeguarding_review', 'Safeguarding review'),
    emergency: checkbox('can_emergency_publish', 'Emergency publication', false, 'The server permits this only for the Proprietress.'),
    revoke: checkbox('revoke', 'Revoke explicit CMS capabilities', false, 'This does not alter the accepted leadership authority encoded by database policy.')
  };
  const sync = () => {
    const row = cms.capabilityRows.find((item) => item.profile_id === profileSelect.value && !item.revoked_at);
    checks.draft.querySelector('input').checked = row?.can_draft === true;
    checks.review.querySelector('input').checked = row?.can_review === true;
    checks.publish.querySelector('input').checked = row?.can_publish === true;
    checks.safeguarding.querySelector('input').checked = row?.can_safeguarding_review === true;
    checks.emergency.querySelector('input').checked = row?.can_emergency_publish === true;
    checks.revoke.querySelector('input').checked = false;
  };
  profileSelect.addEventListener('change', sync); sync();
  const output = messageNode();
  const submit = button('Record capability decision', null, { type: 'submit' });
  form.append(notice('warning', 'Capabilities are separate from school records', 'CMS authority does not grant access to pupil, payment, admission or school-operation records. Every change is append-only audited.'), field('Active staff profile', profileSelect), ...Object.values(checks), field('Recorded reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' })), output, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMutation(submit, output, async () => {
      const values = new FormData(form);
      await context.rpc('cms_set_capabilities', {
        p_profile_id: values.get('profile_id'), p_can_draft: values.get('can_draft') === 'on', p_can_review: values.get('can_review') === 'on',
        p_can_publish: values.get('can_publish') === 'on', p_can_safeguarding_review: values.get('can_safeguarding_review') === 'on',
        p_can_emergency_publish: values.get('can_emergency_publish') === 'on', p_reason: String(values.get('reason')).trim(), p_revoke: values.get('revoke') === 'on'
      });
      await context.refresh('The CMS capability decision was recorded in immutable history.');
    });
  });
  const rowsValue = cms.capabilityRows.map((item) => [profileName(context, item.profile_id), item.revoked_at ? badge('revoked') : badge('active'), item.can_draft ? 'Yes' : 'No', item.can_review ? 'Yes' : 'No', item.can_publish ? 'Yes' : 'No', item.can_safeguarding_review ? 'Yes' : 'No', displayDate(item.updated_at, true)]);
  return el('div', { class: 'cms-panel' }, form,
    table(['Staff member', 'State', 'Draft', 'Review', 'Publish', 'Safeguarding', 'Updated'], rowsValue, 'Explicit CMS capabilities') || empty('No explicit CMS capability grants', 'Accepted leadership and developer-information-review rules still apply directly through database policy.'),
    el('h3', { text: 'Capability audit' }),
    table(['Date', 'Profile', 'Action', 'Actor'], [...cms.capabilityEvents].reverse().map((item) => [displayDate(item.created_at, true), profileName(context, item.profile_id), titleCase(item.action), profileName(context, item.actor_id)]), 'CMS capability audit') || empty('No capability events', 'Every explicit grant, update or revocation will appear here.')
  );
}

function commentsPanel(context) {
  const { cms } = context.state;
  if (!cms.capabilities.comment_moderate) return notice('error', 'Leadership moderation required', 'Only accepted school leadership can review public comments.');
  const cards = cms.moderationComments.map((comment) => {
    const action = actionForm('Record moderation decision', [
      field('Decision', select('status', [
        { value: 'approved', label: 'Approve for public display' },
        { value: 'rejected', label: 'Reject' },
        { value: 'hidden', label: 'Hide' },
        { value: 'pending', label: 'Return to pending review' }
      ], comment.status === 'reported' ? 'hidden' : comment.status)),
      field('Immutable audit reason', textarea('reason', '', { required: true, minlength: '3', maxlength: '500' }), 'Record why the comment is safe to publish, rejected, hidden or returned to review.')
    ], 'Record decision', async (values) => {
      await context.rpc('cms_moderate_content_comment', {
        p_comment_id: comment.id,
        p_status: values.get('status'),
        p_reason: String(values.get('reason')).trim()
      });
      await context.refresh('The comment moderation decision was recorded in immutable history.');
    });
    const reports = asArray(comment.report_reasons);
    return el('article', { class: 'cms-entry-card cms-comment-card' },
      el('div', {},
        el('p', { class: 'eyebrow', text: `${comment.author_label} · ${comment.canonical_path}` }),
        el('h3', { text: comment.content_title }),
        el('p', { class: 'cms-comment-body', text: comment.body }),
        el('p', { text: `Submitted ${displayDate(comment.created_at, true)} · Updated ${displayDate(comment.updated_at, true)}` }),
        reports.length ? el('div', { class: 'alert alert--warning', role: 'status' }, el('span', { 'aria-hidden': 'true', text: '!' }), el('div', {},
          el('strong', { text: `${reports.length} signed-in concern${reports.length === 1 ? '' : 's'}` }),
          el('ul', {}, reports.map((report) => el('li', { text: `${report.reason} — ${displayDate(report.created_at, true)}` })))
        )) : null
      ),
      el('div', { class: 'cms-entry-card__meta' }, badge(comment.status), comment.report_count ? el('span', { text: `${comment.report_count} reports` }) : null),
      action
    );
  });
  return el('div', { class: 'cms-panel' },
    notice(context.state.features.comments ? 'info' : 'warning', context.state.features.comments ? 'Public comments gate active' : 'Public comments gate closed', context.state.features.comments ? 'Only approved comments are public; every decision remains audited.' : 'No new public comment operation is accepted while the exact-true gate is closed. The protected moderation history remains available.'),
    cards.length ? el('div', { class: 'cms-entry-list' }, cards) : empty('No comments to moderate', 'The system never creates anonymous comments. Signed-in parent or staff submissions will begin pending.'),
    el('h3', { text: 'Immutable moderation audit' }),
    table(['Date', 'Comment', 'From', 'To', 'Actor', 'Reason'], [...cms.commentEvents].reverse().map((item) => [displayDate(item.created_at, true), item.comment_id, titleCase(item.previous_status), badge(item.new_status), profileName(context, item.actor_id), item.reason]), 'Comment moderation audit') || empty('No moderation decisions', 'Submission alone does not publish a comment. Every later state change will appear here.')
  );
}

function placementsPanel(context) {
  const { cms } = context.state;
  if (!cms.capabilities.publish) return notice('error', 'Publication authority required', 'Only accepted CMS publishers can control homepage placements.');
  const published = cms.entries.filter((entry) => entry.workflow_status === 'published' && entry.published_revision_id);
  const labelFor = (entry) => `${revisionForEntry(cms, entry, entry.published_revision_id)?.title || entry.slug} — ${entry.canonical_path}`;
  const form = el('form', { class: 'data-form' });
  const slotKey = select('slot_key', [
    { value: 'home.news', label: 'Homepage News' },
    { value: 'home.event', label: 'Homepage Event' },
    { value: 'home.alert', label: 'Homepage alert' }
  ], 'home.news');
  const slotPosition = select('slot_position', [
    { value: '0', label: 'Position 1' }, { value: '1', label: 'Position 2' }, { value: '2', label: 'Position 3' }
  ], '0');
  const entrySelect = select('entry_id', [], '');
  const syncEntries = () => {
    const needed = slotKey.value === 'home.news' ? 'news' : slotKey.value === 'home.event' ? 'event' : null;
    const allowed = published.filter((entry) => needed ? entry.content_type === needed : ['announcement', 'news'].includes(entry.content_type));
    replace(entrySelect, ...allowed.map((entry) => el('option', { value: entry.id, text: labelFor(entry) })));
    slotPosition.disabled = slotKey.value === 'home.alert';
    if (slotKey.value === 'home.alert') slotPosition.value = '0';
  };
  slotKey.addEventListener('change', syncEntries); syncEntries();
  const output = messageNode();
  const submit = button('Record homepage placement', null, { type: 'submit' });
  form.append(
    notice('info', 'Placement is separate from publication', 'A placement can reference only a currently public revision. Likes, views and comments never influence this list or publication authority.'),
    field('Homepage area', slotKey), field('Position', slotPosition), field('Published content', entrySelect),
    checkbox('active', 'Placement active', true, 'Turning this off records an audited deactivation and does not unpublish the source content.'),
    field('Optional effective time — Africa/Lagos', input('effective_from', '', { type: 'datetime-local' })),
    field('Optional expiry time — Africa/Lagos', input('expires_at', '', { type: 'datetime-local' })),
    field('Immutable placement reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' })),
    output, submit
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runMutation(submit, output, async () => {
      const values = new FormData(form);
      if (!values.get('entry_id')) throw new Error('Choose published content that matches the selected homepage area.');
      await context.rpc('cms_set_site_slot', {
        p_slot_key: values.get('slot_key'), p_slot_position: Number(values.get('slot_position')),
        p_entry_id: values.get('entry_id'), p_active: values.get('active') === 'on',
        p_effective_from: lagosIso(values.get('effective_from')) || null,
        p_expires_at: lagosIso(values.get('expires_at')) || null,
        p_reason: String(values.get('reason')).trim()
      });
      await context.refresh('The audited homepage placement decision was recorded.');
    });
  });
  return el('div', { class: 'cms-panel' },
    notice(context.state.features.placements ? 'info' : 'warning', context.state.features.placements ? 'CMS homepage placements active' : 'CMS homepage placements gate closed', context.state.features.placements ? 'Effective active slots are eligible to replace coded homepage cards.' : 'Placement decisions can be prepared and reviewed, but the homepage continues using its coded fallback.'),
    form,
    el('h3', { text: 'Current placement records' }),
    table(['Area', 'Position', 'Content', 'State', 'Effective', 'Expires'], cms.siteSlots.map((slot) => {
      const entry = cms.entries.find((item) => item.id === slot.entry_id);
      return [titleCase(slot.slot_key), Number(slot.slot_position) + 1, entry ? labelFor(entry) : 'Former content', badge(slot.active ? 'active' : 'inactive'), displayDate(slot.effective_from, true), displayDate(slot.expires_at, true)];
    }), 'Homepage placement records') || empty('No CMS placements', 'The homepage retains its existing reviewed fallback until an authorised publisher records placements and the public gate is explicitly activated.'),
    el('h3', { text: 'Placement audit' }),
    table(['Date', 'Area', 'Position', 'Action', 'Actor', 'Reason'], [...cms.siteSlotEvents].reverse().map((item) => [displayDate(item.created_at, true), titleCase(item.slot_key), Number(item.slot_position) + 1, badge(item.action), profileName(context, item.actor_id), item.reason]), 'Homepage placement audit') || empty('No placement events', 'Every set or deactivation decision will be retained here.')
  );
}

function pageSurfacePanel(context) {
  const { cms } = context.state;
  const published = cms.entries.filter((entry) =>
    entry.content_type === 'page' && entry.workflow_status === 'published' && entry.published_revision_id
  );
  let formNode = null;
  if (cms.capabilities.publish) {
    const form = el('form', { class: 'data-form' });
    const surfaceSelect = select('surface_id', [
      { value: '', label: 'Create a new public Page binding' },
      ...cms.pageSurfaces.map((surface) => ({ value: surface.id, label: `${surface.page_path} — ${titleCase(surface.render_mode)}` }))
    ], '');
    const pathSelect = select('page_path', PUBLIC_PAGE_PATHS, '/about');
    const entrySelect = select('entry_id', published.map((entry) => {
      const revision = revisionForEntry(cms, entry, entry.published_revision_id);
      return { value: entry.id, label: `${revision?.title || entry.slug} — ${entry.canonical_path}` };
    }), '', { required: true });
    const modeNotice = notice('info', 'Editorial replacement', 'This ordinary information page can use the published Page as its main content. The reviewed static page remains the fail-safe fallback.');
    const syncMode = () => {
      const supplementary = SUPPLEMENT_PAGE_PATHS.has(pathSelect.value);
      modeNotice.className = `alert alert--${supplementary ? 'warning' : 'info'}`;
      modeNotice.replaceChildren(
        el('span', { 'aria-hidden': 'true', text: supplementary ? '!' : 'i' }),
        el('div', {},
          el('strong', { text: supplementary ? 'Protected supplementary content' : 'Editorial replacement' }),
          el('p', { text: supplementary
            ? 'This route keeps its fixed form, privacy or transaction controls. The published Page appears as reviewed current information without replacing the safety shell.'
            : 'This ordinary information page can use the published Page as its main content. The reviewed static page remains the fail-safe fallback.' })
        )
      );
    };
    const syncSurface = () => {
      const current = cms.pageSurfaces.find((surface) => surface.id === surfaceSelect.value);
      if (!current) { syncMode(); return; }
      pathSelect.value = current.page_path;
      entrySelect.value = current.entry_id;
      form.querySelector('[name="active"]').checked = current.active === true;
      syncMode();
    };
    surfaceSelect.addEventListener('change', syncSurface);
    pathSelect.addEventListener('change', syncMode);
    const output = messageNode();
    const submit = button('Save reviewed public Page binding', null, { type: 'submit', disabled: !published.length });
    form.append(
      notice(context.state.features.publicPages ? 'info' : 'warning',
        context.state.features.publicPages ? 'Dynamic public Pages active' : 'Dynamic public Pages gate closed',
        context.state.features.publicPages
          ? 'Only an effective owner-published binding can replace or supplement a public page.'
          : 'Bindings can be prepared and audited without changing any public page. Preview activation remains a separate release decision.'),
      field('Existing binding', surfaceSelect),
      field('Fixed public route', pathSelect, 'The route list is code-owned. Editors cannot create a private, portal or arbitrary public route.'),
      modeNotice,
      field('Published Page', entrySelect, 'Only an independently reviewed and already-published CMS Page can be selected.'),
      checkbox('active', 'Binding active when the separate public gate is enabled', true),
      field('Optional effective time — Africa/Lagos', input('effective_from', '', { type: 'datetime-local' })),
      field('Optional expiry time — Africa/Lagos', input('expires_at', '', { type: 'datetime-local' })),
      field('Immutable publication reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' })),
      output, submit
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runMutation(submit, output, async () => {
        const values = new FormData(form);
        if (!values.get('entry_id')) throw new Error('Choose an already-published CMS Page.');
        await context.rpc('cms_set_page_surface', {
          p_surface_id: values.get('surface_id') || null,
          p_page_path: values.get('page_path'),
          p_entry_id: values.get('entry_id'),
          p_active: values.get('active') === 'on',
          p_effective_from: lagosIso(values.get('effective_from')) || null,
          p_expires_at: lagosIso(values.get('expires_at')) || null,
          p_reason: String(values.get('reason')).trim()
        });
        await context.refresh('The reviewed public Page binding was recorded. Gate activation remains separate.');
      });
    });
    syncMode();
    formNode = form;
  }

  const rowsData = cms.pageSurfaces.map((surface) => {
    const entry = cms.entries.find((record) => record.id === surface.entry_id);
    const revision = entry ? revisionForEntry(cms, entry, entry.published_revision_id) : null;
    return [surface.page_path, badge(surface.render_mode), revision?.title || entry?.canonical_path || 'Former Page', badge(surface.active ? 'active' : 'inactive'), displayDate(surface.effective_from, true), displayDate(surface.expires_at, true)];
  });
  return el('div', { class: 'cms-panel' },
    notice('info', 'Static fail-safe retained', 'A public Page is displayed only after draft, independent review, leadership publication, route binding and separate gate activation. If the service is unavailable, the complete reviewed static page remains visible.'),
    formNode || notice('warning', 'Publication authority required', 'Staff with drafting access can prepare Page revisions. Only accepted leadership publishers can bind a published Page to a public route.'),
    el('h3', { text: 'Public Page bindings' }),
    table(['Public route', 'Mode', 'Published Page', 'State', 'Effective', 'Expires'], rowsData, 'Dynamic public Page bindings')
      || empty('No public Page bindings', 'Load the held public Page manifest, verify and import candidates as drafts, complete review and publication, then bind each accepted Page here.'),
    el('h3', { text: 'Public Page audit' }),
    table(['Date', 'Route', 'Mode', 'Action', 'Actor', 'Reason'], [...cms.pageSurfaceEvents].reverse().map((event) => [
      displayDate(event.created_at, true), event.page_path, badge(event.render_mode), badge(event.action), profileName(context, event.actor_id), event.reason
    ]), 'Dynamic public Page audit') || empty('No public Page decisions', 'Every binding, update and deactivation decision will be retained here.')
  );
}

function migrationPanel(context) {
  const { cms } = context.state;
  let stagingForm = null;
  if (cms.capabilities.draft) {
    let manifestCandidates = [];
    const form = el('form', { class: 'data-form' });
    const fileInput = input('manifest', '', { type: 'file', accept: 'application/json,.json', required: true });
    const candidateSelect = select('candidate', [{ value: '', label: 'Load the generated held manifest first' }], '', { disabled: true, required: true });
    const summary = notice('info', 'No manifest loaded', 'Choose the generated run10-held-candidates.json file. Loading it locally does not send or stage anything.');
    const output = messageNode();
    const submit = button('Stage selected held candidate', null, { type: 'submit', disabled: true });
    const resetManifest = (message, error = false) => {
      manifestCandidates = [];
      replace(candidateSelect, el('option', { value: '', text: 'Load the generated held manifest first' }));
      candidateSelect.disabled = true; submit.disabled = true;
      summary.replaceChildren(
        el('span', { 'aria-hidden': 'true', text: error ? '×' : 'i' }),
        el('div', {}, el('strong', { text: error ? 'Manifest rejected' : 'No manifest loaded' }), el('p', { text: message }))
      );
      summary.className = `alert alert--${error ? 'error' : 'info'}`;
    };
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) { resetManifest('Choose the generated run10-held-candidates.json file.'); return; }
      try {
        if (file.size > 512 * 1024) throw new Error('The manifest exceeds the 512 KiB staging limit.');
        const manifest = JSON.parse(await file.text());
        if (manifest?.version !== 1 || manifest?.all_candidates_held !== true || !Array.isArray(manifest?.candidates)
            || manifest.candidates.length < 1 || manifest.candidates.length > 200
            || manifest.candidate_count !== manifest.candidates.length) throw new Error('The file is not a supported held-candidate manifest.');
        if (manifest.candidates.some((item) => item?.verification_status !== 'held' || item?.verification_required !== true
            || item?.media_imported !== false || !/^[a-f0-9]{64}$/.test(item?.source_sha256 || '')
            || !item?.document || !Array.isArray(item.document.blocks)
            || (item.document.media && item.document.media.length))) throw new Error('Every candidate must remain held, text-only and source-hashed.');
        manifestCandidates = manifest.candidates;
        replace(candidateSelect, el('option', { value: '', text: 'Choose one held candidate' }), ...manifestCandidates.map((item, index) => el('option', { value: index, text: `${item.content_type}: ${item.document.title} — ${item.source_locator}` })));
        candidateSelect.disabled = false; submit.disabled = false;
        summary.className = 'alert alert--warning';
        summary.replaceChildren(
          el('span', { 'aria-hidden': 'true', text: '!' }),
          el('div', {}, el('strong', { text: `${manifestCandidates.length} held candidates loaded locally` }), el('p', { text: 'Staging one record preserves held status. It does not verify, import or publish the wording.' }))
        );
      } catch (error) { resetManifest(error.message || 'The manifest could not be read.', true); }
    });
    form.append(
      notice('warning', 'Controlled staging only', 'Use only the deterministic repository-generated manifest. Select one record at a time and give an immutable staging reason. Verification and draft import remain separate decisions.'),
      field('Held migration manifest', fileInput, 'The file is parsed in this browser and is sent only when you stage the selected candidate.'),
      summary,
      field('Held candidate', candidateSelect),
      field('Immutable staging reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' })),
      output, submit
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runMutation(submit, output, async () => {
        const values = new FormData(form);
        const candidate = manifestCandidates[Number(values.get('candidate'))];
        if (!candidate) throw new Error('Choose a candidate from the loaded held manifest.');
        await context.rpc('cms_stage_content_candidate', {
          p_source_key: candidate.source_key, p_source_kind: candidate.source_kind,
          p_source_locator: candidate.source_locator, p_source_sha256: candidate.source_sha256,
          p_content_type: candidate.content_type, p_slug: candidate.slug, p_document: candidate.document,
          p_historical_child_media_held: candidate.historical_child_media_held !== false,
          p_reason: String(values.get('reason')).trim()
        });
        await context.refresh('One source-hashed candidate was staged as held. It was not verified, imported or published.');
      });
    });
    stagingForm = form;
  }

  const candidateCards = cms.migrationCandidates.map((candidate) => {
    let action = null;
    if (candidate.status === 'held' && cms.capabilities.publish) {
      action = actionForm('Verify or reject source', [
        field('Decision', select('decision', [{ value: 'verified', label: 'Verified for draft import' }, { value: 'rejected', label: 'Reject this candidate' }], 'verified')),
        field('Immutable verification reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }))
      ], 'Record source decision', async (values) => {
        await context.rpc('cms_verify_content_candidate', { p_candidate_id: candidate.id, p_decision: values.get('decision'), p_reason: String(values.get('reason')).trim() });
        await context.refresh('The source-verification decision was recorded. No content was published.');
      });
    } else if (candidate.status === 'verified' && cms.capabilities.draft) {
      action = actionForm('Import as an ordinary draft', [
        field('Immutable import reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' }), 'Import retains the source hash and still requires the normal independent review and publication workflow.')
      ], 'Import verified text as draft', async (values) => {
        await context.rpc('cms_import_verified_candidate', { p_candidate_id: candidate.id, p_reason: String(values.get('reason')).trim() });
        await context.refresh('Verified text was imported as a draft. It is not public.');
      });
    }
    return el('article', { class: 'cms-entry-card' },
      el('div', {}, el('p', { class: 'eyebrow', text: `${titleCase(candidate.source_kind)} · ${candidate.content_type}` }),
        el('h3', { text: candidate.slug }), el('p', { text: candidate.source_locator }),
        el('p', { text: `SHA-256 ${candidate.source_sha256}` }),
        candidate.historical_child_media_held ? notice('warning', 'Historical media held', 'This candidate carries text only. No historical image or video relationship can be imported through this workflow.') : null),
      el('div', { class: 'cms-entry-card__meta' }, badge(candidate.status), el('span', { text: displayDate(candidate.staged_at, true) })),
      action
    );
  });

  let coreForm = null;
  if (cms.capabilities.publish) {
    const published = cms.entries.filter((entry) => entry.workflow_status === 'published' && entry.published_revision_id && ['page', 'announcement'].includes(entry.content_type));
    const choices = [{ value: '', label: 'Create a new slot' }, ...cms.coreSlots.map((slot) => ({ value: slot.id, label: `${slot.page_path} · ${titleCase(slot.mount_key)} ${Number(slot.slot_position) + 1}` }))];
    const pagePaths = ['/about', '/academics', '/admissions', '/fees', '/contact', '/calendar', '/exams', '/transport', '/uniform', '/shop', '/pta', '/careers', '/privacy', '/safeguarding', '/credits', '/request-centre'];
    const form = el('form', { class: 'data-form' });
    const slotSelect = select('slot_id', choices, '');
    const pageSelect = select('page_path', pagePaths, '/about');
    const mountSelect = select('mount_key', ['notice', 'intro', 'guidance'], 'guidance');
    const positionSelect = select('slot_position', [{ value: '0', label: 'Position 1' }, { value: '1', label: 'Position 2' }, { value: '2', label: 'Position 3' }], '0');
    const entrySelect = select('entry_id', published.map((entry) => ({ value: entry.id, label: `${revisionForEntry(cms, entry, entry.published_revision_id)?.title || entry.slug} — ${entry.canonical_path}` })), '');
    const sync = () => {
      const current = cms.coreSlots.find((slot) => slot.id === slotSelect.value);
      if (!current) return;
      pageSelect.value = current.page_path; mountSelect.value = current.mount_key; positionSelect.value = String(current.slot_position); entrySelect.value = current.entry_id;
      form.querySelector('[name="active"]').checked = current.active === true;
    };
    slotSelect.addEventListener('change', sync);
    const output = messageNode();
    const submit = button('Record core-page slot', null, { type: 'submit', disabled: !published.length });
    form.append(notice('info', 'Fixed safe mounts only', 'Core slots accept only already-published Page or Announcement records on an allowlisted page and render structured blocks without raw HTML.'),
      field('Existing slot (optional)', slotSelect), field('Core page', pageSelect), field('Mount', mountSelect), field('Position', positionSelect), field('Published content', entrySelect),
      checkbox('active', 'Slot active', true),
      field('Optional effective time — Africa/Lagos', input('effective_from', '', { type: 'datetime-local' })),
      field('Optional expiry time — Africa/Lagos', input('expires_at', '', { type: 'datetime-local' })),
      field('Immutable placement reason', textarea('reason', '', { required: true, minlength: '8', maxlength: '500' })), output, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runMutation(submit, output, async () => {
        const values = new FormData(form);
        if (!values.get('entry_id')) throw new Error('Choose an already-published Page or Announcement.');
        await context.rpc('cms_set_core_page_slot', {
          p_slot_id: values.get('slot_id') || null, p_page_path: values.get('page_path'), p_mount_key: values.get('mount_key'),
          p_position: Number(values.get('slot_position')), p_entry_id: values.get('entry_id'), p_active: values.get('active') === 'on',
          p_effective_from: lagosIso(values.get('effective_from')) || null, p_expires_at: lagosIso(values.get('expires_at')) || null,
          p_reason: String(values.get('reason')).trim()
        });
        await context.refresh('The audited core-page slot decision was recorded.');
      });
    });
    coreForm = form;
  }

  return el('div', { class: 'cms-panel' },
    notice(context.state.features.publicSearch ? 'info' : 'warning', context.state.features.publicSearch ? 'Database Search gate active' : 'Database Search gate closed', context.state.features.publicSearch ? 'Search uses current published projections and source links.' : 'The existing local fallback remains authoritative until verified content and Search parity are accepted.'),
    notice(context.state.features.coreSlots ? 'info' : 'warning', context.state.features.coreSlots ? 'Core-page slots active' : 'Core-page slots gate closed', context.state.features.coreSlots ? 'Effective reviewed slots can appear on allowlisted core pages.' : 'No database core slot is displayed while the gate is closed.'),
    notice(context.state.features.publicInventory ? 'info' : 'warning', context.state.features.publicInventory ? 'Public inventory availability active' : 'Public inventory gate closed', context.state.features.publicInventory ? 'Only reconciled office-authoritative availability states are eligible.' : 'No legacy product, route or quantity is treated as current public availability.'),
    el('h3', { text: 'Controlled manifest staging' }),
    stagingForm || notice('warning', 'Draft authority required', 'Only an accepted CMS drafter can stage a source-hashed candidate. Staging remains held and cannot publish content.'),
    el('h3', { text: 'Source-hashed migration candidates' }),
    candidateCards.length ? el('div', { class: 'cms-entry-list' }, candidateCards) : empty('No staged candidates', 'The held repository manifest creates no database row. Candidates appear only after a separately controlled staging action.'),
    el('h3', { text: 'Stale-content review queue' }),
    table(['Due', 'State', 'Kind', 'Title', 'Public path'], cms.reviewQueue.map((item) => [displayDate(item.review_due), badge(item.state), titleCase(item.source_kind), item.title, item.public_path || '—']), 'Stale-content review queue') || empty('No review due within 30 days', 'Published CMS and verified-information review dates are checked automatically.'),
    el('h3', { text: 'Safe core-page slots' }), coreForm || notice('warning', 'Publication authority required', 'Only an accepted CMS publisher can set or deactivate a core-page slot.'),
    table(['Page', 'Mount', 'Position', 'Content', 'State', 'Expires'], cms.coreSlots.map((slot) => {
      const entry = cms.entries.find((item) => item.id === slot.entry_id);
      return [slot.page_path, titleCase(slot.mount_key), Number(slot.slot_position) + 1, entry?.canonical_path || 'Former content', badge(slot.active ? 'active' : 'inactive'), displayDate(slot.expires_at, true)];
    }), 'Core-page slot records') || empty('No core-page slots', 'Existing static guidance remains visible until reviewed source-backed slots are prepared and separately activated.'),
    el('h3', { text: 'Migration and core-slot audit' }),
    table(['Date', 'Candidate', 'Action', 'Actor', 'Reason'], [...cms.migrationEvents].reverse().map((item) => [displayDate(item.created_at, true), item.candidate_id, badge(item.action), profileName(context, item.actor_id), item.reason]), 'Content migration audit') || empty('No migration events', 'Staging, verification, rejection and draft import are retained independently.'),
    table(['Date', 'Page', 'Mount', 'Position', 'Action', 'Actor', 'Reason'], [...cms.coreSlotEvents].reverse().map((item) => [displayDate(item.created_at, true), item.page_path, titleCase(item.mount_key), Number(item.slot_position) + 1, badge(item.action), profileName(context, item.actor_id), item.reason]), 'Core-page slot audit') || empty('No core-slot events', 'Every set or deactivation decision will appear here.')
  );
}

function auditPanel(context) {
  const { cms } = context.state;
  return el('div', { class: 'cms-panel' },
    notice('info', 'Append-only evidence', 'CMS audit displays workflow decisions without passwords, OTPs, provider credentials, raw consent references or private child records.'),
    el('h3', { text: 'Publication workflow' }),
    table(['Date', 'Content', 'Action', 'From', 'To', 'Actor'], [...cms.publicationEvents].reverse().map((item) => {
      const entry = cms.entries.find((record) => record.id === item.entry_id);
      return [displayDate(item.created_at, true), entry?.canonical_path || 'Former content', titleCase(item.action), titleCase(item.previous_status || 'new'), badge(item.new_status), profileName(context, item.actor_id)];
    }), 'CMS publication audit') || empty('No publication history', 'Draft, review, schedule, publication, archive and route changes will be recorded here.'),
    el('h3', { text: 'Approvals' }),
    table(['Date', 'Content', 'Kind', 'Decision', 'Reviewer', 'Reason'], [...cms.approvals].reverse().map((item) => {
      const entry = cms.entries.find((record) => record.id === item.entry_id);
      return [displayDate(item.created_at, true), entry?.canonical_path || 'Former content', titleCase(item.approval_kind), badge(item.decision), profileName(context, item.reviewer_id), item.reason];
    }), 'CMS approval audit') || empty('No approval history', 'Review decisions will be listed after a draft enters workflow.'),
    el('h3', { text: 'Quality findings' }),
    table(['Date', 'Revision', 'Finding', 'Severity', 'Status', 'Resolved'], cms.findings.map((item) => [displayDate(item.created_at, true), item.revision_id, titleCase(item.finding_code), badge(item.severity), badge(item.status), item.resolved_at ? displayDate(item.resolved_at, true) : 'No']), 'CMS quality findings') || empty('No recorded quality findings', 'Server-side quality checks can add findings without changing immutable revision content.')
  );
}

export function renderCmsWorkspace(context) {
  const cms = context.state.cms;
  if (!canUseCms(cms)) return notice('error', 'Website CMS unavailable', cms?.error ? 'The protected CMS could not be loaded. Public content was not changed.' : 'This account has no private CMS visibility capability.');
  const previewHost = el('div', { class: 'cms-global-preview', 'aria-live': 'polite' });
  const rerender = () => context.rerender();
  const workspaceContext = { ...context, cms, previewHost, rerender };
  const panels = [
    ['content', 'Content'], ['workflow', 'Review & publish'], ['media', 'Media library']
  ];
  if (cms.capabilities.comment_moderate) panels.push(['comments', 'Comments']);
  if (cms.capabilities.publish) panels.push(['placements', 'Homepage'], ['pages', 'Public Pages']);
  panels.push(['migration', 'Migration & freshness']);
  panels.push(['audit', 'Audit']);
  if (cms.capabilities.administer) panels.push(['access', 'Access']);
  if (!panels.some(([key]) => key === ui.panel)) ui.panel = 'content';
  const nav = el('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': 'Website CMS sections' }, panels.map(([key, label]) => button(label, () => { ui.panel = key; rerender(); }, { small: false, secondary: ui.panel !== key })));
  nav.querySelectorAll('button').forEach((node, index) => { node.setAttribute('role', 'tab'); node.setAttribute('aria-selected', String(panels[index][0] === ui.panel)); node.className = panels[index][0] === ui.panel ? 'hub-tab hub-tab--active' : 'hub-tab'; });
  const capabilityText = Object.entries(cms.capabilities).filter(([, enabled]) => enabled).map(([name]) => titleCase(name)).join(' · ');
  let panel;
  if (ui.panel === 'workflow') panel = workflowPanel(workspaceContext);
  else if (ui.panel === 'media') panel = mediaPanel(workspaceContext);
  else if (ui.panel === 'comments') panel = commentsPanel(workspaceContext);
  else if (ui.panel === 'placements') panel = placementsPanel(workspaceContext);
  else if (ui.panel === 'pages') panel = pageSurfacePanel(workspaceContext);
  else if (ui.panel === 'migration') panel = migrationPanel(workspaceContext);
  else if (ui.panel === 'audit') panel = auditPanel(workspaceContext);
  else if (ui.panel === 'access') panel = accessPanel(workspaceContext);
  else panel = contentPanel(workspaceContext);
  return el('section', { class: 'portal-section cms-workspace', 'aria-labelledby': 'cms-title' },
    el('div', { class: 'section-heading' }, el('p', { class: 'eyebrow', text: 'Protected workspace' }), el('h2', { id: 'cms-title', text: 'Website CMS' }), el('p', { text: 'Draft, review and manage first-party public content without granting broader school-record access. Nothing in this workspace bypasses database capability checks.' })),
    el('p', { class: 'cms-capability-summary', text: `Current CMS capabilities: ${capabilityText || 'none'}` }),
    nav,
    el('div', { role: 'tabpanel', class: 'hub-panel' }, panel)
  );
}
