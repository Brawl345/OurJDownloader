# MyJDownloader API — Complete Reference

This documentation describes the **MyJDownloader (My.JDownloader) HTTP API** completely
enough to build a working client in any language **without reading any source code, reverse
engineering, or inspecting other implementations.** Every encryption step, token derivation,
request envelope, and endpoint that is needed in practice is documented here with exact byte-level
detail.

The API is the same one used by the official browser extension, the official web interface
(`https://my.jdownloader.org`), and third-party libraries. It lets you remotely control one or
more **JDownloader** instances ("devices") that are registered to a MyJDownloader account.

## Documentation map

Read in order if you are implementing from scratch:

| File | Contents |
|------|----------|
| [01-concepts-and-crypto.md](01-concepts-and-crypto.md) | Mental model, the three encryption contexts, all secret/token derivations, AES & HMAC details. **Read this first — everything depends on it.** |
| [02-authentication.md](02-authentication.md) | `/my/connect`, `/my/reconnect`, `/my/disconnect`, session lifecycle, the `rid` and replay protection. |
| [03-server-api.md](03-server-api.md) | The "management" API on `/my/*`: listing devices, feedback, account-level calls. |
| [04-device-api.md](04-device-api.md) | The device API envelope: how to call any method on a JDownloader instance, parameter encoding rules, transport. |
| [05-endpoints-reference.md](05-endpoints-reference.md) | Reference of all relevant device endpoints (linkgrabber, downloads, accounts, system, config, events, …). |
| [06-errors.md](06-errors.md) | Error response format, all error types, HTTP status codes, recommended handling. |
| [07-recipes.md](07-recipes.md) | End-to-end worked examples, including a copy-pasteable `openssl`/`curl` walkthrough and language-agnostic pseudocode. |

## The 30-second mental model

1. **Two API "planes".** Requests either go to the **server** (`api.jdownloader.org/my/...`,
   account-level operations) or to a specific **device** (`api.jdownloader.org/t_<sessiontoken>_<deviceid>/...`,
   actually controlling a JDownloader instance). They use different encryption keys.

2. **Everything is encrypted.** Request bodies and all responses are **AES-128-CBC** ciphertext,
   Base64-encoded. The AES key/IV are derived from your password via SHA-256.

3. **Three secrets/tokens** are derived from your credentials and the session:
   - `loginSecret`  = `SHA256(emailLower + password + "server")`
   - `deviceSecret` = `SHA256(emailLower + password + "device")`
   - after login you receive a `sessiontoken`; combining it with the secrets gives the
     **serverEncryptionToken** and **deviceEncryptionToken** that actually encrypt traffic.

4. **GET requests are signed**, POST device requests are encrypted. The server echoes a request id
   (`rid`) you send, which you must validate to defeat replay attacks.

5. **Sessions are short-lived.** After ~30 s of inactivity (or any `TOKEN_INVALID`/HTTP 403), call
   `/my/reconnect` with your `regaintoken` to get a fresh `sessiontoken`.

## API root

```
https://api.jdownloader.org
```

All paths in this documentation are relative to that root unless stated otherwise. The full,
official (but incomplete) list of device method signatures lives at
<https://my.jdownloader.org/developers/>. This documentation supersedes it for everything you need
to authenticate and call the common endpoints.

## Conventions used in this documentation

- **Hex strings** are lowercase. A "token" is always 32 bytes = 64 hex characters (output of SHA-256).
- `||` means **byte concatenation** (not string concatenation — see the warning in
  [01-concepts-and-crypto.md](01-concepts-and-crypto.md)).
- `emailLower` = the account email lowercased (`email.toLowerCase()`).
- Code examples are illustrative pseudocode unless explicitly marked `bash`, `python`, etc.
