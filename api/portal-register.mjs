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
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_REGISTRATION_ENABLED !== 'true') {
    return unavailable();
  }
  const { handleRegistration } = await import('../server/registrations.mjs');
  return handleRegistration(request);
}

export default { fetch: handle };
