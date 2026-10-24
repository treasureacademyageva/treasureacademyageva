import { createPrivateKey, randomUUID, sign } from 'node:crypto';

function relayConfig() {
  if (process.env.PARAGON_OTP_RELAY_ENABLED !== 'true') return null;
  const endpoint = String(process.env.PARAGON_OTP_RELAY_URL || '').trim();
  const privateKeyB64 = String(process.env.PARAGON_OTP_RELAY_PRIVATE_KEY_B64 || '').trim();
  const keyId = String(process.env.PARAGON_OTP_RELAY_KEY_ID || '').trim();
  const tenant = String(process.env.PARAGON_OTP_RELAY_TENANT || 'treasure-academy').trim();
  if (!/^https:\/\//i.test(endpoint) || !privateKeyB64 || !keyId || !tenant) {
    throw new Error('relay_misconfigured');
  }
  let privateKey;
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(privateKeyB64, 'base64'),
      format: 'der',
      type: 'pkcs8'
    });
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('key_type');
  } catch {
    throw new Error('relay_misconfigured');
  }
  return { endpoint, privateKey, keyId, tenant };
}

export async function dispatchOtpRelay({ challengeId, phone, code, expiresInSeconds }) {
  const config = relayConfig();
  if (!config) return { delivered: false, mode: 'manual' };
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID();
  const body = JSON.stringify({
    version: 1,
    tenant: config.tenant,
    requestId,
    challengeId,
    channel: 'whatsapp',
    recipientPhone: phone,
    authenticationCode: code,
    expiresInSeconds
  });
  const signature = sign(null, Buffer.from(`${timestamp}.${body}`, 'utf8'), config.privateKey).toString('base64url');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Paragon-Key-Id': config.keyId,
        'X-Paragon-Timestamp': timestamp,
        'X-Paragon-Request-Id': requestId,
        'X-Paragon-Signature': `ed25519=${signature}`
      },
      body,
      signal: controller.signal
    });
    if (!result.ok) throw new Error('relay_rejected');
    const response = await result.json().catch(() => ({}));
    if (response?.accepted !== true) throw new Error('relay_rejected');
    const providerReference = String(response.reference || '').replace(/[^A-Za-z0-9._:/-]/g, '').slice(0, 160) || null;
    return { delivered: true, mode: 'relay', requestId, providerReference };
  } finally {
    clearTimeout(timer);
  }
}
