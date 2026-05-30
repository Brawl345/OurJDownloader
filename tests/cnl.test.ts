import { AES, CBC, Hex, NoPadding, Utf8 } from 'crypto-es';
import { describe, expect, it } from 'vitest';
import {
  decryptCNL,
  extractFormData,
  isCNLRequest,
} from '../lib/cnl/cnl-service';

const KEY_HEX = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

function encryptLinks(plaintext: string): string {
  // Pad to a 16-byte boundary since the CNL cipher uses NoPadding.
  let padded = plaintext;
  while (padded.length % 16 !== 0) padded += '\n';

  const key = Hex.parse(KEY_HEX);
  return AES.encrypt(Utf8.parse(padded), key, {
    mode: CBC,
    iv: key,
    padding: NoPadding,
  }).toString();
}

describe('isCNLRequest', () => {
  it('matches the flash/add endpoints port-agnostically', () => {
    expect(isCNLRequest('http://127.0.0.1:9666/flash/add')).toBe(true);
    expect(isCNLRequest('http://127.0.0.1:9666/flash/addcrypted2')).toBe(true);
    expect(isCNLRequest('http://127.0.0.1/flash/add')).toBe(true);
    expect(isCNLRequest('https://example.com/flash/add')).toBe(false);
  });
});

describe('extractFormData', () => {
  it('returns null when neither crypted nor urls are present', () => {
    expect(extractFormData({ passwords: ['x'] })).toBeNull();
  });

  it('passes through the relevant fields', () => {
    expect(extractFormData({ urls: ['http://a'] })).toMatchObject({
      urls: ['http://a'],
    });
  });
});

describe('decryptCNL', () => {
  it('decrypts a crypted+jk payload into clean links', async () => {
    const crypted = encryptLinks(
      'http://example.com/file1\nhttp://example.com/file2',
    );
    const result = await decryptCNL({
      crypted: [crypted],
      jk: [`function f(){ return '${KEY_HEX}'; }`],
      package: ['My Package'],
      passwords: ['extractpw', 'downloadpw'],
      source: ['http://source.example'],
    });

    expect(result.links).toEqual([
      'http://example.com/file1',
      'http://example.com/file2',
    ]);
    expect(result.packageName).toBe('My Package');
    expect(result.passwords).toEqual(['extractpw', 'downloadpw']);
    expect(result.sourceUrl).toBe('http://source.example');
  });

  it('handles the plaintext urls path', async () => {
    const result = await decryptCNL({
      urls: ['http://a.example/x\nhttp://b.example/y'],
    });
    expect(result.links).toEqual(['http://a.example/x', 'http://b.example/y']);
  });

  it('throws on an invalid jk key function', async () => {
    await expect(
      decryptCNL({ crypted: ['abc'], jk: ['function f(){ return "nope"; }'] }),
    ).rejects.toThrow();
  });
});
