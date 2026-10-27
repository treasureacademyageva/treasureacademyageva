import { handlePublicContent } from '../server/public-content.mjs';
import { handlePublicEngagement, isPublicEngagementRequest } from '../server/public-engagement.mjs';
import { handlePublicDiscovery, isPublicDiscoveryRequest } from '../server/public-discovery.mjs';

export default {
  async fetch(request) {
    if (isPublicEngagementRequest(request)) return handlePublicEngagement(request, process.env);
    if (isPublicDiscoveryRequest(request)) return handlePublicDiscovery(request, process.env);
    return handlePublicContent(request, process.env);
  }
};
