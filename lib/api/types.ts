export interface Credentials {
  email: string;
  password: string;
}

// Everything we persist about a live session. The deviceEncryptionToken is
// intentionally NOT stored — it can always be recomputed from deviceSecret +
// sessiontoken (docs §2.6). The serverToken, however, chains across reconnects
// and must be persisted (docs §1.4.1).
export interface SessionState {
  loginSecret: string;
  deviceSecret: string;
  sessiontoken: string;
  regaintoken: string;
  serverToken: string;
}

// Raw decrypted handshake response from /my/connect and /my/reconnect.
export interface HandshakeResponse {
  sessiontoken: string;
  regaintoken: string;
  rid: number;
}

export interface JDownloaderDevice {
  id: string;
  name: string;
  type: string;
  status?: string;
}

export interface DeviceListResponse {
  list: JDownloaderDevice[];
  rid: number;
}

// Device responses are wrapped (docs §4.4); server responses are not (§3.1).
export interface DeviceResponse<T> {
  data: T;
  rid: number;
}

export interface AddLinksOptions {
  autostart?: boolean;
  packageName?: string | null;
  destinationFolder?: string | null;
  downloadPassword?: string | null;
  extractPassword?: string | null;
  priority?:
    | 'HIGHEST'
    | 'HIGHER'
    | 'HIGH'
    | 'DEFAULT'
    | 'LOW'
    | 'LOWER'
    | 'LOWEST';
  overwritePackagizerRules?: boolean;
}

export interface AddLinksResult {
  id: number;
  text: string | null;
  maxResults: number;
  crawlJobId: string;
  checking: boolean;
}
