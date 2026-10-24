import {
  handleAdmissionTrackingRequest,
  handleAdmissionTrackingVerify,
  handlePortalContinuation
} from '../server/admission-tracking.mjs';

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
  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const handlers = {
    request: handleAdmissionTrackingRequest,
    verify: handleAdmissionTrackingVerify,
    continuation: handlePortalContinuation
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
