import { handleDeveloperOtp } from '../server/admission-tracking.mjs';

export default async function handler(request) {
  return handleDeveloperOtp(request);
}
