// MyJDownloader cryptography — see docs/01-concepts-and-crypto.md.
// All tokens are 32-byte values represented as 64 lowercase hex chars.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(hash);
}

// SHA256 over the raw-byte concatenation of two hex values (docs §1.4 — the
// `||` operator is byte concatenation, not hex-string concatenation).
async function sha256OfHexConcat(aHex: string, bHex: string): Promise<string> {
  const a = hexToBytes(aHex);
  const b = hexToBytes(bHex);
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a, 0);
  combined.set(b, a.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(hash);
}

export async function hmacSha256Hex(
  message: string,
  keyHex: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );
  return bytesToHex(signature);
}

// Split a 32-byte token into the AES-128-CBC IV (first 16 bytes) and KEY (last
// 16 bytes) — docs §1.5.
export function extractKeyAndIv(tokenHex: string): {
  keyHex: string;
  ivHex: string;
} {
  if (tokenHex.length !== 64) {
    throw new Error('Token must be 64 hex characters (32 bytes)');
  }
  return {
    ivHex: tokenHex.slice(0, 32),
    keyHex: tokenHex.slice(32, 64),
  };
}

export async function aesEncrypt(
  plaintext: string,
  tokenHex: string,
): Promise<string> {
  const { keyHex, ivHex } = extractKeyAndIv(tokenHex);
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: hexToBytes(ivHex) },
    key,
    encoder.encode(plaintext),
  );
  return bytesToBase64(encrypted);
}

export async function aesDecrypt(
  encryptedBase64: string,
  tokenHex: string,
): Promise<string> {
  const { keyHex, ivHex } = extractKeyAndIv(tokenHex);
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: hexToBytes(ivHex) },
    key,
    base64ToBytes(encryptedBase64),
  );
  return decoder.decode(decrypted);
}

export function loginSecret(email: string, password: string): Promise<string> {
  return sha256Hex(`${email.toLowerCase()}${password}server`);
}

export function deviceSecret(email: string, password: string): Promise<string> {
  return sha256Hex(`${email.toLowerCase()}${password}device`);
}

// First login: serverEncryptionToken = SHA256(loginSecret || sessiontoken).
export function initialServerToken(
  loginSecretHex: string,
  sessionTokenHex: string,
): Promise<string> {
  return sha256OfHexConcat(loginSecretHex, sessionTokenHex);
}

// On reconnect the server token CHAINS from the previous server token
// (docs §1.4.1) — this is the most common "works until it expires" bug.
export function chainServerToken(
  previousServerTokenHex: string,
  newSessionTokenHex: string,
): Promise<string> {
  return sha256OfHexConcat(previousServerTokenHex, newSessionTokenHex);
}

// The device token is stateless: always SHA256(deviceSecret || sessiontoken).
export function deviceToken(
  deviceSecretHex: string,
  sessionTokenHex: string,
): Promise<string> {
  return sha256OfHexConcat(deviceSecretHex, sessionTokenHex);
}

// Monotonic request id, like the official addon's getRID: parallel calls within
// the same millisecond must not collide, since the server treats a non-increasing
// rid as a replay.
let lastRid = 0;
export function newRid(): number {
  let rid = Date.now();
  if (rid <= lastRid) rid = lastRid + 1;
  lastRid = rid;
  return rid;
}
