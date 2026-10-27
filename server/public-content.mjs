import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSignedCloudinaryDeliveryUrl } from './cms-media.mjs';
import { FIXED_SITEMAP_ROUTES } from './public-routes.generated.mjs';

const SITE_ORIGIN = 'https://www.treasureacademyageva.com';
const SITE_NAME = 'Treasure Academy, Ageva';
const LAGOS_TIME_ZONE = 'Africa/Lagos';
const PAGE_SIZE = 9;
const GALLERY_PAGE_SIZE = 24;
const MAX_PUBLIC_ENTRIES = 500;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_GALLERY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*-media-[a-f0-9]{12}$/;
const ENTRY_COLUMNS = 'id,content_type,slug,canonical_path,published_at,revision_id,revision_number,title,summary,category,search_keywords,content_language,locale,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,effective_from,expires_at,event_starts_at,event_ends_at,event_timezone,event_venue,event_public_address,event_status,attendance_mode,public_action_label,public_action_path';
const BLOCK_COLUMNS = 'id,revision_id,block_position,block_type,payload';
const MEDIA_COLUMNS = 'revision_id,placement,placement_position,caption,media_id,provider,provider_asset_id,media_type,title,alt_text,attribution,width,height,duration_seconds,public_derivative_only,provider_version,original_format';
const TAG_COLUMNS = 'revision_id,tag_id,slug,name';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safeInternalPath(value, fallback = '/') {
  const path = String(value || '');
  return /^\/[a-zA-Z0-9/_?#=&.%-]*$/.test(path) && !path.includes('//') && !/(^|\/)\.\.(\/|$)/.test(path)
    ? path : fallback;
}

function absoluteUrl(path) {
  return new URL(safeInternalPath(path), SITE_ORIGIN).href;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029'
  })[character]);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function sitemapDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10);
}

export function sitemapXml(entries = [], gallery = []) {
  const routes = new Map();
  const add = (path, lastmod, changefreq = 'weekly', priority = 0.7) => {
    const safe = safeInternalPath(path, '');
    if (!safe || safe.includes('?') || safe.includes('#') || /(?:\/page\/|\/feed\.xml$|\/archive$)/.test(safe)) return;
    const former = routes.get(safe);
    const nextDate = String(lastmod || '');
    if (!former || nextDate > former.lastmod) routes.set(safe, { path: safe, lastmod: nextDate, changefreq, priority });
  };
  FIXED_SITEMAP_ROUTES.forEach((row) => add(row.canonical, row.lastmod, row.changefreq, row.priority));
  entries.forEach((entry) => {
    if (!['news', 'event'].includes(String(entry?.content_type || ''))) return;
    const path = String(entry?.canonical_path || '');
    if (!/^\/(?:news|events)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return;
    add(path, sitemapDate(entry.published_at), 'weekly', 0.8);
  });
  const latestEntryDate = entries.map((entry) => sitemapDate(entry?.published_at)).filter(Boolean).sort().at(-1) || '';
  if (entries.some((entry) => entry?.content_type === 'event')) add('/events', latestEntryDate, 'daily', 0.8);
  if (gallery.length) {
    add('/gallery', latestEntryDate, 'daily', 0.7);
    gallery.forEach((item) => add(`/gallery/${item.gallerySlug}`, sitemapDate(item.source?.published_at), 'weekly', 0.6));
  }
  const body = [...routes.values()].sort((a, b) => a.path.localeCompare(b.path)).map((row) => {
    const modified = row.lastmod ? `\n    <lastmod>${escapeXml(row.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(absoluteUrl(row.path))}</loc>${modified}\n    <changefreq>${row.changefreq}</changefreq>\n    <priority>${Number(row.priority).toFixed(1)}</priority>\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=30'
        : 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers
    }
  });
}

function redirect(path, status = 308) {
  return new Response(null, {
    status,
    headers: {
      Location: safeInternalPath(path),
      'Cache-Control': status === 308 ? 'public, max-age=3600' : 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function lagosFormatter(options) {
  return new Intl.DateTimeFormat('en-NG', { timeZone: LAGOS_TIME_ZONE, ...options });
}

export function formatLagosDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return lagosFormatter(withTime
    ? { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function lagosYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return lagosFormatter({ year: 'numeric' }).format(date);
}

export function relativeTime(value, now = new Date()) {
  const date = new Date(value);
  const current = new Date(now);
  if (Number.isNaN(date.valueOf()) || Number.isNaN(current.valueOf())) return '';
  const seconds = Math.max(0, Math.floor((current - date) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 21) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  return formatLagosDate(date);
}

export function eventLifecycle(entry, now = new Date()) {
  const status = String(entry?.event_status || 'scheduled');
  const statusLabels = {
    postponed: 'Event postponed',
    cancelled: 'Event cancelled',
    moved_online: 'Event moved online',
    completed: 'Event ended'
  };
  if (statusLabels[status]) return { key: status, label: statusLabels[status], archived: ['cancelled', 'completed'].includes(status) };
  const starts = new Date(entry?.event_starts_at || '');
  const ends = new Date(entry?.event_ends_at || '');
  const current = new Date(now);
  if (Number.isNaN(starts.valueOf())) return { key: 'unavailable', label: 'Date confirmation unavailable', archived: false };
  if (!Number.isNaN(ends.valueOf()) && current > ends) {
    return { key: 'ended', label: 'Event ended', archived: true };
  }
  if (current >= starts && !Number.isNaN(ends.valueOf()) && current <= ends) {
    return { key: 'happening', label: 'Happening now', archived: false };
  }
  if (current >= starts && Number.isNaN(ends.valueOf())) {
    return { key: 'started_unconfirmed', label: 'Event start time passed — confirm current status', archived: false };
  }
  const minutes = Math.max(0, Math.ceil((starts - current) / 60000));
  if (minutes > 1440) {
    const days = Math.ceil(minutes / 1440);
    return { key: 'upcoming', label: `${days} day${days === 1 ? '' : 's'} to go`, archived: false };
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const detail = [hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '', remainder ? `${remainder} minute${remainder === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(' ');
  return { key: 'soon', label: `Starts in ${detail || 'less than a minute'}`, archived: false };
}

function blockPlainText(block) {
  const payload = block?.payload || {};
  if (['paragraph', 'heading', 'quote', 'callout', 'verified_fact'].includes(block?.block_type)) return String(payload.text || '');
  if (['ordered_list', 'unordered_list'].includes(block?.block_type)) return Array.isArray(payload.items) ? payload.items.join(' ') : '';
  if (block?.block_type === 'table') {
    return [...(Array.isArray(payload.headers) ? payload.headers : []), ...(Array.isArray(payload.rows) ? payload.rows.flat() : [])].join(' ');
  }
  return '';
}

export function readingMinutes(blocks) {
  const words = (blocks || []).map(blockPlainText).join(' ').trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
  return Math.max(1, Math.ceil(words.length / 225));
}

function checkedRows(result) {
  if (result?.error) throw result.error;
  return result?.data || [];
}

function createRepository(env = process.env, createClientImpl = createClient) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '');
  if (!url || !key) throw new Error('public_content_configuration');
  const client = createClientImpl(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'treasure-academy-public-content/1.0' } }
  });
  const inRows = async (view, columns, field, values, order) => {
    if (!values.length) return [];
    let query = client.from(view).select(columns).in(field, values);
    if (order) query = query.order(order, { ascending: true });
    return checkedRows(await query.limit(5000));
  };
  return {
    async listEntries(type) {
      const result = await client.from('public_cms_published_entries').select(ENTRY_COLUMNS)
        .eq('content_type', type).order('published_at', { ascending: false }).limit(MAX_PUBLIC_ENTRIES);
      return checkedRows(result);
    },
    async findEntry(type, slug) {
      const result = await client.from('public_cms_published_entries').select(ENTRY_COLUMNS)
        .eq('content_type', type).eq('slug', slug).maybeSingle();
      if (result.error) throw result.error;
      return result.data || null;
    },
    async entriesBySlugs(slugs) {
      return inRows('public_cms_published_entries', ENTRY_COLUMNS, 'slug', slugs, 'published_at');
    },
    async blocks(revisionIds) {
      return inRows('public_cms_published_blocks', BLOCK_COLUMNS, 'revision_id', revisionIds, 'block_position');
    },
    async media(revisionIds) {
      return inRows('public_cms_published_media', MEDIA_COLUMNS, 'revision_id', revisionIds, 'placement_position');
    },
    async tags(revisionIds) {
      return inRows('public_cms_published_tags', TAG_COLUMNS, 'revision_id', revisionIds, 'name');
    },
    async alias(path) {
      const result = await client.from('public_cms_slug_redirects').select('alias_path,destination_path')
        .eq('alias_path', path).maybeSingle();
      if (result.error) throw result.error;
      return result.data || null;
    },
    async engagement(entryId) {
      const result = await client.from('public_cms_engagement_totals')
        .select('view_count,like_count,comment_count').eq('entry_id', entryId).maybeSingle();
      if (result.error) throw result.error;
      return result.data || { view_count: 0, like_count: 0, comment_count: 0 };
    },
    async comments(entryId) {
      const result = await client.from('public_cms_approved_comments')
        .select('id,body,author_label,created_at,updated_at').eq('entry_id', entryId)
        .order('created_at', { ascending: true }).limit(100);
      return checkedRows(result);
    }
  };
}

function mediaRowsForEntry(entry, rows) {
  const related = (rows || []).filter((row) => row.revision_id === entry.revision_id);
  const grouped = new Map();
  related.forEach((row) => {
    if (!row?.media_id || !row?.provider_asset_id || !Number.isSafeInteger(Number(row.provider_version))) return;
    const existing = grouped.get(row.media_id) || { ...row, placements: new Set(), captions: [] };
    existing.placements.add(row.placement);
    if (row.caption && !existing.captions.includes(row.caption)) existing.captions.push(row.caption);
    grouped.set(row.media_id, existing);
  });
  return [...grouped.values()]
    .sort((a, b) => Number(a.placement_position || 0) - Number(b.placement_position || 0) || String(a.media_id).localeCompare(String(b.media_id)))
    .map((row) => ({
      ...row,
      caption: row.captions[0] || row.title || '',
      downloadAllowed: row.placements.has('download'),
      gallerySlug: `${entry.slug}-media-${createHash('sha256').update(`${entry.id}:${row.media_id}`, 'utf8').digest('hex').slice(0, 12)}`,
      source: entry
    }));
}

async function entryBundle(repository, entry) {
  const [blocks, media, tags] = await Promise.all([
    repository.blocks([entry.revision_id]),
    repository.media([entry.revision_id]),
    repository.tags([entry.revision_id])
  ]);
  const ownBlocks = blocks.filter((block) => block.revision_id === entry.revision_id)
    .sort((a, b) => Number(a.block_position) - Number(b.block_position));
  const relatedSlugs = ownBlocks.filter((block) => block.block_type === 'related_content')
    .flatMap((block) => Array.isArray(block.payload?.slugs) ? block.payload.slugs : [])
    .filter((slug) => SAFE_SLUG.test(String(slug))).slice(0, 20);
  const related = relatedSlugs.length ? await repository.entriesBySlugs([...new Set(relatedSlugs)]) : [];
  return {
    entry,
    blocks: ownBlocks,
    media: mediaRowsForEntry(entry, media),
    tags: tags.filter((tag) => tag.revision_id === entry.revision_id),
    related
  };
}

async function listBundles(repository, entries) {
  const revisionIds = entries.map((entry) => entry.revision_id);
  const [media, tags] = await Promise.all([repository.media(revisionIds), repository.tags(revisionIds)]);
  return entries.map((entry) => ({
    entry,
    media: mediaRowsForEntry(entry, media),
    tags: tags.filter((tag) => tag.revision_id === entry.revision_id)
  }));
}

function mediaPath(item, action = 'asset', variant = '') {
  const suffix = action === 'asset' && variant ? `?variant=${encodeURIComponent(variant)}` : '';
  return `/gallery/${item.gallerySlug}/${action}${suffix}`;
}

function mediaFigure(item, options = {}) {
  if (!item || !String(item.alt_text || '').trim()) return '';
  const caption = item.caption || item.attribution || '';
  const sourceLink = options.sourceLink !== false
    ? `<p class="content-media-source"><a href="/gallery/${escapeHtml(item.gallerySlug)}">Open media details</a></p>` : '';
  if (item.media_type === 'video') {
    return `<figure class="content-media content-media--video"><video controls preload="metadata" playsinline poster="${escapeHtml(mediaPath(item, 'asset', 'poster'))}"><source src="${escapeHtml(mediaPath(item, 'asset', 'video-720'))}" type="video/mp4">Your browser does not support this video. Open the media details for available information.</video>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}${sourceLink}</figure>`;
  }
  return `<figure class="content-media"><a href="/gallery/${escapeHtml(item.gallerySlug)}"><img src="${escapeHtml(mediaPath(item, 'asset', options.variant || 'content-960'))}" alt="${escapeHtml(item.alt_text)}"${Number(item.width) > 0 ? ` width="${Number(item.width)}"` : ''}${Number(item.height) > 0 ? ` height="${Number(item.height)}"` : ''} loading="lazy" decoding="async"></a>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}${sourceLink}</figure>`;
}

function renderBlock(block, bundle, mediaEnabled) {
  const payload = block?.payload || {};
  const text = escapeHtml(payload.text || '');
  if (block.block_type === 'paragraph') return `<p>${text}</p>`;
  if (block.block_type === 'heading') {
    const level = [2, 3, 4].includes(Number(payload.level)) ? Number(payload.level) : 2;
    return `<h${level}>${text}</h${level}>`;
  }
  if (block.block_type === 'ordered_list' || block.block_type === 'unordered_list') {
    const tag = block.block_type === 'ordered_list' ? 'ol' : 'ul';
    return `<${tag}>${(Array.isArray(payload.items) ? payload.items : []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
  }
  if (block.block_type === 'quote') return `<blockquote><p>${text}</p></blockquote>`;
  if (block.block_type === 'callout') {
    const style = ['info', 'warning', 'success'].includes(payload.style) ? payload.style : 'info';
    return `<aside class="content-callout content-callout--${style}">${text}</aside>`;
  }
  if ((block.block_type === 'image' || block.block_type === 'video') && mediaEnabled) {
    const item = bundle.media.find((media) => media.media_id === payload.asset_id && media.media_type === block.block_type);
    return mediaFigure(item);
  }
  if (block.block_type === 'gallery' && mediaEnabled) {
    const ids = Array.isArray(payload.asset_ids) ? payload.asset_ids : [];
    const figures = ids.map((id) => mediaFigure(bundle.media.find((media) => media.media_id === id), { variant: 'card' })).filter(Boolean);
    return figures.length ? `<div class="content-gallery">${figures.join('')}</div>` : '';
  }
  if (block.block_type === 'verified_fact') {
    const path = safeInternalPath(payload.source_path, '/contact');
    return `<aside class="verified-fact"><strong>Verified information</strong><p>${text}</p><a href="${escapeHtml(path)}">Open supporting source</a></aside>`;
  }
  if (block.block_type === 'table') {
    const headers = Array.isArray(payload.headers) ? payload.headers : [];
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    return `<div class="content-table-wrap"><table><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  if (block.block_type === 'button') return `<p><a class="btn btn-mint" href="${escapeHtml(safeInternalPath(payload.path))}">${escapeHtml(payload.label)}</a></p>`;
  if (block.block_type === 'related_content') {
    const allowed = new Map(bundle.related.map((entry) => [entry.slug, entry]));
    const links = (Array.isArray(payload.slugs) ? payload.slugs : []).map((slug) => allowed.get(slug)).filter(Boolean);
    return links.length ? `<aside class="related-content"><h2>Related information</h2><ul>${links.map((entry) => `<li><a href="${escapeHtml(entry.canonical_path)}">${escapeHtml(entry.title)}</a></li>`).join('')}</ul></aside>` : '';
  }
  return '';
}

function eventFacts(entry, lifecycle, now) {
  const starts = entry.event_starts_at;
  const ends = entry.event_ends_at;
  return `<section class="event-facts" aria-labelledby="eventFactsTitle"><h2 id="eventFactsTitle">Event details</h2><dl>
    <div><dt>Status</dt><dd><strong data-event-state data-start="${escapeHtml(starts || '')}" data-end="${escapeHtml(ends || '')}" data-status="${escapeHtml(entry.event_status || 'scheduled')}">${escapeHtml(lifecycle.label)}</strong></dd></div>
    <div><dt>Starts</dt><dd>${starts ? `<time datetime="${escapeHtml(starts)}">${escapeHtml(formatLagosDate(starts, true))}</time>` : 'Not published'}</dd></div>
    ${ends ? `<div><dt>Ends</dt><dd><time datetime="${escapeHtml(ends)}">${escapeHtml(formatLagosDate(ends, true))}</time></dd></div>` : ''}
    ${entry.event_venue ? `<div><dt>Venue</dt><dd>${escapeHtml(entry.event_venue)}</dd></div>` : ''}
    ${entry.event_public_address ? `<div><dt>Public location</dt><dd>${escapeHtml(entry.event_public_address)}</dd></div>` : ''}
    <div><dt>Attendance</dt><dd>${escapeHtml(String(entry.attendance_mode || 'not_applicable').replaceAll('_', ' '))}</dd></div>
  </dl>${entry.public_action_label && entry.public_action_path ? `<p><a class="btn btn-mint" href="${escapeHtml(safeInternalPath(entry.public_action_path))}">${escapeHtml(entry.public_action_label)}</a></p>` : ''}</section>`;
}

function newsStructuredData(bundle, socialImage) {
  const entry = bundle.entry;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: entry.title,
    description: entry.summary,
    datePublished: entry.published_at,
    dateModified: entry.published_at,
    inLanguage: entry.locale || 'en-NG',
    mainEntityOfPage: absoluteUrl(entry.canonical_path),
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/assets/img/logo.jpg` }
    }
  };
  if (socialImage) data.image = [socialImage];
  return data;
}

function eventStructuredData(entry) {
  const status = {
    scheduled: 'https://schema.org/EventScheduled',
    postponed: 'https://schema.org/EventPostponed',
    cancelled: 'https://schema.org/EventCancelled',
    moved_online: 'https://schema.org/EventMovedOnline',
    completed: 'https://schema.org/EventScheduled'
  }[entry.event_status || 'scheduled'];
  const mode = {
    in_person: 'https://schema.org/OfflineEventAttendanceMode',
    online: 'https://schema.org/OnlineEventAttendanceMode',
    hybrid: 'https://schema.org/MixedEventAttendanceMode'
  }[entry.attendance_mode];
  const data = {
    '@context': 'https://schema.org', '@type': 'Event', name: entry.title,
    description: entry.summary, url: absoluteUrl(entry.canonical_path),
    startDate: entry.event_starts_at, eventStatus: status,
    organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN }
  };
  if (entry.event_ends_at) data.endDate = entry.event_ends_at;
  if (mode) data.eventAttendanceMode = mode;
  if (entry.event_venue || entry.event_public_address) {
    data.location = { '@type': 'Place', name: entry.event_venue || SITE_NAME };
    if (entry.event_public_address) data.location.address = entry.event_public_address;
  }
  return data;
}

function breadcrumbs(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path) }))
  };
}

function navigation(current) {
  const links = [
    ['About', '/about', 'about'], ['Admissions', '/admissions', 'admissions'], ['Classes', '/academics', 'classes'],
    ['News', '/news', 'news'], ['Events', '/events', 'events'], ['Gallery', '/gallery', 'gallery'], ['Contact', '/contact', 'contact']
  ];
  return `<nav class="lite-nav" aria-label="Primary navigation"><div class="container"><a class="lite-brand" href="/" aria-label="Treasure Academy — homepage"><img class="logo-badge" src="/assets/img/logo.jpg" width="397" height="397" alt="" decoding="async"><span><strong>TREASURE ACADEMY</strong><small>Creche · Nursery · Primary — Ageva</small></span></a><div class="lite-links">${links.map(([label, href, key]) => `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div><div class="lite-actions"><a class="lite-search" href="/search">Search</a><button type="button" class="theme-btn icon-action" aria-label="Switch colour theme"></button><a class="btn btn-mint lite-apply" href="/admissions#apply">Apply</a></div></div></nav>`;
}

function footer() {
  return `<footer class="universal-footer" id="siteFooter"><div class="container"><div class="uf-grid"><div class="uf-col uf-about"><a class="uf-brand" href="/"><img src="/assets/img/logo.jpg" width="397" height="397" alt="" decoding="async"><b>${SITE_NAME}</b></a><p>Creche, Nursery and Primary education in Ageva, Okene. Clear information, caring teaching and strong foundations.</p></div><div class="uf-col"><h2>Published updates</h2><nav class="uf-links" aria-label="Published content"><a href="/news">News</a><a href="/events">Events</a><a href="/events/archive">Event archive</a><a href="/gallery">Gallery</a></nav></div><div class="uf-col"><h2>School &amp; support</h2><nav class="uf-links" aria-label="School and support pages"><a href="/portal/login.html">Parent &amp; Staff Portal</a><a href="/request-centre">Request Centre</a><a href="/safeguarding">Safeguarding</a><a href="/privacy">Privacy</a><a href="/credits">Website credits</a></nav></div><div class="uf-col uf-contact"><h2>Verified contact</h2><p><a href="tel:+2348141943478"><b>+234 814 194 3478</b></a><br><a href="https://wa.me/2349063932487"><b>WhatsApp 09063932487</b></a><br><a href="mailto:treasuregroupofschool@gmail.com">treasuregroupofschool@gmail.com</a></p><p>Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State.</p></div></div></div><div class="uf-bottom"><div class="container"><span>Treasure Academy Ageva Limited · RC 9634403</span><span>© 2026 Treasure Academy, Ageva. All rights reserved.</span><span><a href="https://paragonhub-kappa.vercel.app/" target="_blank" rel="noopener">Website designed and implemented by Jibril Abdullahi Onoruoiza, Paragon Hub.</a></span></div></div></footer>`;
}

function pageShell({ title, description, canonicalPath, current, main, robots = 'index,follow,max-image-preview:large,max-snippet:-1', structured = [], image = '', imageAlt = SITE_NAME, feed = '', feedPath = '' }) {
  const canonical = absoluteUrl(canonicalPath);
  const socialImage = image || `${SITE_ORIGIN}/assets/img/og-cover.png`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><script src="/assets/js/theme-init.js?v=20261023-design1"></script><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta name="robots" content="${escapeHtml(robots)}"><meta property="og:type" content="${current === 'news-detail' ? 'article' : 'website'}"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(socialImage)}"><meta property="og:image:alt" content="${escapeHtml(imageAlt)}"><meta property="og:locale" content="en_NG"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(socialImage)}"><meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">${feed ? `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed)}" href="${escapeHtml(feedPath || canonicalPath.replace(/(?:\/page\/\d+)?$/, '/feed.xml'))}">` : ''}${structured.map((item) => `<script type="application/ld+json">${safeJson(item)}</script>`).join('')}<link rel="stylesheet" href="/assets/css/site.css?v=20261023-design1"><link rel="stylesheet" href="/assets/css/public-content.css?v=20261027-run8"></head><body><a class="skip-link" href="#main">Skip to content</a>${navigation(current.replace('-detail', ''))}${main}${footer()}<script src="/assets/js/visitor-insights.js?v=20261023-design1"></script><script src="/assets/js/public-shell.js?v=20261023-design1"></script><script src="/assets/js/public-content.js?v=20261027-run8"></script><nav class="mobile-dock" aria-label="Mobile quick navigation"><a href="/" data-dock="home"><span>Home</span></a><a href="/admissions" data-dock="admissions"><span>Admissions</span></a><a href="/site-map" data-dock="explore"><span>Explore</span></a><a href="/search" data-dock="search"><span>Search</span></a><a href="/contact" data-dock="contact"><span>Contact</span></a></nav></body></html>`;
}

function publishedMeta(entry, now) {
  return `<p class="content-meta"><time datetime="${escapeHtml(entry.published_at)}">${escapeHtml(formatLagosDate(entry.published_at))}</time><span aria-hidden="true"> · </span><span data-relative-time="${escapeHtml(entry.published_at)}">${escapeHtml(relativeTime(entry.published_at, now))}</span>${Number(entry.revision_number) > 1 ? `<span aria-hidden="true"> · </span><span>Updated revision ${Number(entry.revision_number)}</span>` : ''}</p>`;
}

function listingCard(bundle, type, now, mediaEnabled) {
  const entry = bundle.entry;
  const featured = mediaEnabled ? (bundle.media.find((item) => item.media_id === entry.featured_media_id) || bundle.media[0]) : null;
  const lifecycle = type === 'event' ? eventLifecycle(entry, now) : null;
  return `<article class="content-card">${featured && featured.media_type === 'image' ? `<a class="content-card-media" href="${escapeHtml(entry.canonical_path)}"><img src="${escapeHtml(mediaPath(featured, 'asset', 'card'))}" alt="${escapeHtml(featured.alt_text)}" width="1200" height="675" loading="lazy" decoding="async"></a>` : ''}<div class="content-card-body">${entry.category ? `<span class="content-kicker">${escapeHtml(entry.category)}</span>` : ''}<h2><a href="${escapeHtml(entry.canonical_path)}">${escapeHtml(entry.title)}</a></h2>${type === 'event' ? `<p class="event-state event-state--${escapeHtml(lifecycle.key)}">${escapeHtml(lifecycle.label)}</p><p>${entry.event_starts_at ? `<time datetime="${escapeHtml(entry.event_starts_at)}">${escapeHtml(formatLagosDate(entry.event_starts_at, true))}</time>` : 'Date confirmation unavailable'}</p>` : publishedMeta(entry, now)}<p>${escapeHtml(entry.summary)}</p><a class="content-read" href="${escapeHtml(entry.canonical_path)}">${type === 'event' ? 'Open event details' : 'Read this update'} <span aria-hidden="true">→</span></a></div></article>`;
}

function pagination(type, page, totalPages, archive = false) {
  if (totalPages <= 1) return '';
  const base = archive ? '/events/archive' : `/${type === 'event' ? 'events' : 'news'}`;
  const pathFor = (number) => number === 1 ? base : archive ? `/events/archive/page/${number}` : `${base}/page/${number}`;
  return `<nav class="content-pagination" aria-label="Pagination">${page > 1 ? `<a rel="prev" href="${pathFor(page - 1)}">← Newer</a>` : '<span></span>'}<span>Page ${page} of ${totalPages}</span>${page < totalPages ? `<a rel="next" href="${pathFor(page + 1)}">Older →</a>` : '<span></span>'}</nav>`;
}

function listPage({ type, bundles, page, totalPages, now, archive = false, mediaEnabled }) {
  const isEvent = type === 'event';
  const base = archive ? '/events/archive' : isEvent ? '/events' : '/news';
  const canonicalPath = page === 1 ? base : archive ? `/events/archive/page/${page}` : `/${isEvent ? 'events' : 'news'}/page/${page}`;
  const title = archive ? 'Past Events — Treasure Academy, Ageva' : isEvent ? 'Events — Treasure Academy, Ageva' : 'News & Updates — Treasure Academy, Ageva';
  const heading = archive ? 'Past Events' : isEvent ? 'Events' : 'News & Updates';
  const description = archive
    ? 'Published past and cancelled events from Treasure Academy, Ageva.'
    : isEvent ? 'Confirmed public events from Treasure Academy, Ageva, with exact Lagos dates and lifecycle status.'
      : 'Reviewed news and public updates from Treasure Academy, Ageva.';
  const cards = bundles.length ? bundles.map((bundle) => listingCard(bundle, type, now, mediaEnabled)).join('')
    : `<div class="content-empty"><h2>No ${archive ? 'archived events' : isEvent ? 'current events' : 'CMS news'} are published</h2><p>The website will not invent dates or updates. Use the verified school contact if you need current information.</p><a class="btn btn-mint" href="/contact">Contact the school</a></div>`;
  const main = `<header class="page-hero content-hero"><div class="container"><span class="sec-tag">Verified public content</span><h1>${heading}</h1><p>${description}</p><nav class="content-tabs" aria-label="News, events and gallery"><a href="/news"${!isEvent ? ' aria-current="page"' : ''}>News</a><a href="/events"${isEvent && !archive ? ' aria-current="page"' : ''}>Events</a><a href="/events/archive"${archive ? ' aria-current="page"' : ''}>Event archive</a><a href="/gallery">Gallery</a></nav></div></header><main id="main"><section><div class="container content-wrap"><div class="content-grid">${cards}</div>${pagination(type, page, totalPages, archive)}</div></section></main>`;
  return pageShell({ title, description, canonicalPath, current: isEvent ? 'events' : 'news', main, robots: bundles.length ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow', feed: isEvent ? 'Treasure Academy Events' : 'Treasure Academy News', feedPath: isEvent ? '/events/feed.xml' : '/news/feed.xml', structured: [breadcrumbs([{ name: 'Home', path: '/' }, { name: heading, path: base }])] });
}

function publicCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function approvedCommentList(comments) {
  if (!comments?.length) return '<p class="content-comments-empty" data-comments-empty>No approved comments yet.</p>';
  return `<ol class="content-comments-list" data-comments-list>${comments.map((comment) => {
    const body = escapeHtml(comment.body || '').replace(/\r?\n/g, '<br>');
    return `<li class="content-comment" data-comment-id="${escapeHtml(comment.id)}"><div><strong>${escapeHtml(comment.author_label || 'School community')}</strong><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(formatLagosDate(comment.created_at, true))}</time></div><p>${body}</p><button type="button" class="content-report" data-report-comment hidden>Report concern</button></li>`;
  }).join('')}</ol>`;
}

function engagementPanel(bundle, commentsEnabled) {
  const metrics = bundle.engagement || {};
  const views = publicCount(metrics.view_count);
  const likes = publicCount(metrics.like_count);
  const comments = publicCount(metrics.comment_count);
  const commentsMarkup = commentsEnabled ? `<div class="content-comments"><h3>Approved comments</h3><p>Comments are available only to signed-in active parents and staff. Every submission is reviewed by school leadership before publication. Do not include pupil names, phone numbers, payment evidence or safeguarding details.</p><div data-approved-comments>${approvedCommentList(bundle.comments || [])}</div><div class="content-comment-auth" data-comment-auth><a href="/portal/login.html">Sign in through the Parent &amp; Staff Portal</a>, then return to this page to comment.</div><form class="content-comment-form" data-comment-form hidden><label for="public-comment-body">Your comment</label><textarea id="public-comment-body" name="body" minlength="2" maxlength="2000" rows="5" required></textarea><p class="content-form-hint">Plain text only. Private or safeguarding matters belong in a protected school channel.</p><button class="btn btn-mint" type="submit">Submit for review</button></form><section class="content-own-comments" data-own-comments hidden aria-labelledby="own-comments-heading"><h3 id="own-comments-heading">Your submissions</h3><div data-own-comments-list></div></section></div>` : '';
  return `<section class="content-engagement" data-public-engagement data-content-path="${escapeHtml(bundle.entry.canonical_path)}" data-comments-enabled="${commentsEnabled ? 'true' : 'false'}" aria-labelledby="engagement-heading"><h2 id="engagement-heading">Community response</h2><p>These public totals are informational only. They never affect admission, payment, results, progression, access or publication decisions.</p><dl class="content-counts"><div><dt>Views</dt><dd data-view-count>${views}</dd></div><div><dt>Likes</dt><dd data-like-count>${likes}</dd></div>${commentsEnabled ? `<div><dt>Approved comments</dt><dd data-comment-count>${comments}</dd></div>` : ''}</dl><button class="btn btn-white content-like" type="button" data-like-button aria-pressed="false" disabled>Like this update</button><p class="content-engagement-status" data-engagement-status role="status" aria-live="polite">Sign in with an active parent or staff account to like this update.</p>${commentsMarkup}</section><script type="module" src="/assets/js/public-engagement.js?v=20261027-run9"></script>`;
}

function detailPage(bundle, now, mediaEnabled, engagementEnabled = false, commentsEnabled = false) {
  const { entry, blocks, media, tags } = bundle;
  const isEvent = entry.content_type === 'event';
  const featured = mediaEnabled ? (media.find((item) => item.media_id === entry.featured_media_id) || media[0]) : null;
  const social = mediaEnabled ? (media.find((item) => item.media_id === entry.social_media_id) || featured) : null;
  const socialImage = social && social.media_type === 'image' ? absoluteUrl(mediaPath(social, 'asset', 'hero')) : '';
  const minutes = readingMinutes(blocks);
  const lifecycle = isEvent ? eventLifecycle(entry, now) : null;
  const structured = [breadcrumbs([{ name: 'Home', path: '/' }, { name: isEvent ? 'Events' : 'News', path: isEvent ? '/events' : '/news' }, { name: entry.title, path: entry.canonical_path }])];
  structured.push(isEvent ? eventStructuredData(entry) : newsStructuredData(bundle, socialImage));
  const renderedBlocks = blocks.map((block) => renderBlock(block, bundle, mediaEnabled)).join('');
  const tagList = tags.length ? `<ul class="content-tags" aria-label="Topics">${tags.map((tag) => `<li>${escapeHtml(tag.name)}</li>`).join('')}</ul>` : '';
  const main = `<header class="page-hero content-hero content-hero--detail"><div class="container"><span class="sec-tag">${escapeHtml(entry.category || (isEvent ? 'Event' : 'News'))}</span><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(entry.summary)}</p>${isEvent ? `<p class="event-state event-state--${escapeHtml(lifecycle.key)}">${escapeHtml(lifecycle.label)}</p>` : ''}</div></header><main id="main"><article class="content-article"><div class="container content-article-grid"><aside class="content-aside"><a href="${isEvent ? '/events' : '/news'}">← Back to ${isEvent ? 'Events' : 'News'}</a>${publishedMeta(entry, now)}<p>${minutes} min read</p>${tagList}<button class="btn btn-white js-share" type="button" data-share-url="${escapeHtml(absoluteUrl(entry.canonical_path))}" data-share-title="${escapeHtml(entry.title)}">Share this page</button><p class="share-status" role="status" aria-live="polite"></p></aside><div class="content-body">${featured && !blocks.some((block) => ['image', 'video', 'gallery'].includes(block.block_type)) ? mediaFigure(featured) : ''}${isEvent ? eventFacts(entry, lifecycle, now) : ''}${renderedBlocks}</div></div></article>${engagementEnabled ? `<div class="container content-engagement-wrap">${engagementPanel(bundle, commentsEnabled)}</div>` : ''}</main>`;
  return pageShell({ title: entry.seo_title || `${entry.title} — ${SITE_NAME}`, description: entry.seo_description || entry.summary, canonicalPath: entry.canonical_path, current: isEvent ? 'events-detail' : 'news-detail', main, structured, image: socialImage, imageAlt: social?.alt_text || SITE_NAME });
}

function galleryItems(entries, mediaRows) {
  return entries.flatMap((entry) => mediaRowsForEntry(entry, mediaRows)).sort((a, b) => {
    const aTime = new Date(a.source.event_starts_at || a.source.published_at || 0).valueOf();
    const bTime = new Date(b.source.event_starts_at || b.source.published_at || 0).valueOf();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
      || String(a.gallerySlug).localeCompare(String(b.gallerySlug));
  });
}

function galleryCard(item) {
  const visual = item.media_type === 'image'
    ? `<img src="${escapeHtml(mediaPath(item, 'asset', 'card'))}" alt="${escapeHtml(item.alt_text)}" width="1200" height="675" loading="lazy" decoding="async">`
    : `<img src="${escapeHtml(mediaPath(item, 'asset', 'poster'))}" alt="${escapeHtml(item.alt_text)}" width="1280" height="720" loading="lazy" decoding="async">`;
  return `<article class="gallery-card"><a href="/gallery/${escapeHtml(item.gallerySlug)}">${visual}<div><span class="content-kicker">${item.media_type === 'image' ? 'Picture' : 'Video'} · ${escapeHtml(item.source.content_type)}</span><h2>${escapeHtml(item.title || item.source.title)}</h2><p>${escapeHtml(item.caption || item.source.summary)}</p><strong>View media and source →</strong></div></a></article>`;
}

function galleryPage(items, url) {
  const type = ['image', 'video'].includes(url.searchParams.get('type')) ? url.searchParams.get('type') : '';
  const source = ['news', 'event'].includes(url.searchParams.get('source')) ? url.searchParams.get('source') : '';
  const year = /^20\d{2}$/.test(url.searchParams.get('year') || '') ? url.searchParams.get('year') : '';
  const category = String(url.searchParams.get('category') || '').slice(0, 80);
  const page = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  let filtered = items;
  if (type) filtered = filtered.filter((item) => item.media_type === type);
  if (source) filtered = filtered.filter((item) => item.source.content_type === source);
  if (year) filtered = filtered.filter((item) => lagosYear(item.source.event_starts_at || item.source.published_at) === year);
  if (category) filtered = filtered.filter((item) => item.source.category === category);
  const totalPages = Math.max(1, Math.ceil(filtered.length / GALLERY_PAGE_SIZE));
  const selected = page <= totalPages ? filtered.slice((page - 1) * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE) : [];
  const categories = [...new Set(items.map((item) => item.source.category).filter(Boolean))].sort();
  const years = [...new Set(items.map((item) => lagosYear(item.source.event_starts_at || item.source.published_at)).filter((value) => /^20\d{2}$/.test(value)))].sort().reverse();
  const activeFilter = Boolean(type || source || year || category || page > 1);
  const cards = selected.length ? selected.map(galleryCard).join('') : `<div class="content-empty"><h2>No approved media matches</h2><p>Gallery items appear only from published News or Events with current provenance, consent and safeguarding approval.</p></div>`;
  const options = (values, selectedValue) => values.map((value) => `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
  const galleryPagePath = (number) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (source) params.set('source', source);
    if (year) params.set('year', year);
    if (category) params.set('category', category);
    if (number > 1) params.set('page', String(number));
    const query = params.toString();
    return `/gallery${query ? `?${query}` : ''}`;
  };
  const galleryPagination = totalPages > 1
    ? `<nav class="content-pagination" aria-label="Gallery pagination">${page > 1 ? `<a rel="prev" href="${escapeHtml(galleryPagePath(page - 1))}">← Previous</a>` : '<span></span>'}<span>Page ${page} of ${totalPages}</span>${page < totalPages ? `<a rel="next" href="${escapeHtml(galleryPagePath(page + 1))}">Next →</a>` : '<span></span>'}</nav>`
    : '';
  const main = `<header class="page-hero content-hero"><div class="container"><span class="sec-tag">Governed public media</span><h1>Gallery</h1><p>Approved pictures and videos linked to their published News or Event source. Originals and bulk child-media downloads are not public.</p><nav class="content-tabs" aria-label="News, events and gallery"><a href="/news">News</a><a href="/events">Events</a><a href="/gallery" aria-current="page">Gallery</a></nav></div></header><main id="main"><section><div class="container content-wrap"><form class="gallery-filters" method="get" action="/gallery"><label>Media type<select name="type"><option value="">Pictures and videos</option><option value="image"${type === 'image' ? ' selected' : ''}>Pictures</option><option value="video"${type === 'video' ? ' selected' : ''}>Videos</option></select></label><label>Source<select name="source"><option value="">News and Events</option><option value="news"${source === 'news' ? ' selected' : ''}>News</option><option value="event"${source === 'event' ? ' selected' : ''}>Events</option></select></label><label>Year<select name="year"><option value="">All years</option>${options(years, year)}</select></label><label>Category<select name="category"><option value="">All safe categories</option>${options(categories, category)}</select></label><button class="btn btn-mint" type="submit">Apply filters</button>${activeFilter ? '<a class="btn btn-white" href="/gallery">Clear filters</a>' : ''}</form><div class="gallery-grid">${cards}</div>${galleryPagination}</div></section></main>`;
  return pageShell({ title: 'Gallery — Treasure Academy, Ageva', description: 'Approved public pictures and videos linked to published Treasure Academy News and Events.', canonicalPath: '/gallery', current: 'gallery', main, robots: activeFilter || !items.length ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1', structured: [breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Gallery', path: '/gallery' }])] });
}

function galleryDetail(item, downloadsEnabled) {
  const sourcePath = item.source.canonical_path;
  const canDownload = downloadsEnabled && item.downloadAllowed;
  const visual = mediaFigure(item, { sourceLink: false, variant: 'content-1280' });
  const data = item.media_type === 'image'
    ? { '@context': 'https://schema.org', '@type': 'ImageObject', name: item.title || item.source.title, caption: item.caption || item.source.summary, contentUrl: absoluteUrl(mediaPath(item, 'asset', 'content-1280')), creditText: item.attribution || SITE_NAME, isPartOf: absoluteUrl(sourcePath) }
    : { '@context': 'https://schema.org', '@type': 'VideoObject', name: item.title || item.source.title, description: item.caption || item.source.summary, thumbnailUrl: absoluteUrl(mediaPath(item, 'asset', 'poster')), contentUrl: absoluteUrl(mediaPath(item, 'asset', 'video-720')), uploadDate: item.source.published_at, isPartOf: absoluteUrl(sourcePath) };
  const main = `<header class="page-hero content-hero content-hero--detail"><div class="container"><span class="sec-tag">${item.media_type === 'image' ? 'Picture' : 'Video'}</span><h1>${escapeHtml(item.title || item.source.title)}</h1><p>${escapeHtml(item.caption || item.source.summary)}</p></div></header><main id="main"><section><div class="container gallery-viewer">${visual}<div class="gallery-source"><h2>Published source</h2><p>This media appears through one governed relationship. If its source, consent or approval is withdrawn, this viewer and every public placement stop resolving.</p><p><a class="btn btn-mint" href="${escapeHtml(sourcePath)}">Open ${escapeHtml(item.source.content_type)}: ${escapeHtml(item.source.title)}</a></p>${item.attribution ? `<p><strong>Credit:</strong> ${escapeHtml(item.attribution)}</p>` : ''}${canDownload ? `<p><a class="btn btn-white" href="/gallery/${escapeHtml(item.gallerySlug)}/download">Download approved derivative</a></p>` : item.downloadAllowed ? '<p>The approved derivative download feature is currently unavailable.</p>' : '<p>Viewing only. No public download permission is recorded.</p>'}</div></div></section></main>`;
  return pageShell({ title: `${item.title || item.source.title} — Gallery — ${SITE_NAME}`, description: item.caption || item.source.summary, canonicalPath: `/gallery/${item.gallerySlug}`, current: 'gallery', main, structured: [breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Gallery', path: '/gallery' }, { name: item.title || item.source.title, path: `/gallery/${item.gallerySlug}` }]), data], image: item.media_type === 'image' ? absoluteUrl(mediaPath(item, 'asset', 'hero')) : absoluteUrl(mediaPath(item, 'asset', 'poster')), imageAlt: item.alt_text || item.title || SITE_NAME });
}

function rss(items, type) {
  const title = type === 'news' ? 'Treasure Academy News' : 'Treasure Academy Events';
  const path = type === 'news' ? '/news' : '/events';
  const entries = items.map((entry) => `<item><title>${escapeHtml(entry.title)}</title><link>${escapeHtml(absoluteUrl(entry.canonical_path))}</link><guid isPermaLink="true">${escapeHtml(absoluteUrl(entry.canonical_path))}</guid><description>${escapeHtml(entry.summary)}</description><pubDate>${escapeHtml(new Date(entry.published_at).toUTCString())}</pubDate></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${title}</title><link>${absoluteUrl(path)}</link><description>Reviewed public ${type === 'news' ? 'news and updates' : 'events'} from ${SITE_NAME}.</description><language>en-NG</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${entries}</channel></rss>`;
}

function unavailablePage() {
  const main = '<main id="main"><section><div class="container content-empty"><h1>Published information is temporarily unavailable</h1><p>No date, event or update will be guessed. Please try again or use the verified school contact.</p><a class="btn btn-mint" href="/contact">Contact the school</a></div></section></main>';
  return pageShell({ title: `Temporarily unavailable — ${SITE_NAME}`, description: 'Published school information is temporarily unavailable.', canonicalPath: '/', current: '', main, robots: 'noindex,nofollow,noarchive' });
}

function notFoundPage() {
  const main = '<main id="main"><section><div class="container content-empty"><h1>Published item not found</h1><p>This item is unavailable, unpublished or archived. No private draft information has been shown.</p><p><a class="btn btn-mint" href="/news">Browse News</a> <a class="btn btn-white" href="/events">Browse Events</a></p></div></section></main>';
  return pageShell({ title: `Not found — ${SITE_NAME}`, description: 'The requested published item was not found.', canonicalPath: '/', current: '', main, robots: 'noindex,nofollow,noarchive' });
}

function classifyRoute(pathname) {
  if (pathname === '/sitemap.xml') return { kind: 'sitemap', publicPath: '/sitemap.xml' };
  if (pathname === '/news') return { kind: 'list', type: 'news', page: 1, publicPath: '/news' };
  if (pathname === '/events') return { kind: 'list', type: 'event', page: 1 };
  if (pathname === '/events/archive') return { kind: 'list', type: 'event', page: 1, archive: true };
  if (pathname === '/news/feed.xml') return { kind: 'feed', type: 'news' };
  if (pathname === '/events/feed.xml') return { kind: 'feed', type: 'event' };
  if (pathname === '/gallery') return { kind: 'gallery' };
  let match = pathname.match(/^\/events\/archive\/page\/([1-9][0-9]{0,2})$/);
  if (match) return { kind: 'list', type: 'event', page: Number(match[1]), archive: true };
  match = pathname.match(/^\/(news|events)\/page\/([1-9][0-9]{0,2})$/);
  if (match) return { kind: 'list', type: match[1] === 'news' ? 'news' : 'event', page: Number(match[2]) };
  match = pathname.match(/^\/gallery\/([^/]+)\/(asset|download)$/);
  if (match && SAFE_GALLERY_SLUG.test(match[1])) return { kind: match[2], gallerySlug: match[1] };
  match = pathname.match(/^\/gallery\/([^/]+)$/);
  if (match && SAFE_GALLERY_SLUG.test(match[1])) return { kind: 'gallery-detail', gallerySlug: match[1] };
  match = pathname.match(/^\/(news|events)\/([^/]+)$/);
  if (match && SAFE_SLUG.test(match[2])) return { kind: 'detail', type: match[1] === 'news' ? 'news' : 'event', slug: match[2] };
  return null;
}

function classifyRewrite(url) {
  if (url.pathname !== '/api/public-content') return null;
  const marker = url.searchParams.get('route') || '';
  const slug = url.searchParams.get('slug') || '';
  const page = Number(url.searchParams.get('page') || 0);
  if (marker === 'sitemap') return { kind: 'sitemap', publicPath: '/sitemap.xml' };
  if (marker === 'news-list') return { kind: 'list', type: 'news', page: 1, publicPath: '/news' };
  if (marker === 'events-list') return { kind: 'list', type: 'event', page: 1, publicPath: '/events' };
  if (marker === 'events-archive') return { kind: 'list', type: 'event', page: 1, archive: true, publicPath: '/events/archive' };
  if (marker === 'news-feed') return { kind: 'feed', type: 'news', publicPath: '/news/feed.xml' };
  if (marker === 'events-feed') return { kind: 'feed', type: 'event', publicPath: '/events/feed.xml' };
  if (marker === 'gallery-list') return { kind: 'gallery', publicPath: '/gallery' };
  if (['news-page', 'events-page', 'events-archive-page'].includes(marker) && Number.isInteger(page) && page >= 1 && page <= 999) {
    const archive = marker === 'events-archive-page';
    const type = marker === 'news-page' ? 'news' : 'event';
    return { kind: 'list', type, page, archive, publicPath: archive ? `/events/archive/page/${page}` : `/${type === 'news' ? 'news' : 'events'}/page/${page}` };
  }
  if (['news-detail', 'events-detail'].includes(marker) && SAFE_SLUG.test(slug)) {
    const type = marker === 'news-detail' ? 'news' : 'event';
    return { kind: 'detail', type, slug, publicPath: `/${type === 'news' ? 'news' : 'events'}/${slug}` };
  }
  if (['gallery-detail', 'gallery-asset', 'gallery-download'].includes(marker) && SAFE_GALLERY_SLUG.test(slug)) {
    const kind = marker === 'gallery-detail' ? 'gallery-detail' : marker === 'gallery-asset' ? 'asset' : 'download';
    return { kind, gallerySlug: slug, publicPath: `/gallery/${slug}${kind === 'gallery-detail' ? '' : `/${kind}`}` };
  }
  return null;
}

async function allGallery(repository) {
  const [news, events] = await Promise.all([repository.listEntries('news'), repository.listEntries('event')]);
  const entries = [...news, ...events];
  const media = await repository.media(entries.map((entry) => entry.revision_id));
  return galleryItems(entries, media);
}

function publicMediaConfiguration(env) {
  if (env.PUBLIC_CMS_MEDIA_ENABLED !== 'true') throw Object.assign(new Error('disabled'), { status: 404 });
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || '');
  const apiSecret = String(env.CLOUDINARY_API_SECRET || '');
  if (cloudName !== 'ecbad9xj' || apiSecret.length < 16) throw Object.assign(new Error('misconfigured'), { status: 503 });
  return { cloudName, apiSecret };
}

async function proxyMedia(request, item, route, env, fetchImpl = fetch) {
  if (!item) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (route.kind === 'download' && (env.PUBLIC_CMS_DOWNLOADS_ENABLED !== 'true' || !item.downloadAllowed)) {
    return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  }
  const config = publicMediaConfiguration(env);
  const requested = new URL(request.url).searchParams.get('variant') || (item.media_type === 'image' ? 'card' : 'poster');
  const imageVariants = new Set(['thumb', 'card', 'content-640', 'content-960', 'content-1280', 'hero']);
  const videoVariants = new Set(['poster', 'video-720']);
  let variant;
  if (route.kind === 'download') variant = item.media_type === 'image' ? 'download-1600' : 'video-720';
  else variant = item.media_type === 'image' && imageVariants.has(requested) ? requested
    : item.media_type === 'video' && videoVariants.has(requested) ? requested : null;
  if (!variant) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  const delivery = buildSignedCloudinaryDeliveryUrl({
    cloudName: config.cloudName, apiSecret: config.apiSecret, publicId: item.provider_asset_id,
    mediaType: item.media_type, providerVersion: Number(item.provider_version), variant
  });
  const upstreamHeaders = { Accept: item.media_type === 'image' ? 'image/*' : 'video/*' };
  const range = request.headers.get('range');
  if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) upstreamHeaders.Range = range;
  const upstream = await fetchImpl(delivery.url, { method: request.method, headers: upstreamHeaders, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
  if (![200, 206].includes(upstream.status) || !contentType.startsWith(`${item.media_type}/`)) throw new Error('provider_delivery');
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=60, s-maxage=60',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes'
  });
  for (const name of ['content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (route.kind === 'download') {
    const extension = item.media_type === 'video' ? 'mp4' : ({
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif'
    }[contentType] || 'img');
    headers.set('Content-Disposition', `attachment; filename="treasure-academy-${item.gallerySlug}.${extension}"`);
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}

export async function handlePublicContent(request, overrides = {}) {
  const env = overrides.env || process.env;
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method)) return response(notFoundPage(), 405, { Allow: 'GET, HEAD', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (url.pathname.length > 240 || url.search.length > 500) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) return redirect(url.pathname.slice(0, -1) + url.search, 308);
  const route = classifyRoute(url.pathname) || classifyRewrite(url);
  if (!route) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  const publicPath = route.publicPath || url.pathname;
  if (env.PUBLIC_CMS_ENABLED !== 'true') {
    if (route.kind === 'sitemap') {
      const xml = sitemapXml();
      return new Response(request.method === 'HEAD' ? null : xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30', 'X-Content-Type-Options': 'nosniff' } });
    }
    return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  }
  if (route.page === 1 && /^\/(news|events)\/page\/1$/.test(publicPath)) return redirect(`/${route.type === 'news' ? 'news' : 'events'}`);
  if (route.page === 1 && publicPath === '/events/archive/page/1') return redirect('/events/archive');
  try {
    const repository = overrides.repository || createRepository(env, overrides.createClient);
    const now = new Date(overrides.now ? overrides.now() : Date.now());
    const mediaEnabled = env.PUBLIC_CMS_MEDIA_ENABLED === 'true';
    if (mediaEnabled) publicMediaConfiguration(env);
    if (['gallery', 'gallery-detail', 'asset', 'download'].includes(route.kind) && !mediaEnabled) {
      return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    }
    if (route.kind === 'sitemap') {
      const [news, events] = await Promise.all([repository.listEntries('news'), repository.listEntries('event')]);
      const entries = [...news, ...events];
      const gallery = mediaEnabled ? await allGallery(repository) : [];
      const xml = sitemapXml(entries, gallery);
      return new Response(request.method === 'HEAD' ? null : xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (route.kind === 'feed') {
      const entries = await repository.listEntries(route.type);
      const visible = route.type === 'event' ? entries.filter((entry) => !eventLifecycle(entry, now).archived) : entries;
      const xml = rss(visible.slice(0, 30), route.type);
      return new Response(request.method === 'HEAD' ? null : xml, { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (route.kind === 'list') {
      let entries = await repository.listEntries(route.type);
      if (route.type === 'event') entries = entries.filter((entry) => eventLifecycle(entry, now).archived === Boolean(route.archive));
      const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
      if (route.page > totalPages || (route.page > 1 && entries.length === 0)) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      const selected = entries.slice((route.page - 1) * PAGE_SIZE, route.page * PAGE_SIZE);
      const bundles = await listBundles(repository, selected);
      const body = listPage({ type: route.type, bundles, page: route.page, totalPages, now, archive: route.archive, mediaEnabled });
      return response(request.method === 'HEAD' ? null : body);
    }
    if (route.kind === 'detail') {
      const entry = await repository.findEntry(route.type, route.slug);
      if (!entry) {
        const alias = await repository.alias(publicPath);
        if (alias?.destination_path) return redirect(alias.destination_path);
        return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      }
      const bundle = await entryBundle(repository, entry);
      let engagementEnabled = env.PUBLIC_CMS_ENGAGEMENT_ENABLED === 'true';
      const commentsEnabled = engagementEnabled && env.PUBLIC_CMS_COMMENTS_ENABLED === 'true';
      if (engagementEnabled) {
        try {
          const [metrics, comments] = await Promise.all([
            repository.engagement(entry.id),
            commentsEnabled ? repository.comments(entry.id) : Promise.resolve([])
          ]);
          bundle.engagement = metrics;
          bundle.comments = comments;
        } catch (error) {
          console.error('Public engagement projection unavailable', { code: String(error?.code || '') });
          engagementEnabled = false;
        }
      }
      const body = detailPage(bundle, now, mediaEnabled, engagementEnabled, commentsEnabled);
      return response(request.method === 'HEAD' ? null : body);
    }
    const items = await allGallery(repository);
    if (route.kind === 'gallery') return response(request.method === 'HEAD' ? null : galleryPage(items, url));
    const item = items.find((candidate) => candidate.gallerySlug === route.gallerySlug);
    if (!item) return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    if (route.kind === 'gallery-detail') return response(request.method === 'HEAD' ? null : galleryDetail(item, env.PUBLIC_CMS_DOWNLOADS_ENABLED === 'true'));
    return proxyMedia(request, item, route, env, overrides.fetch || fetch);
  } catch (error) {
    if (Number(error?.status) === 404 || error?.message === 'disabled') return response(notFoundPage(), 404, { 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    return response(request.method === 'HEAD' ? null : unavailablePage(), 503, { 'Retry-After': '60', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  }
}

export const publicContentInternals = Object.freeze({
  classifyRoute, mediaRowsForEntry, galleryItems, renderBlock, pageShell, rss, sitemapXml, safeInternalPath, escapeHtml
});
