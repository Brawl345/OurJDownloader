import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { deviceCall, serverCall } from '../lib/api/client';
import { aesEncrypt, chainServerToken, deviceToken } from '../lib/api/crypto';
import { setSession } from '../lib/api/session';
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
