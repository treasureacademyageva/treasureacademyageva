function jsonResponse(status, body, cache = 'no-store, max-age=0') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

async function handle(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (process.env.PUBLIC_INFORMATION_ENABLED !== 'true') return jsonResponse(404, { error: 'Not found' });
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !publishableKey) return jsonResponse(503, { error: 'Public information is temporarily unavailable.' });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    // Deliberately use the anonymous client so the published-only RLS policy is
    // a second boundary in addition to the explicit projection and filters.
    const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const { data, error } = await client.from('verified_public_information')
      .select('topic,title,summary,detail,revision,effective_from,effective_until,published_at')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .or(`effective_from.is.null,effective_from.lte.${today}`)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order('published_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return jsonResponse(200, { items: data || [], generatedAt: new Date().toISOString() }, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  } catch {
    return jsonResponse(503, { error: 'Public information is temporarily unavailable.' });
  }
}

export default { fetch: handle };
