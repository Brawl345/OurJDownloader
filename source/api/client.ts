import { CryptoUtils } from '../lib/crypto.ts';
import {
  ApiError,
  isTokenInvalidError,
  type MyJDownloaderError,
  TokenInvalidError,
} from './errors.ts';

interface ErrorResponse {
  error: MyJDownloaderError;
}

function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return typeof obj === 'object' && obj !== null && 'error' in obj;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SessionData {
  sessiontoken: string;
  regaintoken: string;
  rid: number;
}

export interface SecretsData {
  login_secret: string;
  device_secret: string;
  sessiontoken: string;
  regaintoken: string;
}

export class MyJDownloaderClient {
  private static readonly STORAGE_KEYS = {
    CREDENTIALS: 'myjd_credentials',
    SECRETS: 'myjd_secrets',
    LAST_CALL: 'myjd_last_call',
  };

  private static readonly APPKEY = 'https://nyanya.de';
  private static readonly DOMAIN = 'server';
  private static readonly SESSION_TIMEOUT = 30; // seconds

  private static instance: MyJDownloaderClient | null = null;

  static getInstance(): MyJDownloaderClient {
    if (!MyJDownloaderClient.instance) {
      MyJDownloaderClient.instance = new MyJDownloaderClient();
    }
    return MyJDownloaderClient.instance;
  }

  async setCredentials(credentials: Credentials): Promise<void> {
    await chrome.storage.local.set({
      [MyJDownloaderClient.STORAGE_KEYS.CREDENTIALS]: credentials,
    });
  }

  async getCredentials(): Promise<Credentials | null> {
    const result = await chrome.storage.local.get([
      MyJDownloaderClient.STORAGE_KEYS.CREDENTIALS,
    ]);
    return result[MyJDownloaderClient.STORAGE_KEYS.CREDENTIALS] || null;
  }

  async clearAll(): Promise<void> {
    await chrome.storage.local.remove([
      MyJDownloaderClient.STORAGE_KEYS.CREDENTIALS,
      MyJDownloaderClient.STORAGE_KEYS.SECRETS,
      MyJDownloaderClient.STORAGE_KEYS.LAST_CALL,
    ]);
  }

  async signIn(): Promise<SessionData> {
    const credentials = await this.getCredentials();
    if (!credentials) {
      throw new Error('No credentials found. Please set credentials first.');
    }

    const loginSecret = await CryptoUtils.calculateLoginSecret(
      credentials.email,
      credentials.password,
      MyJDownloaderClient.DOMAIN,
    );

    const rid = CryptoUtils.getRid();
    const baseUrl = 'https://api.jdownloader.org/my/connect';
    const query = `email=${encodeURIComponent(credentials.email)}&appkey=${encodeURIComponent(MyJDownloaderClient.APPKEY)}&rid=${rid}`;
    const queryToSign = `/my/connect?${query}`;

    const signature = await CryptoUtils.hmacSha256(queryToSign, loginSecret);
    const finalUrl = `${baseUrl}?${query}&signature=${signature}`;

    console.log('Request (/my/connect):', finalUrl);
    const response = await fetch(finalUrl);
    if (!response.ok) {
      throw new Error(`Sign-in failed: HTTP ${response.status}`);
    }

    const encryptedResponse = await response.text();
    if (!encryptedResponse) {
      throw new Error('Empty response from server');
    }

    const { keyHex, ivHex } = CryptoUtils.extractKeyAndIv(loginSecret);
    const decryptedJson = await CryptoUtils.aesDecrypt(
      encryptedResponse,
      keyHex,
      ivHex,
    );
    console.log('Decrypted JSON (/my/connect):', decryptedJson);

    let sessionData: SessionData;
    try {
      sessionData = JSON.parse(decryptedJson);
    } catch {
      throw new Error('Failed to parse authentication response');
    }

    if (!sessionData.sessiontoken || !sessionData.regaintoken) {
      throw new Error('Invalid authentication response: missing tokens');
    }

    const deviceSecret = await CryptoUtils.calculateDeviceSecret(
      credentials.email,
      credentials.password,
    );

    const secrets: SecretsData = {
      login_secret: loginSecret,
      device_secret: deviceSecret,
      sessiontoken: sessionData.sessiontoken,
      regaintoken: sessionData.regaintoken,
    };

    await chrome.storage.local.set({
      [MyJDownloaderClient.STORAGE_KEYS.SECRETS]: secrets,
      [MyJDownloaderClient.STORAGE_KEYS.LAST_CALL]: Date.now(),
    });

    return sessionData;
  }

  async makeServerApiCall<T>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      const secrets = await this.getSecrets();
      if (!secrets) {
        throw new TokenInvalidError('No active session found');
      }

      // Check if we need to reconnect due to timeout
      if (await this.needsReconnection()) {
        const reconnected = await this.tryReconnectSession();
        if (!reconnected) {
          await this.clearSession();
          throw new TokenInvalidError('Session reconnection failed');
        }
      }

      const serverEncryptionToken =
        await CryptoUtils.calculateServerEncryptionToken(
          secrets.login_secret,
          secrets.sessiontoken,
        );

      const rid = CryptoUtils.getRid();
      const queryParams = {
        sessiontoken: secrets.sessiontoken,
        rid: rid.toString(),
        ...params,
      };

      const query = new URLSearchParams(queryParams).toString();
      const queryToSign = `${endpoint}?${query}`;
      const signature = await CryptoUtils.hmacSha256(
        queryToSign,
        serverEncryptionToken,
      );
      const finalUrl = `https://api.jdownloader.org${endpoint}?${query}&signature=${signature}`;

      console.log(`Request (${endpoint}):`, finalUrl);
      try {
        const response = await fetch(finalUrl);

        if (!response.ok) {
          if (response.status === 403) {
            // Likely token invalid, clear session and retry if we haven't already
            await this.clearSession();
            if (retryCount === 0) {
              retryCount++;
              continue;
            }
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const encryptedResponse = await response.text();
        if (!encryptedResponse) {
          throw new Error('Empty response from server');
        }

        const { keyHex, ivHex } = CryptoUtils.extractKeyAndIv(
          serverEncryptionToken,
        );

        let decryptedJson: string;
        try {
          decryptedJson = await CryptoUtils.aesDecrypt(
            encryptedResponse,
            keyHex,
            ivHex,
          );
          console.log(`Decrypted JSON (${endpoint}):`, decryptedJson);
        } catch (decryptError) {
          console.error('Decryption failed:', decryptError);
          throw new Error('Failed to decrypt API response');
        }

        let parsedResponse: unknown;
        try {
          parsedResponse = JSON.parse(decryptedJson);
        } catch (parseError) {
          console.error('JSON parse failed:', parseError);
          console.error('Decrypted content:', decryptedJson);
          throw new Error('Failed to parse API response');
        }

        // Check if this is an error response
        if (isErrorResponse(parsedResponse)) {
          const apiError = ApiError.fromMyJDownloaderError(
            parsedResponse.error,
          );
          if (isTokenInvalidError(apiError)) {
            await this.clearSession();
            if (retryCount === 0) {
              retryCount++;
              continue;
            }
          }
          throw apiError;
        }

        await this.updateLastCall();
        // For server API calls, the response IS the data (not wrapped in {data: ...})
        return parsedResponse as T;
      } catch (error) {
        if (isTokenInvalidError(error) && retryCount === 0) {
          retryCount++;
          continue;
        }
        throw error;
      }
    }

    throw new TokenInvalidError('Max retries exceeded');
  }

  async makeDeviceApiCall<T>(
    deviceId: string,
    endpoint: string,
    params: string[] = [],
  ): Promise<T> {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      const secrets = await this.getSecrets();
      if (!secrets) {
        throw new TokenInvalidError('No active session found');
      }

      // Check if we need to reconnect due to timeout
      if (await this.needsReconnection()) {
        const reconnected = await this.tryReconnectSession();
        if (!reconnected) {
          await this.clearSession();
          throw new TokenInvalidError('Session reconnection failed');
        }
      }

      const deviceEncryptionToken =
        await CryptoUtils.calculateDeviceEncryptionToken(
          secrets.device_secret,
          secrets.sessiontoken,
        );

      const rid = CryptoUtils.getRid();
      const payload = {
        url: endpoint,
        params,
        rid,
        apiVer: 1,
      };

      const payloadJson = JSON.stringify(payload);
      const { keyHex, ivHex } = CryptoUtils.extractKeyAndIv(
        deviceEncryptionToken,
      );
      const encryptedPayload = await CryptoUtils.aesEncrypt(
        payloadJson,
        keyHex,
        ivHex,
      );

      const url = `https://api.jdownloader.org/t_${secrets.sessiontoken}_${deviceId}${endpoint}`;

      console.log(`Request (${endpoint}):`, url, 'Payload:', payloadJson);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/aesjson-jd; charset=utf-8',
          },
          body: encryptedPayload,
        });

        if (!response.ok) {
          if (response.status === 403) {
            await this.clearSession();
            if (retryCount === 0) {
              retryCount++;
              continue;
            }
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const encryptedResponse = await response.text();
        if (!encryptedResponse) {
          throw new Error('Empty response from server');
        }

        const decryptedJson = await CryptoUtils.aesDecrypt(
          encryptedResponse,
          keyHex,
          ivHex,
        );
        console.log(`Decrypted JSON (${endpoint}):`, decryptedJson);

        let parsedResponse: unknown;
        try {
          parsedResponse = JSON.parse(decryptedJson);
        } catch {
          throw new Error('Failed to parse API response');
        }

        // Check if this is an error response
        if (isErrorResponse(parsedResponse)) {
          const apiError = ApiError.fromMyJDownloaderError(
            parsedResponse.error,
          );
          if (isTokenInvalidError(apiError)) {
            await this.clearSession();
            if (retryCount === 0) {
              retryCount++;
              continue;
            }
          }
          throw apiError;
        }

        await this.updateLastCall();
        return parsedResponse as T;
      } catch (error) {
        if (isTokenInvalidError(error) && retryCount === 0) {
          retryCount++;
          continue;
        }
        throw error;
      }
    }

    throw new TokenInvalidError('Max retries exceeded');
  }

  private async getSecrets(): Promise<SecretsData | null> {
    const result = await chrome.storage.local.get([
      MyJDownloaderClient.STORAGE_KEYS.SECRETS,
    ]);
    return result[MyJDownloaderClient.STORAGE_KEYS.SECRETS] || null;
  }

  private async clearSession(): Promise<void> {
    await chrome.storage.local.remove([
      MyJDownloaderClient.STORAGE_KEYS.SECRETS,
      MyJDownloaderClient.STORAGE_KEYS.LAST_CALL,
    ]);
  }

  private async needsReconnection(): Promise<boolean> {
    const result = await chrome.storage.local.get([
      MyJDownloaderClient.STORAGE_KEYS.LAST_CALL,
    ]);
    const lastCall = result[MyJDownloaderClient.STORAGE_KEYS.LAST_CALL];

    if (!lastCall) {
      return true;
    }

    const elapsed = (Date.now() - lastCall) / 1000;
    return elapsed > MyJDownloaderClient.SESSION_TIMEOUT;
  }

  private async updateLastCall(): Promise<void> {
    await chrome.storage.local.set({
      [MyJDownloaderClient.STORAGE_KEYS.LAST_CALL]: Date.now(),
    });
  }

  private async tryReconnectSession(): Promise<boolean> {
    const secrets = await this.getSecrets();
    if (!secrets) {
      return false;
    }

    const rid = CryptoUtils.getRid();
    const baseUrl = 'https://api.jdownloader.org/my/reconnect';
    const query = `sessiontoken=${secrets.sessiontoken}&regaintoken=${secrets.regaintoken}&rid=${rid}`;
    const queryToSign = `/my/reconnect?${query}`;

    const serverToken = await CryptoUtils.calculateServerEncryptionToken(
      secrets.login_secret,
      secrets.sessiontoken,
    );

    const signature = await CryptoUtils.hmacSha256(queryToSign, serverToken);
    const finalUrl = `${baseUrl}?${query}&signature=${signature}`;

    console.log('Request (/my/reconnect):', finalUrl);
    try {
      const response = await fetch(finalUrl);
      if (!response.ok) {
        return false;
      }

      const encryptedResponse = await response.text();
      if (!encryptedResponse) {
        return false;
      }

      const { keyHex, ivHex } = CryptoUtils.extractKeyAndIv(serverToken);
      const decryptedJson = await CryptoUtils.aesDecrypt(
        encryptedResponse,
        keyHex,
        ivHex,
      );
      console.log('Decrypted JSON (/my/reconnect):', decryptedJson);

      let sessionData: SessionData;
      try {
        sessionData = JSON.parse(decryptedJson);
      } catch {
        return false;
      }

      if (!sessionData.sessiontoken || !sessionData.regaintoken) {
        return false;
      }

      const updatedSecrets: SecretsData = {
        ...secrets,
        sessiontoken: sessionData.sessiontoken,
        regaintoken: sessionData.regaintoken,
      };

      await chrome.storage.local.set({
        [MyJDownloaderClient.STORAGE_KEYS.SECRETS]: updatedSecrets,
        [MyJDownloaderClient.STORAGE_KEYS.LAST_CALL]: Date.now(),
      });

      return true;
    } catch {
      return false;
    }
  }
}
