# 6. Errors

## 6.1 How errors arrive

An error can surface two ways:

1. **HTTP status ≠ 200.** Common: `400` (bad request/parameters), `403` (auth/token problem),
   `500` (server). The body may be plaintext JSON **or** AES ciphertext — try parsing it as JSON
   first, and if that fails, decrypt with the relevant token (server or device) and parse.

2. **HTTP 200 with an error payload.** After decrypting, the JSON describes an error rather than a
   result. Two shapes occur:

   ```json
   { "error": { "src": "DEVICE", "type": "BAD_PARAMETERS", "data": null } }
   ```
   ```json
   { "src": "DEVICE", "type": "BAD_PARAMETERS", "data": null, "rid": 1700000000000 }
   ```

   Detect either: look for an `error` object, or for a top-level `type`/`src` where you expected
   `data`.

## 6.2 Error fields

| Field | Meaning |
|-------|---------|
| `src` | Origin: `MYJD` (the MyJDownloader server) or `DEVICE` (the JDownloader instance). |
| `type` | The error code (see §6.3). |
| `data` | Optional extra detail (often `null`). |

## 6.3 Error types

| Type | Meaning / typical cause | Recommended handling |
|------|-------------------------|----------------------|
| `TOKEN_INVALID` | The session is still alive but the request signature/encryption token is wrong (e.g. a desynced server-token chain). | **Reconnect** (`/my/reconnect`) and retry once; else re-`connect`. |
| `SESSION` / `SESSION_EXPIRED` | Session expired. | Same as `TOKEN_INVALID`. |
| `AUTH_FAILED` | Two distinct cases (verified against the live API): from `/my/connect` it means wrong email/password; from any **session-scoped call** (incl. `/my/reconnect`) it means the session is **dead server-side** (expired, rotated away, unknown sessiontoken). | From `/my/connect`: surface to user, do not retry. From a session call: re-`connect` once (a reconnect would also fail with `AUTH_FAILED`). |
| `CHALLENGE_FAILED` | Signature/handshake mismatch. | Check your signing (exact query string, correct token bytes). |
| `EMAIL_INVALID` / `EMAIL_FORBIDDEN` | Bad/blocked email. | User error. |
| `ERROR_EMAIL_NOT_CONFIRMED` | Account email not confirmed. | User must confirm. |
| `BAD_PARAMETERS` | Wrong `params` shape — **usually an object passed raw instead of stringified** (§4.3), or wrong arity. | Fix encoding. |
| `BAD_REQUEST` | Malformed request/envelope. | Check envelope JSON, content-type. |
| `API_COMMAND_NOT_FOUND` | Unknown method path. | Typo in `url`/path. |
| `API_INTERFACE_NOT_FOUND` | Unknown namespace. | Typo. |
| `METHOD_FORBIDDEN` | Method not allowed in this context. | — |
| `FILE_NOT_FOUND` | Referenced file/path missing. | — |
| `OFFLINE` | Target device is offline. | Device not reachable; inform user. |
| `MAINTENANCE` | Server maintenance. | Back off and retry later. |
| `OVERLOAD` / `TOO_MANY_REQUESTS` | Rate limited / server busy. | **Exponential backoff.** |
| `OUTDATED` | Client/protocol too old. | — |
| `INTERNAL_SERVER_ERROR` | Server-side failure. | Retry with backoff. |
| `STORAGE_*` | Storage interface errors (`STORAGE_NOT_FOUND`, `STORAGE_KEY_NOT_FOUND`, `STORAGE_INVALID_KEY`, `STORAGE_INVALID_STORAGEID`, `STORAGE_ALREADY_EXISTS`, `STORAGE_LIMIT_REACHED`). | Specific to the storage API. |
| `FAILED` / `UNKNOWN` | Generic failure. | Inspect `data`; retry cautiously. |

## 6.4 Recommended handling summary

- On **`TOKEN_INVALID`/`SESSION`/`SESSION_EXPIRED`** → reconnect, retry once, then fall back to a
  fresh login. (See §2.5.)
- On **`AUTH_FAILED` from a session-scoped call** → the session is dead; skip the reconnect and do
  one fresh `/my/connect` from stored credentials, then retry.
- On **`OVERLOAD`/`TOO_MANY_REQUESTS`/`MAINTENANCE`/`INTERNAL_SERVER_ERROR`** → exponential backoff.
- On **`BAD_PARAMETERS`** → almost always your `params` encoding; verify objects are stringified and
  id-arrays are native (§4.3).
- On **`AUTH_FAILED` from `/my/connect`** and email errors → do **not** retry; these are
  user-correctable.

## 6.5 Failure modes that look like errors but aren't returned as one

- **Decryption garbage / JSON parse failure.** Usually means you used the wrong token (e.g. you
  didn't chain `serverEncryptionToken` after a reconnect — §1.4.1) or split KEY/IV the wrong way.
- **`rid` mismatch** in a 200 response. Treat the response as invalid (possible replay); re-issue
  the request with a fresh `rid`.
