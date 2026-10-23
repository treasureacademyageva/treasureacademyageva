function unavailable() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function handle(request) {
  // Fail closed before loading the Supabase account module. This keeps disabled
  // production releases healthy even when account dependencies are not needed.
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNTS_ENABLED !== 'true') {
    return unavailable();
  }
  const { handleGuardianLink } = await import('../server/accounts.mjs');
  return handleGuardianLink(request);
}

export default { fetch: handle };
