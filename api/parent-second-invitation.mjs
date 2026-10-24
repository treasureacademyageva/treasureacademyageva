function unavailable() {
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
}
async function handle(request) {
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PARENT_LINKING_ENABLED !== 'true') return unavailable();
  const { handleSecondInvitation } = await import('../server/parent-links.mjs');
  return handleSecondInvitation(request);
}
export default { fetch: handle };
