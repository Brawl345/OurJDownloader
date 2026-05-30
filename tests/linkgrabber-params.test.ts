import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deviceCall } = vi.hoisted(() => ({ deviceCall: vi.fn() }));
vi.mock('../lib/api/client', () => ({ deviceCall }));

import { addLinks } from '../lib/api/linkgrabber';

beforeEach(() => {
  deviceCall.mockReset();
});

describe('addLinks param encoding (docs §4.3 / §5.2)', () => {
  it('sends a single stringified options object with newline-joined links', async () => {
    await addLinks('dev1', ['http://a/1', 'http://b/2'], {
      packageName: 'My Package',
      extractPassword: 'secret',
    });

    expect(deviceCall).toHaveBeenCalledTimes(1);
    const [deviceId, endpoint, params] = deviceCall.mock.calls[0] ?? [];
    expect(deviceId).toBe('dev1');
    expect(endpoint).toBe('/linkgrabberv2/addLinks');
    expect(params).toHaveLength(1);

    // params[0] must be a JSON *string*, not an object (the #1 BAD_PARAMETERS cause).
    expect(typeof params[0]).toBe('string');
    const options = JSON.parse(params[0]);
    expect(options.links).toBe('http://a/1\nhttp://b/2');
    expect(options.packageName).toBe('My Package');
    expect(options.extractPassword).toBe('secret');
  });

  it('uses real JSON null for unset fields and sane defaults', async () => {
    await addLinks('dev1', ['http://only/1']);
    const options = JSON.parse((deviceCall.mock.calls[0] ?? [])[2][0]);

    expect(options.downloadPassword).toBeNull();
    expect(options.destinationFolder).toBeNull();
    expect(options.packageName).toBeNull();
    expect(options.autostart).toBe(false);
    expect(options.priority).toBe('DEFAULT');
    expect(options.overwritePackagizerRules).toBe(false);
  });

  it('rejects an empty link list', () => {
    expect(() => addLinks('dev1', [])).toThrow();
    expect(deviceCall).not.toHaveBeenCalled();
  });
});
