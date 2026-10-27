function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function handle(request) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });

  const enabled = process.env.PORTAL_ENABLED === 'true';
  const url = process.env.SUPABASE_URL || '';
  // Publishable and legacy anon keys are browser-safe. Secret/service keys are
  // intentionally never read or returned by this endpoint.
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  const developerBootstrapEnabled = process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED === 'true';
  if (!enabled || !url || !publishableKey) {
    return json(200, { enabled: false, developerBootstrapEnabled });
  }

  return json(200, {
    enabled: true,
    developerBootstrapEnabled,
    url,
    publishableKey,
    registrationEnabled: process.env.PORTAL_REGISTRATION_ENABLED === 'true',
    accountClaimEnabled: process.env.PORTAL_ACCOUNT_CLAIM_ENABLED === 'true',
    officeEnabled: process.env.PORTAL_OFFICE_ENABLED === 'true',
    cmsEnabled: process.env.CMS_PORTAL_ENABLED === 'true',
    mediaEnabled: process.env.CMS_MEDIA_ENABLED === 'true'
  });
}

export default { fetch: handle };
