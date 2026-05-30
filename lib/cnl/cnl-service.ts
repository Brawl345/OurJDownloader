import { AES, CBC, Hex, Latin1, NoPadding, Utf8 } from 'crypto-es';
import type { CNLDecryptedData, CNLFormData } from './cnl-types';

// Extracts the hex key from a Click'n'Load `jk` function, e.g.
// `function f(){ return 'deadbeef...'; }`.
const KEY_FUNCTION_REGEX = /return ["']([\dA-Fa-f]+)["']/;

// Click'n'Load posts to 127.0.0.1:9666/flash/add or /flash/addcrypted2; match
// it port-agnostically (match patterns can't filter on the port).
const CNL_URL_REGEX = /^http:\/\/127\.0\.0\.1(?::\d+)?\/flash\/add/;

export function isCNLRequest(url: string): boolean {
  return CNL_URL_REGEX.test(url);
}

export function extractFormData(formData: CNLFormData): CNLFormData | null {
  const { crypted, jk, urls, passwords, package: pkg, source } = formData;
  if (!crypted && !urls) return null;
  return { crypted, jk, urls, passwords, package: pkg, source };
}

export async function decryptCNL(
  formData: CNLFormData,
): Promise<CNLDecryptedData> {
  let decryptedLinks: string;

  if (formData.urls?.[0]) {
    decryptedLinks = formData.urls[0];
  } else if (formData.crypted?.[0] && formData.jk?.[0]) {
    const jkMatch = formData.jk[0].match(KEY_FUNCTION_REGEX);
    if (!jkMatch?.[1]) {
      throw new Error('Invalid key function format');
    }

    const key = Hex.parse(jkMatch[1]);
    const decrypted = AES.decrypt(formData.crypted[0], key, {
      mode: CBC,
      iv: key,
      padding: NoPadding,
    });

    try {
      decryptedLinks = Utf8.stringify(decrypted);
    } catch {
      decryptedLinks = Latin1.stringify(decrypted);
    }
  } else {
    throw new Error('No valid CNL data found');
  }

  const links = decryptedLinks
    .replace(/.*http/, 'http')
    .replaceAll(/\s+/g, '\n')
    .trim()
    .split('\n')
    .filter((link) => link.trim().length > 0);

  return {
    links,
    passwords: formData.passwords?.filter((pw) => pw.trim().length > 0) ?? [],
    packageName: formData.package?.[0]?.trim() || undefined,
    sourceUrl: formData.source?.[0]?.trim() || undefined,
  };
}
