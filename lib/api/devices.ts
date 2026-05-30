import { deviceCall, serverCall } from './client';
import type { DeviceListResponse, JDownloaderDevice } from './types';

export async function listDevices(): Promise<JDownloaderDevice[]> {
  const response = await serverCall<DeviceListResponse>('/my/listdevices');
  if (!Array.isArray(response.list)) {
    throw new Error('Invalid device list response');
  }
  return response.list;
}

export async function pingDevice(deviceId: string): Promise<boolean> {
  try {
    const alive = await deviceCall<boolean>(deviceId, '/device/ping');
    return alive === true;
  } catch {
    return false;
  }
}
