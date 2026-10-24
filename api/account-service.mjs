import {
  handleAccountStatus,
  handleChangePassword,
  handleCreateAccount,
  handleGuardianLink,
  handleResetPassword
} from '../server/accounts.mjs';
import {
  handleAccountClaimComplete,
  handleAccountClaimRequest,
  handleAccountClaimVerify
} from '../server/account-claims.mjs';

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
  // One dispatcher keeps this Hobby deployment below Vercel's Serverless
  // Function count. Each action still enforces its own independent gate.
  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const claimHandlers = {
    'claim-request': handleAccountClaimRequest,
    'claim-verify': handleAccountClaimVerify,
    'claim-complete': handleAccountClaimComplete
  };
  if (claimHandlers[action]) {
    if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNT_CLAIM_ENABLED !== 'true') return notFound();
    return claimHandlers[action](request);
  }
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNTS_ENABLED !== 'true') {
    return notFound();
  }
  const handlers = {
    create: handleCreateAccount,
    reset: handleResetPassword,
    status: handleAccountStatus,
    guardian: handleGuardianLink,
    'change-password': handleChangePassword
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
