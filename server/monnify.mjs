import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MONNIFY_WEBHOOK_IP = '35.242.133.146';

export function computeMonnifySignature(rawBody, secret) {
  if (typeof rawBody !== 'string' || !secret) throw new TypeError('Raw body and secret are required');
  return createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifyMonnifySignature(rawBody, receivedSignature, secret) {
  const expected = Buffer.from(computeMonnifySignature(rawBody, secret), 'hex');
  const normalized = String(receivedSignature || '').trim().toLowerCase();
  const validHex = /^[a-f0-9]{128}$/.test(normalized);
  const received = validHex ? Buffer.from(normalized, 'hex') : Buffer.alloc(expected.length);
  return validHex && timingSafeEqual(expected, received);
}

export function sha256(rawBody) {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

function requiredText(value, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 200) throw new Error(`Invalid ${name}`);
  return text;
}

function money(value) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
    throw new Error('Invalid amountPaid');
  }
  return Math.round(amount * 100) / 100;
}

export function parseSuccessfulPayment(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error('Malformed JSON');
  }

  if (!payload || payload.eventType !== 'SUCCESSFUL_TRANSACTION') {
    throw new Error('Unsupported event type');
  }

  const data = payload.eventData;
  if (!data || data.paymentStatus !== 'PAID') {
    throw new Error('Payment is not PAID');
  }

  const currency = String(data.currency || data.currencyCode || '').toUpperCase();
  if (currency && currency !== 'NGN') throw new Error('Unsupported currency');

  const paymentReference = requiredText(data.paymentReference, 'paymentReference');
  const transactionReference = requiredText(data.transactionReference, 'transactionReference');
  const amountPaid = money(data.amountPaid);

  return {
    eventKey: `SUCCESSFUL_TRANSACTION:${transactionReference}`,
    paymentReference,
    transactionReference,
    amountPaid,
    currency: currency || 'NGN'
  };
}

export function sourceIp(request) {
  const chain = request.headers.get('x-forwarded-for') || '';
  return chain.split(',')[0].trim();
}

export function isAllowedWebhookIp(request, allowlist = MONNIFY_WEBHOOK_IP) {
  const allowed = String(allowlist || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(sourceIp(request));
}

async function fetchJson(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(`Upstream HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

let tokenCache = { token: '', expiresAt: 0, cacheKey: '' };

async function getMonnifyAccessToken({ baseUrl, apiKey, secretKey }) {
  const cacheKey = createHash('sha256').update(`${baseUrl}:${apiKey}`).digest('hex');
  if (tokenCache.cacheKey === cacheKey && tokenCache.token && tokenCache.expiresAt > Date.now() + 30000) {
    return tokenCache.token;
  }

  const result = await fetchJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
      Accept: 'application/json'
    }
  });

  const token = result?.responseBody?.accessToken;
  if (!result.requestSuccessful || !token) throw new Error('Monnify authentication failed');
  const expiresIn = Math.min(Number(result?.responseBody?.expiresIn || 2400), 2400);
  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max(expiresIn, 60) * 1000,
    cacheKey
  };
  return token;
}

export async function verifyTransactionWithMonnify(payment, config) {
  const accessToken = await getMonnifyAccessToken(config);
  const query = new URLSearchParams({ transactionReference: payment.transactionReference });
  const result = await fetchJson(`${config.baseUrl}/api/v2/merchant/transactions/query?${query}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  const data = result?.responseBody;
  if (!result.requestSuccessful || !data) throw new Error('Monnify verification failed');

  const verified = {
    paymentReference: requiredText(data.paymentReference, 'verified paymentReference'),
    transactionReference: requiredText(data.transactionReference, 'verified transactionReference'),
    amountPaid: money(data.amountPaid),
    status: String(data.paymentStatus || ''),
    currency: String(data.currencyCode || data.currency || '').toUpperCase()
  };

  if (verified.status !== 'PAID') throw new Error('Verified transaction is not PAID');
  if (verified.paymentReference !== payment.paymentReference) throw new Error('Payment reference mismatch');
  if (verified.transactionReference !== payment.transactionReference) throw new Error('Transaction reference mismatch');
  if (verified.amountPaid !== payment.amountPaid) throw new Error('Verified amount mismatch');
  if (verified.currency && verified.currency !== 'NGN') throw new Error('Verified currency mismatch');
  return verified;
}

export function supabaseServerHeaders(key) {
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  // New sb_secret_* keys are opaque, not JWTs, and belong only on apikey.
  // The legacy service_role fallback is a JWT and still uses Bearer auth.
  if (!String(key).startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function processWithSupabase(payment, payloadHash, config) {
  const endpoint = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/process_monnify_payment_event`;
  const result = await fetchJson(endpoint, {
    method: 'POST',
    headers: supabaseServerHeaders(config.supabaseSecretKey),
    body: JSON.stringify({
      p_event_key: payment.eventKey,
      p_payload_sha256: payloadHash,
      p_payment_reference: payment.paymentReference,
      p_transaction_reference: payment.transactionReference,
      p_amount_paid: payment.amountPaid
    })
  });

  if (!result || !['processed', 'duplicate', 'rejected'].includes(result.outcome)) {
    throw new Error('Unexpected payment processor response');
  }
  return result;
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
