import {
  isAllowedWebhookIp,
  jsonResponse,
  parseSuccessfulPayment,
  processWithSupabase,
  sha256,
  verifyMonnifySignature,
  verifyTransactionWithMonnify
} from '../server/monnify.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

function configFromEnvironment() {
  const enabled = process.env.MONNIFY_WEBHOOK_ENABLED === 'true'
    && process.env.MONNIFY_OWNER_VERIFIED === 'true';
  if (!enabled) return { enabled: false };

  const apiKey = process.env.MONNIFY_API_KEY || '';
  const secretKey = process.env.MONNIFY_SECRET_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const environment = process.env.MONNIFY_ENVIRONMENT;

  if (!apiKey || !secretKey || !supabaseUrl || !supabaseSecretKey) {
    throw new Error('Required server configuration is missing');
  }
  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('MONNIFY_ENVIRONMENT must be sandbox or production');
  }

  return {
    enabled: true,
    apiKey,
    secretKey,
    supabaseUrl,
    supabaseSecretKey,
    baseUrl: environment === 'production' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com',
    enforceIpAllowlist: process.env.MONNIFY_ENFORCE_IP_ALLOWLIST !== 'false',
    allowedIps: process.env.MONNIFY_WEBHOOK_IPS || '35.242.133.146'
  };
}

async function handle(request) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let config;
  try {
    config = configFromEnvironment();
  } catch {
    return jsonResponse(503, { error: 'Webhook unavailable' });
  }
  if (!config.enabled) return jsonResponse(404, { error: 'Not found' });

  if (config.enforceIpAllowlist && !isAllowedWebhookIp(request, config.allowedIps)) {
    return jsonResponse(403, { error: 'Forbidden' });
  }

  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return jsonResponse(415, { error: 'JSON required' });

  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BODY_BYTES) return jsonResponse(413, { error: 'Payload too large' });

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse(400, { error: 'Unreadable request' });
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Payload too large' });
  }

  const signature = request.headers.get('monnify-signature');
  if (!verifyMonnifySignature(rawBody, signature, config.secretKey)) {
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  let payment;
  try {
    payment = parseSuccessfulPayment(rawBody);
  } catch {
    return jsonResponse(400, { error: 'Unsupported payment event' });
  }

  try {
    // A valid webhook is necessary but not sufficient: re-query Monnify before
    // changing a payment record, then let one database transaction reconcile it.
    await verifyTransactionWithMonnify(payment, config);
    const result = await processWithSupabase(payment, sha256(rawBody), config);
    return jsonResponse(200, { received: true, outcome: result.outcome });
  } catch {
    // Fail closed and return a retryable response. Do not log payloads, references,
    // names, account data or secrets from a payment notification.
    return jsonResponse(503, { error: 'Verification temporarily unavailable' });
  }
}

export default { fetch: handle };
