# 1. Concepts & Cryptography

This is the foundation. Authentication and every request depend on getting these derivations
byte-for-byte correct. Implement and unit-test this layer **before** touching any endpoint.

## 1.1 The two API planes

| Plane | URL shape | Purpose | Encrypted/signed with |
|-------|-----------|---------|-----------------------|
| **Server (management)** | `https://api.jdownloader.org/my/<action>` | Account operations: log in, list devices, reconnect, feedback. | `loginSecret` (only for `/my/connect`), otherwise `serverEncryptionToken` |
| **Device** | `https://api.jdownloader.org/t_<sessiontoken>_<deviceId>/<namespace>/<method>` | Control a specific JDownloader instance: add links, query downloads, start/stop, etc. | `deviceEncryptionToken` |

`<sessiontoken>` and `<deviceId>` are inserted literally into the device URL path, separated by
underscores, prefixed with `t_`. Example:

```
https://api.jdownloader.org/t_18b35c3a...e1_f9d03a21ddb917492dc1af8a6427f11/device/ping
```

## 1.2 Secrets derived from credentials

Two secrets are computed **once** from the user's credentials. They never leave the client.

```
loginSecret  = SHA256( bytes(emailLower) + bytes(password) + bytes("server") )
deviceSecret = SHA256( bytes(emailLower) + bytes(password) + bytes("device") )
```

- `emailLower` is the email **lowercased**. The password is used **as typed** (not lowercased).
- The three parts are UTF-8 byte strings concatenated, then hashed once with SHA-256.
- Each secret is 32 bytes (64 hex chars).
- The literal salt is the word `"server"` for the login secret and `"device"` for the device
  secret (both lowercase).

```python
import hashlib
def secret(email, password, domain):
    return hashlib.sha256((email.lower() + password + domain.lower()).encode("utf-8")).digest()
login_secret  = secret(email, password, "server")
device_secret = secret(email, password, "device")
```

## 1.3 Session tokens (returned by the server)

`/my/connect` (login) returns, after decryption:

```json
{ "sessiontoken": "<64-hex>", "regaintoken": "<64-hex>", "rid": <number> }
```

- **`sessiontoken`** — identifies the live session; goes into device URLs and is mixed into the
  encryption tokens below. Rotates on every reconnect.
- **`regaintoken`** — long-lived "refresh token"; used with `/my/reconnect` to obtain a new
  `sessiontoken` without re-sending credentials. Also rotates on reconnect.

## 1.4 Encryption tokens — the critical derivation

The secrets are **not** used to encrypt normal traffic directly. They are combined with the
`sessiontoken` to produce the tokens that do:

```
serverEncryptionToken  (first login) = SHA256( loginSecret  || sessionTokenBytes )
deviceEncryptionToken  (always)      = SHA256( deviceSecret || sessionTokenBytes )
```

where `sessionTokenBytes = hexDecode(sessiontoken)` (the 32 raw bytes, **not** the hex string).

> ⚠️ **`||` is byte concatenation.** You concatenate the 32 raw bytes of the first value with the
> 32 raw bytes of the session token, giving 64 bytes, then SHA-256 that. A common bug is to
> concatenate the *hex strings* and hash the ASCII — that gives the wrong token. If you keep tokens
> as hex strings internally, you must `hexDecode(a) + hexDecode(b)` before hashing.

### 1.4.1 Token rotation on reconnect (read carefully)

When you reconnect (`/my/reconnect`) you get a **new** `sessiontoken`. The two tokens are then
recomputed differently:

```
# deviceEncryptionToken: ALWAYS recomputed from the original deviceSecret
deviceEncryptionToken = SHA256( deviceSecret || newSessionTokenBytes )

# serverEncryptionToken: CHAINS from the PREVIOUS serverEncryptionToken
serverEncryptionToken = SHA256( previousServerEncryptionToken || newSessionTokenBytes )
```

So:

- The **device** token is stateless: `SHA256(deviceSecret || currentSessionToken)` at any time.
- The **server** token is stateful: after the first login it is `SHA256(loginSecret || token0)`;
  after the first reconnect it is `SHA256(SHA256(loginSecret || token0) || token1)`; and so on.
  You must keep the current `serverEncryptionToken` around and chain from it.

> ⚠️ **Implementation warning.** This chaining is what the official MyJDownloader extension and the
> reference Python library do, and it is what the server expects. Some simpler reference
> implementations recompute the server token as `SHA256(loginSecret || currentSessionToken)` every
> time — this is correct for the *initial* session but **breaks after the first reconnect**, causing
> silent decryption failures / `403`s. Implement the chaining version. The device token has no such
> subtlety (always from `deviceSecret`).

## 1.5 AES-128-CBC: key, IV, and how a token is split

Every encrypted payload uses **AES-128-CBC with PKCS#7 padding**. The 32-byte token provides both
the IV and the key by splitting it in half:

```
IV  = token[0:16]    # first 16 bytes  (hex chars 0..31)
KEY = token[16:32]   # last 16 bytes   (hex chars 32..63)
```

Note this is **AES-128** (16-byte key), even though the token is 32 bytes — the first half is the
IV, not part of the key.

- **Encrypt** (device request bodies): `base64( AES128CBC_encrypt(KEY, IV, PKCS7pad(plaintext)) )`
- **Decrypt** (all responses): `PKCS7unpad( AES128CBC_decrypt(KEY, IV, base64decode(ciphertext)) )`

The token used to split depends on the plane:

| What you are doing | Token to split into KEY/IV |
|--------------------|----------------------------|
| Decrypt `/my/connect` response | `loginSecret` |
| Sign/decrypt other `/my/*` calls | current `serverEncryptionToken` |
| Encrypt/decrypt device calls | current `deviceEncryptionToken` |

### Worked example with OpenSSL

Given `token` (64 hex chars) and a Base64 ciphertext from the server:

```bash
KEY=${token:32:32}   # last 16 bytes
IV=${token:0:32}     # first 16 bytes
echo "$ciphertext_b64" | base64 -d | openssl enc -aes-128-cbc -d -K "$KEY" -iv "$IV"
```

Encrypting a device payload:

```bash
echo -n "$plaintext" | openssl enc -aes-128-cbc -e -K "$KEY" -iv "$IV" | base64 -w 0
```

## 1.6 HMAC request signatures

GET requests to the server plane (and the login/reconnect handshakes) are authenticated with an
**HMAC-SHA256 signature** appended as the last query parameter:

```
signature = hex( HMAC_SHA256(key = signingToken, message = queryStringToSign) )
```

- `queryStringToSign` is the **path plus query string, without the leading host and without the
  `&signature=...` part** — i.e. exactly the URL you are about to request, minus the host and minus
  the signature parameter. Example to sign: `/my/listdevices?sessiontoken=abc&rid=123`.
- The **HMAC key** is the relevant token **as raw bytes**:
  - `/my/connect` → key is `loginSecret`
  - all other `/my/*` GET calls and `/my/reconnect` → key is the current `serverEncryptionToken`
- You then send `...&signature=<hex>` as the final parameter.

> The signature must cover the **exact** query string you transmit, parameter order and URL-encoding
> included. Build the query string once, sign that string, then append `&signature=`. Do not
> re-order or re-encode afterwards.

```python
import hmac, hashlib
def sign(query_to_sign: str, token_bytes: bytes) -> str:
    return hmac.new(token_bytes, query_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
```

## 1.7 Summary cheat-sheet

```
loginSecret            = SHA256(emailLower + password + "server")          # 32 bytes
deviceSecret           = SHA256(emailLower + password + "device")          # 32 bytes
sessiontoken/regaintoken                                                   # from /my/connect

serverEncryptionToken  = SHA256(loginSecret || sessionTokenBytes)          # first login
                       = SHA256(prevServerToken || newSessionTokenBytes)   # after reconnect (chain)
deviceEncryptionToken  = SHA256(deviceSecret || sessionTokenBytes)         # always

IV  = token[0:16]      KEY = token[16:32]      (AES-128-CBC, PKCS#7)
signature = HMAC_SHA256(token_bytes, "/path?query")  → hex
```
