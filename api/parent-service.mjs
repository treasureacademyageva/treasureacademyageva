import {
  handleIssuePupilCode,
  handlePupilLink,
  handlePupilMatch,
  handleSecondInvitation,
  handleSecondRedemption
} from '../server/parent-links.mjs';

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
  // Fail closed before invoking any parent-linking operation.
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PARENT_LINKING_ENABLED !== 'true') {
    return notFound();
  }

  const action = new URL(request.url, 'https://internal.invalid').searchParams.get('action') || '';
  const handlers = {
    match: handlePupilMatch,
    link: handlePupilLink,
    invite: handleSecondInvitation,
    redeem: handleSecondRedemption,
    'issue-code': handleIssuePupilCode
  };
  const selected = handlers[action];
  return typeof selected === 'function' ? selected(request) : notFound();
}

export default { fetch: handle };
