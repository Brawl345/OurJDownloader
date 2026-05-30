import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aesDecrypt,
  aesEncrypt,
  chainServerToken,
  deviceSecret,
  deviceToken,
  extractKeyAndIv,
  hmacSha256Hex,
  initialServerToken,
  loginSecret,
} from '../lib/api/crypto';

// Independent oracles using Node's crypto.
function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256ConcatHex(aHex: string, bHex: string): string {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex')]))
    .digest('hex');
}

describe('secret derivation (docs §1.2)', () => {
  it('lowercases the email but uses the password verbatim with the right salt', async () => {
    expect(await loginSecret('User@Example.COM', 'P@ss')).toBe(
      sha256Hex('user@example.comP@ssserver'),
    );
    expect(await deviceSecret('User@Example.COM', 'P@ss')).toBe(
      sha256Hex('user@example.comP@ssdevice'),
    );
  });
});

describe('key/iv split (docs §1.5)', () => {
  it('takes IV from the first 16 bytes and KEY from the last 16 bytes', () => {
    const token = '00'.repeat(16) + 'ff'.repeat(16);
    expect(extractKeyAndIv(token)).toEqual({
      ivHex: '00'.repeat(16),
      keyHex: 'ff'.repeat(16),
    });
  });

  it('rejects tokens that are not 32 bytes', () => {
    expect(() => extractKeyAndIv('abcd')).toThrow();
  });
});

describe('AES-128-CBC', () => {
  const token = '0123456789abcdef'.repeat(4); // 64 hex chars

  it('round-trips plaintext', async () => {
    const cipher = await aesEncrypt('hello world', token);
    expect(await aesDecrypt(cipher, token)).toBe('hello world');
  });

  it('produces ciphertext Node can decrypt with the split key/iv', async () => {
    const { keyHex, ivHex } = extractKeyAndIv(token);
    const cipher = await aesEncrypt('cross-checked', token);
    const decipher = createDecipheriv(
      'aes-128-cbc',
      Buffer.from(keyHex, 'hex'),
      Buffer.from(ivHex, 'hex'),
    );
    const out = Buffer.concat([
      decipher.update(Buffer.from(cipher, 'base64')),
      decipher.final(),
    ]);
    expect(out.toString('utf8')).toBe('cross-checked');
  });
});

describe('HMAC signatures (docs §1.6)', () => {
  it('signs with the token raw bytes as the key', async () => {
    const keyHex = 'ab'.repeat(32);
    const message = '/my/listdevices?sessiontoken=abc&rid=123';
    expect(await hmacSha256Hex(message, keyHex)).toBe(
      createHmac('sha256', Buffer.from(keyHex, 'hex'))
        .update(message)
        .digest('hex'),
    );
  });
});

describe('token derivation & chaining (docs §1.4.1)', () => {
  const t0 = 'aa'.repeat(32);
  const t1 = 'bb'.repeat(32);
  const t2 = 'cc'.repeat(32);

  it('derives the initial server token from the login secret', async () => {
    const login = await loginSecret('a@b.com', 'pw');
    expect(await initialServerToken(login, t0)).toBe(
      sha256ConcatHex(login, t0),
    );
  });

  it('chains the server token across reconnects (regression guard)', async () => {
    const login = await loginSecret('a@b.com', 'pw');
    const v0 = await initialServerToken(login, t0);
    const v1 = await chainServerToken(v0, t1);
    const v2 = await chainServerToken(v1, t2);

    // The chained token must differ from the naive recompute that breaks after
    // the first reconnect.
    const naive = await initialServerToken(login, t2);
    expect(v2).not.toBe(naive);
    expect(v2).toBe(sha256ConcatHex(sha256ConcatHex(v0, t1), t2));
  });

  it('always derives the device token from the device secret', async () => {
    const device = await deviceSecret('a@b.com', 'pw');
    expect(await deviceToken(device, t2)).toBe(sha256ConcatHex(device, t2));
  });
});
