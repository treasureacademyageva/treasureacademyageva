import { handleDeveloperConsole } from '../server/developer-console.mjs';

export default async function handler(request) {
  return handleDeveloperConsole(request);
}
