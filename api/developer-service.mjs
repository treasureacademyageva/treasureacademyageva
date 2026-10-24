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
  if (action === 'console') {
    const { handleDeveloperConsole } = await import('../server/developer-console.mjs');
    return handleDeveloperConsole(request);
  }
  if (action === 'otp') {
    const { handleDeveloperOtp } = await import('../server/admission-tracking.mjs');
    return handleDeveloperOtp(request);
  }
  return notFound();
}
