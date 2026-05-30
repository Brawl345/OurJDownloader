import CryptoES from 'crypto-es';
import { AES } from 'crypto-es/lib/aes';
import type { CNLDecryptedData, CNLFormData } from './cnl-types.ts';

const KEY_FUNCTION_REGEX = /return ["']([\dA-Fa-f]+)["']/;

export class CNLService {
  static async decryptCNL(formData: CNLFormData): Promise<CNLDecryptedData> {
    let decryptedLinks: string;

    if (formData.urls?.[0]) {
      decryptedLinks = formData.urls[0];
    } else if (formData.crypted?.[0] && formData.jk?.[0]) {
      const jkMatch = formData.jk[0].match(KEY_FUNCTION_REGEX);
      if (!jkMatch || !jkMatch[1]) {
        throw new Error('Invalid key function format');
      }

      const key = CryptoES.enc.Hex.parse(jkMatch[1]);
      const decrypted = AES.decrypt(formData.crypted[0], key, {
        mode: CryptoES.mode.CBC,
        iv: key,
        padding: CryptoES.pad.NoPadding,
      });

      try {
        decryptedLinks = CryptoES.enc.Utf8.stringify(decrypted);
      } catch {
        decryptedLinks = CryptoES.enc.Latin1.stringify(decrypted);
      }
    } else {
      throw new Error('No valid CNL data found');
    }

    const cleanedLinks = decryptedLinks
      .replace(/.*http/, 'http')
      .replaceAll(/\s+/g, '\n')
      .trim();

    const links = cleanedLinks
      .split('\n')
      .filter((link) => link.trim().length > 0);

    const passwords =
      formData.passwords?.filter((pw) => pw.trim().length > 0) || [];
    const packageName = formData.package?.[0]?.trim() || undefined;
    const sourceUrl = formData.source?.[0]?.trim() || undefined;

    return {
      links,
      passwords,
      packageName,
      sourceUrl,
    };
  }

  static isCNLRequest(url: string): boolean {
    return url.startsWith('http://127.0.0.1:9666/flash/add');
  }

  static extractFormData(formData: CNLFormData): CNLFormData | null {
    return {
      crypted: formData.crypted,
      jk: formData.jk,
      urls: formData.urls,
      passwords: formData.passwords,
      package: formData.package,
      source: formData.source,
    };
  }
}
