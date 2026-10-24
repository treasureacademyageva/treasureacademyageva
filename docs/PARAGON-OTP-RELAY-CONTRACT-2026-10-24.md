# Paragon Hub OTP relay contract

Status: **school and Paragon source inspected and integrated; relay remains disabled until deployment, approved Meta authentication-template delivery and live acceptance pass.**

## Authority and processor boundary

Treasure Academy Ageva Limited is the publisher and data controller. The Proprietress authorised Paragon Hub to process only:

- the registered phone number;
- the short-lived authentication code;
- its expiry;
- delivery correlation and status.

The relay request must never contain a pupil or parent name, class, result, admission record, payment, invoice, bank information, password, Supabase token or service credential.

## School-to-relay request

The school server sends a JSON `POST` over HTTPS. Browser code never calls the relay directly.

Headers:

- `Content-Type: application/json`
- `X-Paragon-Key-Id`: non-secret key identifier
- `X-Paragon-Timestamp`: Unix seconds
- `X-Paragon-Request-Id`: UUID idempotency/replay identifier
- `X-Paragon-Signature`: `ed25519=<base64url signature>`

The Ed25519 signature input is exactly:

```text
<timestamp>.<raw JSON request body>
```

Treasure Academy holds the private signing key only in its deployment secret store. Paragon holds only the allowlisted public verification key, so the processor never receives a school, Supabase or shared privileged credential.

Request body:

```json
{
  "version": 1,
  "tenant": "treasure-academy",
  "requestId": "UUID",
  "challengeId": "UUID",
  "channel": "whatsapp",
    "recipientPhone": "+234…",
    "authenticationCode": "six digits",
    "expiresInSeconds": 300
  }
```

The same generic Treasure Academy authentication template serves all permitted school-code deliveries. The relay is not told whether the code relates to an admission tracker or an account claim.

Expected success response:

```json
{
  "accepted": true,
  "reference": "provider-safe delivery correlation"
}
```

## Mandatory relay controls

The Paragon implementation must:

1. verify the Ed25519 signature with the tenant/key-ID allowlisted public key;
2. reject timestamps outside a five-minute window;
3. reject a reused `requestId` or conflicting reuse of a `challengeId`;
4. enforce the `treasure-academy` tenant and an allowlisted `keyId`;
5. validate the Nigerian E.164 recipient and six-digit code;
6. use the approved Meta authentication template and expiry display;
7. never log the code, full phone, raw body, signature or provider token;
8. persist only masked/hashed correlation and delivery status for the shortest operational period;
9. authenticate Meta webhooks and route status to the same tenant safely;
10. expose no public endpoint that reveals whether a registered identity exists;
11. keep Meta, Supabase, Render, Vercel and GitHub credentials separate;
12. provide deletion/expiry and incident runbooks before activation.

## Runtime gates and fallback

`PARAGON_OTP_RELAY_ENABLED=false` is the default. When false or when a relay call fails, an eligible code remains in Treasure Academy’s capability-scoped one-time manual dispatcher queue. A dispatcher reveal is one-time, server ciphertext is destroyed, the page clears after 30 seconds and audits remain code-free.

No gate may be enabled until the clean Paragon source ZIP (without `.env`, credentials, `node_modules` or private exports) is inspected and relay acceptance tests pass.
