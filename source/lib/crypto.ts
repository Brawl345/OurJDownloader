export class CryptoUtils {
  static async sha256(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return CryptoUtils.arrayBufferToHex(hash);
  }

  static async hmacSha256(message: string, keyHex: string): Promise<string> {
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);
    const keyBytes = CryptoUtils.hexToArrayBuffer(keyHex);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
    return CryptoUtils.arrayBufferToHex(signature);
  }

  static async aesDecrypt(
    encryptedBase64: string,
    keyHex: string,
    ivHex: string,
  ): Promise<string> {
    const encrypted = CryptoUtils.base64ToArrayBuffer(encryptedBase64);
    const key = CryptoUtils.hexToArrayBuffer(keyHex);
    const iv = CryptoUtils.hexToArrayBuffer(ivHex);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['decrypt'],
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      encrypted,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  static async aesEncrypt(
    plaintext: string,
    keyHex: string,
    ivHex: string,
  ): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const key = CryptoUtils.hexToArrayBuffer(keyHex);
    const iv = CryptoUtils.hexToArrayBuffer(ivHex);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['encrypt'],
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      data,
    );

    return CryptoUtils.arrayBufferToBase64(encrypted);
  }

  static arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  static hexToArrayBuffer(hex: string): ArrayBuffer {
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex string');
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }

  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  static getRid(): number {
    return Date.now();
  }

  static extractKeyAndIv(tokenHex: string): { keyHex: string; ivHex: string } {
    if (tokenHex.length !== 64) {
      throw new Error('Token must be 64 hex characters (32 bytes)');
    }
    return {
      keyHex: tokenHex.substring(32, 64), // Last 16 bytes (32-63)
      ivHex: tokenHex.substring(0, 32), // First 16 bytes (0-31)
    };
  }

  static combineHexStrings(hex1: string, hex2: string): string {
    return hex1 + hex2;
  }

  static async calculateLoginSecret(
    email: string,
    password: string,
    domain: string,
  ): Promise<string> {
    const emailLower = email.toLowerCase();
    const loginInput = `${emailLower}${password}${domain}`;
    return CryptoUtils.sha256(loginInput);
  }

  static async calculateDeviceSecret(
    email: string,
    password: string,
  ): Promise<string> {
    const emailLower = email.toLowerCase();
    const deviceInput = `${emailLower}${password}device`;
    return CryptoUtils.sha256(deviceInput);
  }

  static async calculateServerEncryptionToken(
    loginSecretHex: string,
    sessionTokenHex: string,
  ): Promise<string> {
    // Combine the hex strings and convert to bytes before hashing (like bash xxd -r -p)
    const combined = CryptoUtils.combineHexStrings(
      loginSecretHex,
      sessionTokenHex,
    );
    const combinedBytes = CryptoUtils.hexToArrayBuffer(combined);
    const hash = await crypto.subtle.digest('SHA-256', combinedBytes);
    return CryptoUtils.arrayBufferToHex(hash);
  }

  static async calculateDeviceEncryptionToken(
    deviceSecretHex: string,
    sessionTokenHex: string,
  ): Promise<string> {
    // Combine the hex strings and convert to bytes before hashing (like bash xxd -r -p)
    const combined = CryptoUtils.combineHexStrings(
      deviceSecretHex,
      sessionTokenHex,
    );
    const combinedBytes = CryptoUtils.hexToArrayBuffer(combined);
    const hash = await crypto.subtle.digest('SHA-256', combinedBytes);
    return CryptoUtils.arrayBufferToHex(hash);
  }
}
