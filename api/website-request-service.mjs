function unavailable() {
  return new Response(JSON.stringify({ error: 'Request Centre is not active yet.' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function handle(request) {
  if (process.env.WEBSITE_REQUESTS_ENABLED !== 'true') return unavailable();

  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const requests = await import('../server/requests.mjs');
  if (action === 'create') return requests.handleCreateRequest(request);
  if (action === 'status') return requests.handleRequestStatus(request);
  return unavailable();
}

export default { fetch: handle };
