import { MyJDownloaderClient } from './client.ts';

export interface LinkGrabberOptions {
  autostart?: boolean;
  packageName?: string;
  destinationFolder?: string;
  downloadPassword?: string;
  extractPassword?: string;
  priority?:
    | 'DEFAULT'
    | 'HIGH'
    | 'HIGHER'
    | 'HIGHEST'
    | 'LOW'
    | 'LOWER'
    | 'LOWEST';
  overwritePackagizerRules?: boolean;
}

export interface AddLinksResponse {
  data: {
    id: number;
    text: string | null;
    maxResults: number;
    crawlJobId: string;
    checking: boolean;
  };
  rid: number;
}

export class LinkGrabberManager {
  private static client = MyJDownloaderClient.getInstance();

  static async addLinks(
    deviceId: string,
    links: string[],
    options: LinkGrabberOptions = {},
  ): Promise<AddLinksResponse> {
    if (!Array.isArray(links) || links.length === 0) {
      throw new Error('Links array cannot be empty');
    }

    const params = {
      links: links.join('\n'),
      autostart: options.autostart ?? false,
      packageName: options.packageName ?? '',
      destinationFolder: options.destinationFolder ?? '',
      downloadPassword: options.downloadPassword ?? '',
      extractPassword: options.extractPassword ?? '',
      priority: options.priority ?? 'DEFAULT',
      overwritePackagizerRules: options.overwritePackagizerRules ?? false,
    };

    return await LinkGrabberManager.client.makeDeviceApiCall<AddLinksResponse>(
      deviceId,
      '/linkgrabberv2/addLinks',
      [JSON.stringify(params)],
    );
  }
}
