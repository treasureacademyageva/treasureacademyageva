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
  // Keep the account surface fail-closed before loading any Supabase account
  // dependency. One dispatcher keeps this Hobby deployment below Vercel's
  // Serverless Function count while the public routes remain unchanged.
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNTS_ENABLED !== 'true') {
    return notFound();
  }

  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const accounts = await import('../server/accounts.mjs');
  const handlers = {
    create: accounts.handleCreateAccount,
    reset: accounts.handleResetPassword,
    status: accounts.handleAccountStatus,
    guardian: accounts.handleGuardianLink,
    'change-password': accounts.handleChangePassword
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
