function json(status, body, cache = 'no-store, max-age=0') {
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
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  if (process.env.PUBLIC_GRADUATE_WALL_ENABLED !== 'true') return json(404, { error: 'Not found' });
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !publishableKey) return json(503, { error: 'Graduate Wall is temporarily unavailable.' });
  try {
    const { createClient } = await import('@supabase/supabase-js');
    // The RPC returns exactly three consent-approved display fields. It cannot
    // return pupil IDs, dates, contacts, results, approver IDs or finances.
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });
    const { data, error } = await client.rpc('list_public_graduates');
    if (error) throw error;
    return json(200, { graduates: data || [] }, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  } catch {
    return json(503, { error: 'Graduate Wall is temporarily unavailable.' });
  }
}

export default { fetch: handle };
