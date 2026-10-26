import {
  handleMediaComplete,
  handleMediaDelivery,
  handleMediaManifest,
  handleMediaSign,
  handleMediaUsage
} from '../server/cms-media.mjs';

function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function handle(request) {
  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const handlers = {
    sign: handleMediaSign,
    complete: handleMediaComplete,
    delivery: handleMediaDelivery,
    manifest: handleMediaManifest,
    usage: handleMediaUsage
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
