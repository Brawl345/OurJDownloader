// Centralized MyJDownloader client — see docs/02..04 and docs/07-recipes.md.
import {
  aesDecrypt,
  aesEncrypt,
  chainServerToken,
  deviceSecret,
  deviceToken,
  hmacSha256Hex,
  initialServerToken,
  loginSecret,
  newRid,
} from './crypto';
import {
  ApiError,
  isAuthError,
  isBackoffError,
  isTokenError,
  parseErrorShape,
  SessionError,
  toApiError,
} from './errors';
import {
  clearSession,
  getCredentials,
  getSession,
  setSession,
} from './session';
import type { DeviceResponse, HandshakeResponse, SessionState } from './types';

const API_ROOT = 'https://api.jdownloader.org';
const APPKEY = 'https://nyanya.de';
const MAX_BACKOFF_ATTEMPTS = 3;
const RECONNECT_LOCK = 'myjd-reconnect';

type LockRequest = <R>(name: string, callback: () => Promise<R>) => Promise<R>;

function enc(value: string): string {
  return encodeURIComponent(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Map a non-200 status to an ApiError type so the retry logic can react to it
// (docs §6.1 — a bare HTTP status with no decryptable body).
function apiErrorFromStatus(status: number): ApiError {
  if (status === 403) return new ApiError('TOKEN_INVALID', 'MYJD');
  if (status === 429) return new ApiError('TOO_MANY_REQUESTS', 'MYJD');
  if (status === 503) return new ApiError('MAINTENANCE', 'MYJD');
  if (status >= 500) return new ApiError('INTERNAL_SERVER_ERROR', 'MYJD');
  if (status === 400) return new ApiError('BAD_REQUEST', 'MYJD');
  return new ApiError('FAILED', 'MYJD');
}

// Decrypt + parse a response body. A body may be Base64 AES ciphertext (the
// normal case) or, for some errors, plaintext JSON (docs §6.1): try JSON first,
// then decrypt. Throws an ApiError/SessionError on any failure or error shape.
async function decryptAndParse(
  response: Response,
  tokenHex: string,
): Promise<unknown> {
  const text = (await response.text()).trim();
  let parsed: unknown;

  if (text) {
    parsed = tryJsonParse(text);
    if (parsed === undefined) {
      const decrypted = await aesDecrypt(text, tokenHex).catch(() => null);
      if (decrypted !== null) {
        parsed = tryJsonParse(decrypted);
      }
    }
  }

  if (parsed === undefined) {
    if (!response.ok) throw apiErrorFromStatus(response.status);
    throw new SessionError('Failed to decrypt API response');
  }

  const errorShape = parseErrorShape(parsed);
  if (errorShape) throw toApiError(errorShape);
  if (!response.ok) throw apiErrorFromStatus(response.status);

  return parsed;
}

// Replay protection (docs §2.1): the decrypted response must echo our rid.
function validateRid(parsed: unknown, expected: number): void {
  if (typeof parsed === 'object' && parsed !== null && 'rid' in parsed) {
    const rid = (parsed as { rid: unknown }).rid;
    if (typeof rid === 'number' && rid !== expected) {
      throw new SessionError('Response rid mismatch (possible replay)');
    }
  }
}

// Serialize reconnects across every extension context (popup + background) so
// the single-use regaintoken is consumed exactly once per rotation — mirrors the
// official addon's RECONNECT_STATE queue + ReconnectLock. Falls back to a direct
// call where the Web Locks API is unavailable (e.g. unit tests).
function withReconnectLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (
    globalThis.navigator as { locks?: { request: LockRequest } } | undefined
  )?.locks;
  if (!locks) return fn();
  return locks.request(RECONNECT_LOCK, fn);
}

// /my/reconnect — rotate and CHAIN the server token (docs §1.4.1, §2.3).
// `appkey` is REQUIRED here: both official clients (the JDownloader Java
// MyJDownloaderClient and the browser addon) send it, and the server scopes the
// regain token to the appkey — without it every reconnect fails and only a full
// /my/connect recovers. Param order/casing follow the Java client.
async function performReconnect(
  session: SessionState,
): Promise<SessionState | null> {
  const rid = newRid();
  const query = `appkey=${enc(APPKEY)}&sessiontoken=${session.sessiontoken}&regaintoken=${session.regaintoken}&rid=${rid}`;
  const signature = await hmacSha256Hex(
    `/my/reconnect?${query}`,
    session.serverToken,
  );

  try {
    const response = await fetch(
      `${API_ROOT}/my/reconnect?${query}&signature=${signature}`,
    );
    const parsed = (await decryptAndParse(
      response,
      session.serverToken,
    )) as HandshakeResponse;
    validateRid(parsed, rid);
    if (!parsed.sessiontoken || !parsed.regaintoken) return null;

    const serverToken = await chainServerToken(
      session.serverToken,
      parsed.sessiontoken,
    );
    const next: SessionState = {
      ...session,
      sessiontoken: parsed.sessiontoken,
      regaintoken: parsed.regaintoken,
      serverToken,
    };
    await setSession(next);
    return next;
  } catch {
    return null;
  }
}

// Coalesced reconnect: hold the cross-context lock, then re-check storage — if
// another call already rotated the session we reuse it instead of spending the
// single-use regaintoken a second time.
function reconnect(stale: SessionState): Promise<SessionState | null> {
  return withReconnectLock(async () => {
    const current = await getSession();
    if (!current) return null;
    if (current.sessiontoken !== stale.sessiontoken) return current;
    return performReconnect(current);
  });
}

// Coalesced full re-login: the recovery of last resort when reconnect can't
// restore a usable session. Because the serverToken chains across reconnects
// (docs §1.4.1), a single interruption (e.g. the MV3 service worker being killed
// mid-reconnect, before the rotated token is persisted) desyncs the chain — from
// then on every reconnect HTTP-succeeds but yields a token the server rejects. A
// fresh /my/connect resets the chain to its stateless initial value. Held under
// the same lock and guarded by a storage re-check so concurrent calls don't each
// fire a redundant handshake.
function recoverViaSignIn(stale: SessionState): Promise<SessionState | null> {
  return withReconnectLock(async () => {
    const current = await getSession();
    if (current && current.sessiontoken !== stale.sessiontoken) return current;
    await signIn();
    return getSession();
  });
}

// Run an API call with reactive recovery on session errors and exponential
// backoff on overload (docs §6.1, §6.4). The live server distinguishes two
// failure classes (verified empirically 2026-06 — the docs got this wrong):
//   - TOKEN_INVALID: the session is still alive but our serverToken/signature
//     is wrong (chain desync) → a reconnect can rotate us back in.
//   - AUTH_FAILED on a session-scoped call: the session is dead server-side
//     (expired/rotated/unknown) → reconnect would also AUTH_FAIL, so go
//     straight to a full re-login. Genuinely wrong credentials still surface,
//     because then /my/connect itself throws AUTH_FAILED.
// Both popup and background self-heal this way, so a dead session never
// requires a manual sign-in from the options page.
async function withSession<T>(
  doCall: (session: SessionState) => Promise<T>,
): Promise<T> {
  let session = await getSession();
  if (!session) throw new SessionError('Not signed in');

  let triedReconnect = false;
  let triedReSignIn = false;
  let backoffAttempts = 0;

  while (true) {
    try {
      return await doCall(session);
    } catch (error) {
      if (isTokenError(error) || isAuthError(error)) {
        if (isTokenError(error) && !triedReconnect) {
          triedReconnect = true;
          const next = await reconnect(session);
          if (next) {
            session = next;
            continue;
          }
        }
        if (!triedReSignIn) {
          triedReSignIn = true;
          const fresh = await recoverViaSignIn(session);
          if (fresh) {
            session = fresh;
            continue;
          }
          await clearSession();
          throw new SessionError('Session recovery failed');
        }
      }
      if (isBackoffError(error) && backoffAttempts < MAX_BACKOFF_ATTEMPTS) {
        await delay(500 * 2 ** backoffAttempts);
        backoffAttempts += 1;
        continue;
      }
      throw error;
    }
  }
}

// /my/connect — full login from stored credentials (docs §2.2).
export async function signIn(): Promise<void> {
  const credentials = await getCredentials();
  if (!credentials) throw new SessionError('No credentials configured');

  const login = await loginSecret(credentials.email, credentials.password);
  const device = await deviceSecret(credentials.email, credentials.password);

  const rid = newRid();
  const query = `email=${enc(credentials.email)}&appkey=${enc(APPKEY)}&rid=${rid}`;
  const signature = await hmacSha256Hex(`/my/connect?${query}`, login);

  const response = await fetch(
    `${API_ROOT}/my/connect?${query}&signature=${signature}`,
  );
  const parsed = (await decryptAndParse(response, login)) as HandshakeResponse;
  validateRid(parsed, rid);

  if (!parsed.sessiontoken || !parsed.regaintoken) {
    throw new SessionError('Invalid authentication response: missing tokens');
  }

  const serverToken = await initialServerToken(login, parsed.sessiontoken);
  await setSession({
    loginSecret: login,
    deviceSecret: device,
    sessiontoken: parsed.sessiontoken,
    regaintoken: parsed.regaintoken,
    serverToken,
  });
}

// Ensure there is a usable session, signing in if needed.
export async function ensureSignedIn(): Promise<void> {
  if (!(await getSession())) {
    await signIn();
  }
}

// A signed GET on the server plane; the decrypted JSON is the result directly
// (server responses are not wrapped — docs §3.1).
export function serverCall<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  return withSession(async (session) => {
    const rid = newRid();
    const query = new URLSearchParams({
      sessiontoken: session.sessiontoken,
      rid: String(rid),
      ...params,
    }).toString();
    const signature = await hmacSha256Hex(
      `${endpoint}?${query}`,
      session.serverToken,
    );
    const response = await fetch(
      `${API_ROOT}${endpoint}?${query}&signature=${signature}`,
    );
    const parsed = await decryptAndParse(response, session.serverToken);
    validateRid(parsed, rid);
    return parsed as T;
  });
}

// An encrypted POST on the device plane; returns the unwrapped `data` field of
// the response envelope (docs §4.4).
export function deviceCall<T>(
  deviceId: string,
  endpoint: string,
  params: unknown[] = [],
): Promise<T> {
  return withSession(async (session) => {
    const token = await deviceToken(session.deviceSecret, session.sessiontoken);
    const rid = newRid();
    const envelope = JSON.stringify({
      url: endpoint,
      params,
      rid,
      apiVer: 1,
    });
    const body = await aesEncrypt(envelope, token);

    const response = await fetch(
      `${API_ROOT}/t_${session.sessiontoken}_${deviceId}${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/aesjson-jd; charset=utf-8' },
        body,
      },
    );
    const parsed = await decryptAndParse(response, token);
    validateRid(parsed, rid);
    return (parsed as DeviceResponse<T>).data;
  });
}
