import { deviceCall } from './client';
import type { AddLinksOptions, AddLinksResult } from './types';

// Adds links to the LinkGrabber. The single object argument is JSON-stringified
// into params[0] (docs §4.3); unset fields are real JSON null, and multiple
// links are separated by newlines (docs §5.2).
export function addLinks(
  deviceId: string,
  links: string[],
  options: AddLinksOptions = {},
): Promise<AddLinksResult> {
  if (links.length === 0) {
    throw new Error('Links array cannot be empty');
  }

  const optionsObject = {
    links: links.join('\n'),
    autostart: options.autostart ?? false,
    packageName: options.packageName ?? null,
    destinationFolder: options.destinationFolder ?? null,
    downloadPassword: options.downloadPassword ?? null,
    extractPassword: options.extractPassword ?? null,
    priority: options.priority ?? 'DEFAULT',
    overwritePackagizerRules: options.overwritePackagizerRules ?? false,
  };

  return deviceCall<AddLinksResult>(deviceId, '/linkgrabberv2/addLinks', [
    JSON.stringify(optionsObject),
  ]);
}
