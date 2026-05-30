import { MyJDownloaderClient } from './client.ts';

export interface JDownloaderDevice {
  id: string;
  name: string;
  type: string;
}

export interface DeviceListResponse {
  list: JDownloaderDevice[];
  rid: number;
}

export interface AddLinksOptions {
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

export class DeviceManager {
  private static client = MyJDownloaderClient.getInstance();

  static async listDevices(): Promise<JDownloaderDevice[]> {
    const response =
      await DeviceManager.client.makeServerApiCall<DeviceListResponse>(
        '/my/listdevices',
      );

    if (!response.list || !Array.isArray(response.list)) {
      throw new Error('Invalid device list response format');
    }

    return response.list;
  }

  static async pingDevice(deviceId: string): Promise<boolean> {
    try {
      const response = await DeviceManager.client.makeDeviceApiCall<{
        data: boolean;
        rid: number;
      }>(deviceId, '/device/ping');
      return response.data === true;
    } catch {
      return false;
    }
  }

  static async addLinks(
    deviceId: string,
    links: string[],
    options: AddLinksOptions = {},
  ): Promise<unknown> {
    const linkParams = {
      links: links.join(','),
      autostart: options.autostart || false,
      packageName: options.packageName || null,
      destinationFolder: options.destinationFolder || null,
      downloadPassword: options.downloadPassword || null,
      extractPassword: options.extractPassword || null,
      priority: options.priority || 'DEFAULT',
      overwritePackagizerRules: options.overwritePackagizerRules || false,
    };

    return DeviceManager.client.makeDeviceApiCall(
      deviceId,
      '/linkgrabberv2/addLinks',
      [JSON.stringify(linkParams)],
    );
  }
}
