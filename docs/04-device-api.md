# 4. Device API — calling methods on a JDownloader instance

The device plane is how you actually control a JDownloader: add links, query the download list,
start/stop downloads, manage accounts, etc. Every device method shares one mechanism described here;
the individual methods are catalogued in [05-endpoints-reference.md](05-endpoints-reference.md).

## 4.1 Transport

```
POST https://api.jdownloader.org/t_<sessiontoken>_<deviceId>/<namespace>/<method>
Content-Type: application/aesjson-jd; charset=utf-8

<base64 of AES-128-CBC( deviceEncryptionToken, requestEnvelopeJson )>
```

- **Method is always POST.**
- The path embeds the **current `sessiontoken`** and the target **`deviceId`** (from
  `/my/listdevices`), then the method path (e.g. `/linkgrabberv2/addLinks`). The method path appears
  **twice in effect**: once in the URL and once inside the envelope's `url` field (see below).
- The request body is the **encrypted envelope**, Base64-encoded. Encrypt/decrypt with the
  **`deviceEncryptionToken`** split into KEY/IV (§1.5).
- The response (HTTP 200) is Base64 AES ciphertext, decrypted with the **same**
  `deviceEncryptionToken`.

The `Content-Type` header value `application/aesjson-jd; charset=utf-8` is expected by the server;
send it exactly.

## 4.2 The request envelope

The plaintext you encrypt is this JSON object:

```json
{
  "url": "/linkgrabberv2/addLinks",
  "params": [ ... ],
  "rid": 1700000000000,
  "apiVer": 1
}
```

| Field | Value |
|-------|-------|
| `url` | The method path, identical to the path in the URL (e.g. `/device/ping`). |
| `params` | Array of the method's positional arguments. **Encoding rules in §4.3.** Omit or use `[]` for no-arg methods. |
| `rid` | Request id (§2.1). The decrypted response echoes it; validate it. |
| `apiVer` | Always `1`. |

## 4.3 Parameter encoding — the important quirk

`params` is a JSON **array**, one element per positional argument of the method. How each argument
is encoded depends on its type:

| Argument kind | How it goes into `params` | Example element |
|---------------|---------------------------|-----------------|
| **Option/query object** (a `{...}` of flags, e.g. the addLinks options or a queryLinks selector) | Serialized to a **JSON string** (double-encoded) — a *string* element whose content is JSON. | `"{\"links\":\"http://...\",\"autostart\":false}"` |
| **Array of IDs** (link/package UUIDs) | Native JSON array. | `[123456789, 987654321]` |
| **Plain string** (an enum value, a name) | Native JSON string. | `"DELETE_ALL"` |
| **Number / boolean** | Native JSON value. | `true`, `2`, `1450430889576` |

So a complex options object is **stringified**, while simple scalars and id-arrays are passed
**natively**. This matches the official client and every working library.

### Why the double-encoding?

The MyJDownloader server expects each *object-typed* argument to arrive as a JSON string so it can
deserialize it into the corresponding Java POJO. Passing a raw JSON object instead of a string is
the #1 cause of `BAD_PARAMETERS` (HTTP 400). When in doubt for an object argument: `JSON.stringify`
it and place the resulting string in the array.

### Example: `addLinks`

Method `/linkgrabberv2/addLinks` takes a single options object. Envelope:

```json
{
  "url": "/linkgrabberv2/addLinks",
  "params": ["{\"links\":\"https://example.com/a.zip\\nhttps://example.com/b.zip\",\"autostart\":false,\"packageName\":\"My Package\",\"destinationFolder\":null,\"downloadPassword\":null,\"extractPassword\":null,\"priority\":\"DEFAULT\",\"overwritePackagizerRules\":false}"],
  "rid": 1700000000000,
  "apiVer": 1
}
```

Note `params[0]` is a **string** containing JSON, not an object.

### Example: `removeLinks` (id arrays, native)

```json
{
  "url": "/linkgrabberv2/removeLinks",
  "params": [[111,222], [333]],
  "rid": 1700000000000,
  "apiVer": 1
}
```

Here both arguments (linkIds, packageIds) are passed as **native arrays**, not stringified.

### `null` handling

If you build the options object as a string by hand, ensure `null` values are real JSON `null`
(not the string `"null"`). When you build an object and `JSON.stringify` it, this is automatic.

## 4.4 Response envelope

Device responses **are** wrapped:

```json
{ "data": <result>, "rid": 1700000000000 }
```

- `data` is the method's return value (could be a boolean, number, object, or array).
- Always check for an **error** shape instead (`{"error": {...}}` or top-level `src`/`type`); see
  [06-errors.md](06-errors.md).
- Validate `rid`.

## 4.5 No-argument calls

For methods with no parameters (e.g. `/device/ping`, `/downloadcontroller/start`), send
`"params": []` (or omit `params`). Example `/device/ping` envelope:

```json
{ "url": "/device/ping", "params": [], "rid": 1700000000000, "apiVer": 1 }
```

Successful decrypted response: `{ "data": true, "rid": 1700000000000 }`.

## 4.6 Direct connections (optional optimization — usually skip)

JDownloader can expose a **local** API on the LAN. The device method
`/device/getDirectConnectionInfos` returns candidate `ip:port` pairs. A client *may* try to reach
the device directly at `http://<ip>:<port>` (same encrypted envelope, same `deviceEncryptionToken`)
to bypass the relay server, falling back to `api.jdownloader.org` on failure.

This is purely a latency optimization. **For a correct, simple client, ignore it** and always go
through `api.jdownloader.org`. (There is also a legacy unauthenticated "RemoteAPI" on port 3128 that
must be explicitly enabled in JDownloader; it is deprecated and out of scope here.)
