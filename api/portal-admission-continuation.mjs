import { handlePortalContinuation } from '../server/admission-tracking.mjs';

export default async function handler(request) {
  return handlePortalContinuation(request);
}
