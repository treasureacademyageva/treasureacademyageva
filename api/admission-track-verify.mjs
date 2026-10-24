import { handleAdmissionTrackingVerify } from '../server/admission-tracking.mjs';

export default async function handler(request) {
  return handleAdmissionTrackingVerify(request);
}
