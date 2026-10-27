import { handlePublicContent } from '../server/public-content.mjs';
import { handlePublicEngagement, isPublicEngagementRequest } from '../server/public-engagement.mjs';

export default {
  async fetch(request) {
    if (isPublicEngagementRequest(request)) return handlePublicEngagement(request, process.env);
    return handlePublicContent(request, process.env);
  }
};
