# 3. Server (Management) API — `/my/*`

These calls operate on the **account**, not on a specific JDownloader instance. They share one
shape: a signed GET whose response is AES ciphertext decrypted with the current
`serverEncryptionToken`.

## 3.1 Common request shape

```
GET https://api.jdownloader.org/my/<action>?sessiontoken=<cur>&rid=<rid>[&<extra>...]&signature=<sig>
```

- Always include `sessiontoken` and `rid`.
- `signature = HMAC_SHA256(serverEncryptionToken, "/my/<action>?sessiontoken=...&rid=...[&extra]")`,
  appended last. Sign the exact query string you send (§1.6).
- Response: HTTP 200, Base64 AES ciphertext. **Decrypt with `serverEncryptionToken`** (split into
  KEY/IV per §1.5). The decrypted JSON is the result directly (server responses are **not** wrapped
  in a `{"data": ...}` envelope — that wrapping is only for the device plane).
- Validate the echoed `rid`.

## 3.2 `/my/listdevices` — list registered JDownloader instances

```
GET /my/listdevices?sessiontoken=<cur>&rid=<rid>&signature=<sig>
```

**Decrypted response:**

```json
{
  "list": [
    { "id": "f9d03a21ddb917492dc1af8a6427f11", "name": "Home-PC", "type": "jd", "status": "..." }
  ],
  "rid": 1700000000000
}
```

Each device:

| Field | Meaning |
|-------|---------|
| `id` | 32-hex device id. Goes into the device URL path `t_<sessiontoken>_<id>`. |
| `name` | User-assigned device name. |
| `type` | Usually `"jd"` (a JDownloader instance). |
| `status` | Device status string (may be absent depending on server version). |

This is the bridge between the two planes: pick a device `id` here, then use the device API
([04-device-api.md](04-device-api.md)).

## 3.3 `/my/feedback` — send feedback to the service

```
GET /my/feedback?sessiontoken=<cur>&rid=<rid>&<feedback-params>&signature=<sig>
```

Sends a feedback/diagnostics message to MyJDownloader. Rarely needed for an automation client;
included for completeness (the official extension uses it for its "send feedback" button).

## 3.4 Account-management server calls

The following also live on the server plane and follow the same signed-GET shape. They manage the
**MyJDownloader account itself** (not premium hoster accounts inside a device — those are the device
`accountsV2` namespace in [05-endpoints-reference.md](05-endpoints-reference.md)). They are seldom
needed by automation and are listed for completeness:

| Action | Purpose |
|--------|---------|
| `/my/requestterminationemail` | Request an account-termination confirmation email. |
| password/email change flows | Performed via dedicated server endpoints in the official client; not required for normal API use. |

For an automation client you almost always only need **`/my/connect`**, **`/my/listdevices`**,
**`/my/reconnect`**, and **`/my/disconnect`** plus the device API.
