# 2. Authentication & Session Lifecycle

All three handshake endpoints live on the server plane. Make sure
[01-concepts-and-crypto.md](01-concepts-and-crypto.md) is implemented first.

## 2.1 The request id (`rid`)

Every request carries a `rid` (request id), and the decrypted response echoes it back as
`"rid": <same value>`. Its only purpose is **replay protection**: after decrypting, verify the
response `rid` equals the one you sent; if it doesn't, treat the response as invalid (discard it /
re-issue).

- Use a **millisecond Unix timestamp** (`Date.now()` / `int(time.time()*1000)`). A monotonically
  increasing counter also works. The exact scheme is irrelevant to the server; uniqueness within a
  session and the echo-check are what matter.
- The official extension uses `rid = 0` specifically for the `/my/connect` call and a millisecond
  timestamp elsewhere; either works for `connect` as long as you validate the echo.

## 2.2 `/my/connect` — log in

Establishes a session from email + password.

```
GET https://api.jdownloader.org/my/connect?email=<email>&appkey=<appkey>&rid=<rid>&signature=<sig>
```

> The official extension issues this as **POST** (with an empty body); **GET also works** and is
> simplest. The signature is over the query string regardless of method, so pick one and sign
> exactly what you send.

**Query parameters (in this order):**

| Param | Value |
|-------|-------|
| `email` | account email (commonly sent as typed; the *secret* always uses the lowercased form) |
| `appkey` | a stable identifier for your application (any string, e.g. `"https://example.com"`, `"my-tool"`). It only needs to be consistent; it is part of the signed query. |
| `rid` | request id (see §2.1) |
| `signature` | `HMAC_SHA256(loginSecret, "/my/connect?email=...&appkey=...&rid=...")` — appended last |

**Signing:** the message is the path + query **without** `&signature=`:

```
/my/connect?email=user@example.com&appkey=https://example.com&rid=1700000000000
```
signed with the **loginSecret** bytes.

**Response:** HTTP 200, body is Base64 AES ciphertext. Decrypt by splitting the **loginSecret**
into KEY/IV (§1.5):

```json
{ "sessiontoken": "<64-hex>", "regaintoken": "<64-hex>", "rid": 1700000000000 }
```

After a successful connect:

1. Store `sessiontoken` and `regaintoken`.
2. Compute `serverEncryptionToken = SHA256(loginSecret || sessionTokenBytes)`.
3. Compute `deviceEncryptionToken = SHA256(deviceSecret || sessionTokenBytes)`.
4. Verify the echoed `rid`.

### Example (bash, illustrative)

```bash
email_lower=$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')
login_secret=$(printf '%s' "${email_lower}${PASSWORD}server" | openssl dgst -sha256 | awk '{print $2}')

rid=$(date +%s%3N)
query="email=${EMAIL}&appkey=${APPKEY}&rid=${rid}"
to_sign="/my/connect?${query}"
sig=$(printf '%s' "$to_sign" | openssl dgst -sha256 -mac HMAC -macopt hexkey:"$login_secret" | awk '{print $2}')

resp=$(curl -s "https://api.jdownloader.org/my/connect?${query}&signature=${sig}")

KEY=${login_secret:32:32}; IV=${login_secret:0:32}
echo "$resp" | base64 -d | openssl enc -aes-128-cbc -d -K "$KEY" -iv "$IV"
```

## 2.3 `/my/reconnect` — refresh the session

Use when the session went stale (timeout, `TOKEN_INVALID`, or HTTP 403). Obtains a **new**
`sessiontoken`/`regaintoken` without credentials.

```
GET https://api.jdownloader.org/my/reconnect?appkey=<appkey>&sessiontoken=<cur>&regaintoken=<cur>&rid=<rid>&signature=<sig>
```

- **`appkey` is required** and must be the same one used for `/my/connect`. Both official clients
  (the JDownloader Java `MyJDownloaderClient` and the browser addon) send it; the server scopes the
  regain token to the appkey, so omitting it makes every reconnect fail and only a full `/my/connect`
  recovers. (The param name is case-insensitive: the Java client sends `regaintoken`, the browser
  addon `regainToken`.)
- **Signed with the current `serverEncryptionToken`** (the one in effect *before* reconnecting).
- Decrypt the response with that **same current `serverEncryptionToken`**.

**Response** (same shape as connect):

```json
{ "sessiontoken": "<new-64-hex>", "regaintoken": "<new-64-hex>", "rid": <rid> }
```

After reconnect, **rotate the tokens** per §1.4.1:

```
serverEncryptionToken = SHA256( previousServerEncryptionToken || newSessionTokenBytes )   # chains!
deviceEncryptionToken = SHA256( deviceSecret || newSessionTokenBytes )                     # from deviceSecret
```

If reconnect fails (non-200, or the response can't be decrypted/parsed), fall back to a full
`/my/connect`.

## 2.4 `/my/disconnect` — end the session

```
GET https://api.jdownloader.org/my/disconnect?sessiontoken=<cur>&rid=<rid>&signature=<sig>
```

- Signed with the current `serverEncryptionToken`.
- Invalidates the session server-side. Discard all stored tokens afterward.
- The official extension uses POST here too; GET works.

## 2.5 Session lifecycle & when to reconnect

A session goes stale quickly. Recover **reactively** — detect failure *from the actual response*:

- HTTP **403**, or
- a decrypted error body with `type == "TOKEN_INVALID"` (or `"SESSION"` / `"SESSION_EXPIRED"`),

then **escalate the recovery**: call `/my/reconnect` and retry the original request once; if that
retry still fails, fall back to a full `/my/connect` (re-login from stored credentials) and retry
once more. Only if the fresh login also fails do you clear the session and require manual sign-in.

The full-login fallback is essential, not optional. The `serverEncryptionToken` chains statefully
(§1.4.1), so a single interruption — e.g. an MV3 service worker killed after the reconnect rotated
the server's chain but before the new token was persisted — leaves the chain desynced. From then on
every reconnect HTTP-succeeds yet yields a token the server rejects, so reconnect-and-retry can never
recover. A fresh `/my/connect` resets the chain to its stateless initial value and is the only escape.

Reactive handling is correct because the real expiry is server-controlled. A proactive "reconnect
after ~30 s idle" timer is **not** used: it manufactures extra reconnects (each one a rotation that
can race — see below) without preventing the occasional server-side expiry you must handle anyway.

### Reconnect must be single-flight (critical)

`/my/reconnect` **rotates both `sessiontoken` and `regaintoken`, and the old `regaintoken` is
single-use.** If two requests reconnect concurrently with the same `regaintoken`, the server honours
one and rejects the rest; the losers then hold a stale session whose `regaintoken` is already spent,
so every further reconnect fails and only a full `/my/connect` recovers. This bites whenever a UI
fires calls in parallel or popup and background act at once.

Serialize reconnects across **all** contexts (the official addon uses a global reconnect state +
queue and a cross-tab lock). A robust shape: take a lock (e.g. the Web Locks API, which is shared
across an extension's popup and service worker), then re-read the stored session — if another caller
already rotated it, reuse that fresh session instead of spending the `regaintoken` again.

### Recommended call wrapper (pseudocode)

```
function apiCall(...):
    triedReconnect = triedReLogin = false
    loop:
        try:
            return doRequest(...)
        on (httpStatus == 403 or error.type in {TOKEN_INVALID, SESSION, SESSION_EXPIRED}):
            if not triedReconnect:
                triedReconnect = true
                if reconnect():    # single-flight: lock + re-read session, see above
                    continue       # retry with the rotated tokens
            if not triedReLogin:
                triedReLogin = true
                if reLogin():      # single-flight full /my/connect; resets the chain
                    continue       # retry with the fresh session
                clearSession(); raise NeedLogin
            raise                  # even a fresh login didn't help
```

Both `reconnect()` and `reLogin()` are single-flight (lock + re-read session) so concurrent calls
across popup and background don't each spend the `regaintoken` or fire a redundant handshake.

## 2.6 What to persist

Persist only what you cannot recompute cheaply:

- `loginSecret`, `deviceSecret` (or the credentials to derive them),
- current `sessiontoken`, `regaintoken`,
- current `serverEncryptionToken` (needed because it **chains** across reconnects).

The `deviceEncryptionToken` can always be recomputed from `deviceSecret + sessiontoken`, so it need
not be stored. **Never log or persist the plaintext password unnecessarily.**
