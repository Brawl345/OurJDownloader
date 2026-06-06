# 7. Recipes & End-to-End Walkthroughs

This file ties everything together. If you implement the steps here, you have a working client.

## 7.1 Full flow overview

```
1. derive loginSecret, deviceSecret           (§1.2)
2. /my/connect  → sessiontoken, regaintoken    (§2.2)
3. compute serverEncryptionToken, deviceEncryptionToken   (§1.4)
4. /my/listdevices → pick a deviceId           (§3.2)
5. device calls (addLinks, queryLinks, start…) (§4, §5)
   ↳ on 403/TOKEN_INVALID → /my/reconnect (single-flight), rotate tokens, retry  (§2.3, §2.5)
6. /my/disconnect when done                    (§2.4)
```

## 7.2 Language-agnostic pseudocode

```text
# --- one-time secret derivation ---
loginSecret  = sha256(lower(email) + password + "server")        # 32 bytes
deviceSecret = sha256(lower(email) + password + "device")        # 32 bytes

# --- connect ---
rid   = now_ms()
query = "email=" + url(email) + "&appkey=" + url(appkey) + "&rid=" + rid
sig   = hmac_sha256_hex(loginSecret, "/my/connect?" + query)
resp  = http_get("https://api.jdownloader.org/my/connect?" + query + "&signature=" + sig)
plain = aes128cbc_decrypt(key=loginSecret[16:32], iv=loginSecret[0:16], base64_decode(resp))
{ sessiontoken, regaintoken, rid } = json(plain)        # verify rid

serverEncToken = sha256(loginSecret  + hex_decode(sessiontoken))
deviceEncToken = sha256(deviceSecret + hex_decode(sessiontoken))

# --- list devices ---
rid   = now_ms()
query = "sessiontoken=" + sessiontoken + "&rid=" + rid
sig   = hmac_sha256_hex(serverEncToken, "/my/listdevices?" + query)
resp  = http_get(".../my/listdevices?" + query + "&signature=" + sig)
devices = json(aes_decrypt(serverEncToken, resp)).list
deviceId = devices[0].id

# --- a device call: add links ---
options = { links: "https://h/a.zip\nhttps://h/b.zip", autostart: false,
            packageName: null, destinationFolder: null, downloadPassword: null,
            extractPassword: null, priority: "DEFAULT", overwritePackagizerRules: false }
envelope = { url: "/linkgrabberv2/addLinks",
             params: [ json_string(options) ],     # NOTE: stringified object
             rid: now_ms(), apiVer: 1 }
body = base64( aes128cbc_encrypt(key=deviceEncToken[16:32], iv=deviceEncToken[0:16],
                                 pkcs7(json(envelope))) )
resp = http_post(".../t_" + sessiontoken + "_" + deviceId + "/linkgrabberv2/addLinks",
                 headers={ "Content-Type": "application/aesjson-jd; charset=utf-8" }, body=body)
result = json(aes_decrypt(deviceEncToken, resp))      # { data: {...}, rid }

# --- reconnect (on 403/TOKEN_INVALID; single-flight, see §2.5) ---
rid   = now_ms()
query = "appkey=" + appkey + "&sessiontoken=" + sessiontoken + "&regaintoken=" + regaintoken + "&rid=" + rid
sig   = hmac_sha256_hex(serverEncToken, "/my/reconnect?" + query)     # CURRENT server token
resp  = http_get(".../my/reconnect?" + query + "&signature=" + sig)
{ sessiontoken, regaintoken } = json(aes_decrypt(serverEncToken, resp))   # decrypt w/ CURRENT token
serverEncToken = sha256(serverEncToken + hex_decode(sessiontoken))   # CHAINS (§1.4.1)
deviceEncToken = sha256(deviceSecret  + hex_decode(sessiontoken))    # from deviceSecret
```

## 7.3 Copy-pasteable bash + openssl walkthrough

Dependencies: `bash`, `curl`, `openssl`, `xxd`, `jq`. Set `EMAIL`, `PASSWORD`, `APPKEY` first.

```bash
#!/usr/bin/env bash
set -euo pipefail
API=https://api.jdownloader.org
EMAIL="you@example.com"; PASSWORD="secret"; APPKEY="my-tool"

# Portable millisecond rid (works on both GNU and BSD/macOS date):
now_ms(){ printf '%s000' "$(date +%s)"; }   # seconds*1000; fine as an rid
sha256_hex(){ printf '%s' "$1" | openssl dgst -sha256 | awk '{print $NF}'; }
# HMAC where the key is given as raw bytes encoded in hex:
hmac_hex(){ printf '%s' "$1" | openssl dgst -sha256 -mac HMAC -macopt hexkey:"$2" | awk '{print $NF}'; }
aes_dec(){ printf '%s' "$1" | base64 -d | openssl enc -aes-128-cbc -d -K "${2:32:32}" -iv "${2:0:32}"; }
aes_enc(){ printf '%s' "$1" | openssl enc -aes-128-cbc -e -K "${2:32:32}" -iv "${2:0:32}" | base64 -w0; }

email_lower=$(printf '%s' "$EMAIL" | tr 'A-Z' 'a-z')
login_secret=$(sha256_hex "${email_lower}${PASSWORD}server")
device_secret=$(sha256_hex "${email_lower}${PASSWORD}device")

# 1) connect
rid=$(now_ms)
q="email=${EMAIL}&appkey=${APPKEY}&rid=${rid}"
sig=$(hmac_hex "/my/connect?${q}" "$login_secret")
dec=$(aes_dec "$(curl -s "${API}/my/connect?${q}&signature=${sig}")" "$login_secret")
sessiontoken=$(jq -r .sessiontoken <<<"$dec")
regaintoken=$(jq -r .regaintoken <<<"$dec")

# 2) tokens (concatenate RAW bytes, then sha256)
server_token=$(printf '%s%s' "$login_secret"  "$sessiontoken" | xxd -r -p | openssl dgst -sha256 | awk '{print $NF}')
device_token=$(printf '%s%s' "$device_secret" "$sessiontoken" | xxd -r -p | openssl dgst -sha256 | awk '{print $NF}')

# 3) list devices
rid=$(now_ms)
q="sessiontoken=${sessiontoken}&rid=${rid}"
sig=$(hmac_hex "/my/listdevices?${q}" "$server_token")
devices=$(aes_dec "$(curl -s "${API}/my/listdevices?${q}&signature=${sig}")" "$server_token")
device_id=$(jq -r '.list[0].id' <<<"$devices")
echo "Using device: $device_id"

# 4) device call: ping
rid=$(now_ms)
payload=$(jq -nc --argjson rid "$rid" '{url:"/device/ping",params:[],rid:$rid,apiVer:1}')
enc=$(aes_enc "$payload" "$device_token")
resp=$(curl -s -X POST -H "Content-Type: application/aesjson-jd; charset=utf-8" \
  --data "$enc" "${API}/t_${sessiontoken}_${device_id}/device/ping")
aes_dec "$resp" "$device_token" | jq .

# 5) device call: add links (note params[0] is a STRINGIFIED object)
rid=$(now_ms)
opts=$(jq -nc '{links:"https://example.com/a.zip\nhttps://example.com/b.zip",
                autostart:false, packageName:null, destinationFolder:null,
                downloadPassword:null, extractPassword:null,
                priority:"DEFAULT", overwritePackagizerRules:false}')
payload=$(jq -nc --arg opts "$opts" --argjson rid "$rid" \
  '{url:"/linkgrabberv2/addLinks", params:[$opts], rid:$rid, apiVer:1}')
enc=$(aes_enc "$payload" "$device_token")
resp=$(curl -s -X POST -H "Content-Type: application/aesjson-jd; charset=utf-8" \
  --data "$enc" "${API}/t_${sessiontoken}_${device_id}/linkgrabberv2/addLinks")
aes_dec "$resp" "$device_token" | jq .
```

> The `--arg opts "$opts"` + `params:[$opts]` in `jq` is what produces the **stringified** options
> object required by §4.3. If you instead did `params:[$optsObject]` with a raw object you'd get
> `BAD_PARAMETERS`.

## 7.4 Common recipes (device calls)

| Goal | Method | Params |
|------|--------|--------|
| Add URLs | `/linkgrabberv2/addLinks` | `[ stringify(options) ]` |
| See what's collected | `/linkgrabberv2/queryLinks` | `[ stringify({url:true,bytesTotal:true,availability:true,maxResults:-1,startAt:0}) ]` |
| Move collected → download list | `/linkgrabberv2/moveToDownloadlist` | `[ linkIds[], packageIds[] ]` |
| List downloads w/ progress | `/downloadsV2/queryPackages` | `[ stringify({bytesLoaded:true,bytesTotal:true,eta:true,speed:true,status:true,maxResults:-1,startAt:0}) ]` |
| Start all downloads | `/downloadcontroller/start` | `[]` |
| Stop all | `/downloadcontroller/stop` | `[]` |
| Current speed | `/downloadcontroller/getSpeedInBps` | `[]` |
| Remove items | `/downloadsV2/removeLinks` | `[ linkIds[], packageIds[] ]` |
| Add a premium account | `/accountsV2/addAccount` | `[ "hoster.com", "user", "pass" ]` |

## 7.5 Implementation checklist / gotchas

- [ ] Email **lowercased** in the secret; password verbatim. (§1.2)
- [ ] Token concatenation is over **raw bytes**, not hex strings. (§1.4)
- [ ] AES-128: `IV = token[0:16]`, `KEY = token[16:32]`. (§1.5)
- [ ] HMAC key is the token's **raw bytes**; message is the exact `/path?query` you send. (§1.6)
- [ ] `serverEncryptionToken` **chains** on reconnect; `deviceEncryptionToken` is recomputed from
      `deviceSecret`. (§1.4.1) — the single most common source of "works until it expires" bugs.
- [ ] Device `params`: objects **stringified**, id-arrays/scalars **native**. (§4.3)
- [ ] Device `Content-Type: application/aesjson-jd; charset=utf-8`, body is Base64 of ciphertext.
- [ ] Validate the echoed `rid` on every response. (§2.1)
- [ ] Reconnect-and-retry-once on 403 / `TOKEN_INVALID`, **single-flight** across contexts. (§2.5)
- [ ] Backoff on `OVERLOAD`/`TOO_MANY_REQUESTS`. (§6.4)
- [ ] Never persist the plaintext password longer than needed.
