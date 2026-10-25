import { handleDeveloperOtp } from '../server/admission-tracking.mjs';
import { handleDeveloperBootstrap } from '../server/developer-bootstrap.mjs';
import { handleDeveloperConsole } from '../server/developer-console.mjs';

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
  if (action === 'console') return handleDeveloperConsole(request);
  if (action === 'otp') return handleDeveloperOtp(request);
  if (action === 'bootstrap') return handleDeveloperBootstrap(request);
  return notFound();
}

export default { fetch: handle };
