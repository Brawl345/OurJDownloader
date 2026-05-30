import { type Credentials, MyJDownloaderClient } from './client.ts';

export class AuthManager {
  private static client = MyJDownloaderClient.getInstance();
  static async setCredentials(credentials: Credentials): Promise<void> {
    await AuthManager.client.setCredentials(credentials);
  }

  static async getCredentials(): Promise<Credentials | null> {
    return AuthManager.client.getCredentials();
  }

  static async clearCredentials(): Promise<void> {
    await AuthManager.client.clearAll();
  }

  static async signIn() {
    return AuthManager.client.signIn();
  }
}
