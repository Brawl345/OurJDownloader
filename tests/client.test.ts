import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { deviceCall, serverCall } from '../lib/api/client';
import {
  aesEncrypt,
  chainServerToken,
  deviceToken,
  initialServerToken,
  loginSecret,
} from '../lib/api/crypto';
import { setCredentials, setSession } from '../lib/api/session';
import type { SessionState } from '../lib/api/types';

const SESSION: SessionState = {
  loginSecret: 'aa'.repeat(32),
  deviceSecret: 'bb'.repeat(32),
  sessiontoken: 'cc'.repeat(32),
  regaintoken: 'dd'.repeat(32),
  serverToken: 'ee'.repeat(32),
};

function response(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function encryptWith(tokenHex: string, payload: unknown): Promise<string> {
  return aesEncrypt(JSON.stringify(payload), tokenHex);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  fakeBrowser.reset();
  await setSession(SESSION);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serverCall reconnect + retry-once (docs §2.5)', () => {
  it('reconnects on HTTP 403, chains the token, and retries once', async () => {
    const newSession = 'a1'.repeat(32);
    const chained = await chainServerToken(SESSION.serverToken, newSession);

    const reconnectBody = await encryptWith(SESSION.serverToken, {
      sessiontoken: newSession,
      regaintoken: 'a2'.repeat(32),
    });
    const listBody = await encryptWith(chained, {
      list: [{ id: 'd1', name: 'PC', type: 'jd' }],
    });

    fetchMock
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200, reconnectBody))
      .mockResolvedValueOnce(response(200, listBody));

    const result = await serverCall<{ list: { id: string }[] }>(
      '/my/listdevices',
    );

    expect(result.list[0]?.id).toBe('d1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/my/reconnect');
  });

  it('sends the reconnect params both official clients use (appkey + sessiontoken + regaintoken)', async () => {
    const reconnectBody = await encryptWith(SESSION.serverToken, {
      sessiontoken: 'a1'.repeat(32),
      regaintoken: 'a2'.repeat(32),
    });
    const chained = await chainServerToken(SESSION.serverToken, 'a1'.repeat(32));
    const listBody = await encryptWith(chained, { list: [] });
    fetchMock
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200, reconnectBody))
      .mockResolvedValueOnce(response(200, listBody));

    await serverCall('/my/listdevices');

    const reconnectUrl = String(fetchMock.mock.calls[1]?.[0]);
    // appkey is required — the server scopes the regain token to it.
    expect(reconnectUrl).toContain('appkey=');
    expect(reconnectUrl).toContain(`sessiontoken=${SESSION.sessiontoken}`);
    expect(reconnectUrl).toContain(`regaintoken=${SESSION.regaintoken}`);
  });
});

// A real, serializing Web Locks stand-in so we can assert the cross-context
// single-flight reconnect (jsdom has no navigator.locks).
function installSerialLock(): void {
  let chain: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, cb: () => Promise<unknown>) => {
        const run = chain.then(() => cb());
        chain = run.catch(() => undefined);
        return run;
      },
    },
  });
}

describe('concurrent reconnect is coalesced (single-flight)', () => {
  it('fires /my/reconnect once for two parallel token-invalid calls', async () => {
    installSerialLock();
    const oldToken = SESSION.sessiontoken;
    const newSession = 'a1'.repeat(32);
    const chained = await chainServerToken(SESSION.serverToken, newSession);

    const reconnectBody = await encryptWith(SESSION.serverToken, {
      sessiontoken: newSession,
      regaintoken: 'a2'.repeat(32),
    });
    const listBody = await encryptWith(chained, { list: [] });

    let reconnectCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/my/reconnect')) {
        reconnectCalls += 1;
        return response(200, reconnectBody);
      }
      if (url.includes(`sessiontoken=${oldToken}`)) return response(403);
      return response(200, listBody);
    });

    const [a, b] = await Promise.all([
      serverCall<{ list: unknown[] }>('/my/listdevices'),
      serverCall<{ list: unknown[] }>('/my/listdevices'),
    ]);

    expect(a.list).toEqual([]);
    expect(b.list).toEqual([]);
    expect(reconnectCalls).toBe(1);
  });
});

describe('serverCall recovers from a desynced session via full re-login', () => {
  it('falls back to /my/connect when a call still fails after a reconnect', async () => {
    const credentials = { email: 'foo@bar.com', password: 'pw' };
    await setCredentials(credentials);

    const login = await loginSecret(credentials.email, credentials.password);
    const reconnectSession = 'a1'.repeat(32);
    const connectSession = 'b1'.repeat(32);

    // Reconnect HTTP-succeeds but its chained token is rejected (simulating a
    // desynced chain), so the retry must fall back to a fresh handshake.
    const reconnectBody = await encryptWith(SESSION.serverToken, {
      sessiontoken: reconnectSession,
      regaintoken: 'a2'.repeat(32),
    });
    const connectBody = await encryptWith(login, {
      sessiontoken: connectSession,
      regaintoken: 'b2'.repeat(32),
    });
    const freshToken = await initialServerToken(login, connectSession);
    const listBody = await encryptWith(freshToken, {
      list: [{ id: 'd1', name: 'PC', type: 'jd' }],
    });

    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/my/connect')) return response(200, connectBody);
      if (url.includes('/my/reconnect')) return response(200, reconnectBody);
      listCalls += 1;
      // Original session and the (desynced) reconnected session both fail.
      if (listCalls <= 2) return response(403);
      return response(200, listBody);
    });

    const result = await serverCall<{ list: { id: string }[] }>(
      '/my/listdevices',
    );

    expect(result.list[0]?.id).toBe('d1');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/my/reconnect'))).toBe(true);
    expect(urls.some((u) => u.includes('/my/connect'))).toBe(true);
  });
});

// The live server answers session-scoped calls on a DEAD session (expired or
// rotated away) with 403 {"src":"MYJD","type":"AUTH_FAILED"} — not
// TOKEN_INVALID (verified against the real API, 2026-06). A reconnect would
// also AUTH_FAIL, so recovery must go straight to a full re-login.
describe('serverCall recovers from a dead session (AUTH_FAILED)', () => {
  const AUTH_FAILED_BODY = JSON.stringify({ src: 'MYJD', type: 'AUTH_FAILED' });

  it('re-logins without trying a reconnect, then retries the call', async () => {
    const credentials = { email: 'foo@bar.com', password: 'pw' };
    await setCredentials(credentials);

    const login = await loginSecret(credentials.email, credentials.password);
    const connectSession = 'b1'.repeat(32);
    const connectBody = await encryptWith(login, {
      sessiontoken: connectSession,
      regaintoken: 'b2'.repeat(32),
    });
    const freshToken = await initialServerToken(login, connectSession);
    const listBody = await encryptWith(freshToken, {
      list: [{ id: 'd1', name: 'PC', type: 'jd' }],
    });

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/my/connect')) return response(200, connectBody);
      if (url.includes(`sessiontoken=${SESSION.sessiontoken}`))
        return response(403, AUTH_FAILED_BODY);
      return response(200, listBody);
    });

    const result = await serverCall<{ list: { id: string }[] }>(
      '/my/listdevices',
    );

    expect(result.list[0]?.id).toBe('d1');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/my/connect'))).toBe(true);
    expect(urls.some((u) => u.includes('/my/reconnect'))).toBe(false);
  });

  it('surfaces AUTH_FAILED when the credentials themselves are wrong', async () => {
    await setCredentials({ email: 'foo@bar.com', password: 'wrong' });

    fetchMock.mockResolvedValue(response(403, AUTH_FAILED_BODY));

    await expect(serverCall('/my/listdevices')).rejects.toMatchObject({
      type: 'AUTH_FAILED',
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // Exactly one recovery attempt: the failing call, then /my/connect.
    expect(urls.filter((u) => u.includes('/my/connect'))).toHaveLength(1);
  });
});

describe('serverCall backoff (docs §6.4)', () => {
  it('retries after an OVERLOAD/429 without reconnecting', async () => {
    const listBody = await encryptWith(SESSION.serverToken, { list: [] });
    fetchMock
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, listBody));

    const result = await serverCall<{ list: unknown[] }>('/my/listdevices');

    expect(result.list).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // No reconnect — both calls hit the original endpoint.
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/my/listdevices');
  });
});

describe('rid validation (docs §2.1)', () => {
  it('rejects a response whose echoed rid does not match', async () => {
    const body = await encryptWith(SESSION.serverToken, { list: [], rid: 1 });
    fetchMock.mockResolvedValue(response(200, body));

    await expect(serverCall('/my/listdevices')).rejects.toThrow();
  });
});

describe('deviceCall (docs §4.4)', () => {
  it('POSTs an encrypted envelope and unwraps the data field', async () => {
    const token = await deviceToken(SESSION.deviceSecret, SESSION.sessiontoken);
    const body = await encryptWith(token, { data: true });
    fetchMock.mockResolvedValue(response(200, body));

    const alive = await deviceCall<boolean>('dev1', '/device/ping');

    expect(alive).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain(`/t_${SESSION.sessiontoken}_dev1/device/ping`);
    expect((init as RequestInit).method).toBe('POST');
  });
});
