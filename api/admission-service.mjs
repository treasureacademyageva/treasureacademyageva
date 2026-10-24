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

export default async function handler(request) {
  const action = new URL(request.url).searchParams.get('action') || '';
  const tracking = await import('../server/admission-tracking.mjs');
  const handlers = {
    request: tracking.handleAdmissionTrackingRequest,
    verify: tracking.handleAdmissionTrackingVerify,
    continuation: tracking.handlePortalContinuation
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}
