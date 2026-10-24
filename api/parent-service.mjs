function notFound() {
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
  // Fail closed before loading parent-linking dependencies.
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PARENT_LINKING_ENABLED !== 'true') {
    return notFound();
  }

  const action = new URL(request.url).searchParams.get('action') || '';
  const links = await import('../server/parent-links.mjs');
  const handlers = {
    match: links.handlePupilMatch,
    link: links.handlePupilLink,
    invite: links.handleSecondInvitation,
    redeem: links.handleSecondRedemption,
    'issue-code': links.handleIssuePupilCode
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
