function unavailable() {
  return new Response(JSON.stringify({ error: 'Request Centre is not active yet.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function handle(request) {
  if (process.env.WEBSITE_REQUESTS_ENABLED !== 'true') return unavailable();
  const { handleCreateRequest } = await import('../server/requests.mjs');
  return handleCreateRequest(request);
}

export default { fetch: handle };
