import { handleAdmissionTrackingRequest } from '../server/admission-tracking.mjs';

export default async function handler(request) {
  return handleAdmissionTrackingRequest(request);
}
