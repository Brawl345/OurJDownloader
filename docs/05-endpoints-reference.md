# 5. Device Endpoint Reference

Every entry below is a **device** method: call it via the POST/encrypt mechanism in
[04-device-api.md](04-device-api.md). The "Path" is what goes in both the URL and the envelope
`url` field. "Params" lists positional arguments in order; apply the encoding rules from §4.3
(**objects → stringified, id-arrays/scalars → native**).

Return values are the decrypted `data` field. Where a return shape is noted, it is the typical set
of fields; the server returns only the fields you requested in a query selector.

> The authoritative, exhaustive list of method signatures and option fields is at
> <https://my.jdownloader.org/developers/>. The methods below are the ones needed in practice and
> are confirmed against working clients.

---

## 5.1 `device` — connectivity

| Path | Params | Returns | Notes |
|------|--------|---------|-------|
| `/device/ping` | — | `true` | Liveness check. |
| `/device/getDirectConnectionInfos` | — | `{ "infos": [{ "ip", "port" }], "mode", "rebindProtectionDetected" }` | LAN endpoints for optional direct connection (§4.6). |

---

## 5.2 `linkgrabberv2` — the link collector (links before they're downloaded)

JDownloader first *collects/crawls* links into the LinkGrabber, then you move them to the download
list.

### `/linkgrabberv2/addLinks`
Adds links to the collector. **One object argument (stringified).**

Options object fields:

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `links` | string | — | The URLs. Separate multiple with `\n` (newline). Comma also works, but newline is the safe, official separator. |
| `autostart` | boolean | `false` | Start downloading immediately after collecting. |
| `packageName` | string\|null | `null` | Name the resulting package. |
| `destinationFolder` | string\|null | `null` | Download directory. |
| `downloadPassword` | string\|null | `null` | Password for protected downloads. |
| `extractPassword` | string\|null | `null` | Archive extraction password. |
| `priority` | enum | `"DEFAULT"` | One of `HIGHEST, HIGHER, HIGH, DEFAULT, LOW, LOWER, LOWEST`. |
| `overwritePackagizerRules` | boolean | `false` | Ignore packagizer rules. |

Returns: `{ "id": <long>, "text": null, "maxResults": -1, "crawlJobId": "<id>", "checking": <bool> }`.

### `/linkgrabberv2/queryLinks`
Query collected links. **One selector object (stringified).** Selector fields (set `true` to
include that field in the result; `maxResults`/`startAt` paginate; `packageUUIDs` filters):

```
bytesTotal, comment, status, enabled, maxResults(-1=all), startAt(0),
packageUUIDs[], hosts, url, availability, variantIcon, variantName,
variantID, variants, priority
```

Returns an array of link objects, e.g.:

```json
[{ "availability":"ONLINE", "bytesTotal":68548274, "enabled":true,
   "name":"file.m4a", "packageUUID":1450430888524, "url":"...",
   "uuid":1450430889576, "variant":{"id":"...","name":"..."}, "variants":true }]
```

### `/linkgrabberv2/queryPackages`
Query collected packages. **One selector object (stringified).** Selector fields:

```
availableOfflineCount, availableOnlineCount, availableTempUnknownCount,
availableUnknownCount, bytesTotal, childCount, comment, enabled, hosts,
maxResults(-1), packageUUIDs[], priority, saveTo, startAt(0), status
```

### Other linkgrabber methods

| Path | Params | Notes |
|------|--------|-------|
| `/linkgrabberv2/clearList` | — | Empties the collector. |
| `/linkgrabberv2/moveToDownloadlist` | `linkIds[]`, `packageIds[]` | Move collected items to the download list. |
| `/linkgrabberv2/removeLinks` | `linkIds[]`, `packageIds[]` | Remove from collector. Native arrays. |
| `/linkgrabberv2/renameLink` | `linkId`, `newName` | Rename a link's file. |
| `/linkgrabberv2/renamePackage` | `packageId`, `newName` | Rename a package. |
| `/linkgrabberv2/setPriority` | `priority`, `linkIds[]`, `packageIds[]` | `priority` is the enum string. |
| `/linkgrabberv2/setEnabled` | `enabled(bool)`, `linkIds[]`, `packageIds[]` | Enable/disable. |
| `/linkgrabberv2/setDownloadDirectory`* | see downloads | (use `movetoNewPackage` to set path on creation) |
| `/linkgrabberv2/movetoNewPackage` | `linkIds[]`, `packageIds[]`, `newPackageName`, `downloadPath` | Group into a new package. |
| `/linkgrabberv2/getDownloadUrls` | `packageIds[]`, `linkIds[]`, `urlDisplayType` | Retrieve URLs. |
| `/linkgrabberv2/getVariants` | `[linkUuid]` | Variants of a link (e.g. youtube qualities). |
| `/linkgrabberv2/addContainer` | `type`, `content` | Add a DLC/container. |
| `/linkgrabberv2/cleanup` | `linkIds[]`, `packageIds[]`, `action`, `mode`, `selectionType` | See enums below. |
| `/linkgrabberv2/isCollecting` | — | `true` while still crawling. |
| `/linkgrabberv2/getPackageCount` | — | Number of packages. |
| `/linkgrabberv2/help` | — (use **GET**) | Returns the API help text for this namespace. |

**cleanup enums** (shared with `downloadsV2/cleanup`):

- `action`: `DELETE_ALL, DELETE_DISABLED, DELETE_FAILED, DELETE_FINISHED, DELETE_OFFLINE, DELETE_DUPE, DELETE_MODE`
- `mode`: `REMOVE_LINKS_AND_DELETE_FILES, REMOVE_LINKS_AND_RECYCLE_FILES, REMOVE_LINKS_ONLY`
- `selectionType`: `SELECTED, UNSELECTED, ALL, NONE`

---

## 5.3 `downloadsV2` — the download list (items actually downloading/done)

### `/downloadsV2/queryLinks`
**One selector object (stringified).** Selector fields:

```
addedDate, bytesLoaded, bytesTotal, comment, enabled, eta, extractionStatus,
finished, finishedDate, host, jobUUIDs[], maxResults(-1), packageUUIDs[],
password, priority, running, skipped, speed, startAt(0), status, url
```

Returns an array of download-link objects (fields mirror the selector you enabled): `uuid`,
`name`, `host`, `bytesTotal`, `bytesLoaded`, `speed`, `eta`, `status`, `finished`, `enabled`,
`url`, `priority`, `extractionStatus`, …

### `/downloadsV2/queryPackages`
**One selector object (stringified).** Selector fields:

```
bytesLoaded, bytesTotal, childCount, comment, enabled, eta, finished, hosts,
maxResults(-1), packageUUIDs[], priority, running, saveTo, speed, startAt(0), status
```

### Other downloadsV2 methods

| Path | Params | Notes |
|------|--------|-------|
| `/downloadsV2/removeLinks` | `linkIds[]`, `packageIds[]` | Remove from download list. |
| `/downloadsV2/cleanup` | `linkIds[]`, `packageIds[]`, `action`, `mode`, `selectionType` | Same enums as §5.2. Use this to delete files etc. |
| `/downloadsV2/setEnabled` | `enabled(bool)`, `linkIds[]`, `packageIds[]` | |
| `/downloadsV2/forceDownload` | `linkIds[]`, `packageIds[]` | Force-start specific items. |
| `/downloadsV2/setDownloadDirectory` | `directory`, `packageIds[]` | Change destination. |
| `/downloadsV2/resetLinks` | `linkIds[]`, `packageIds[]` | Reset progress. |
| `/downloadsV2/movetoNewPackage` | `linkIds[]`, `packageIds[]`, `newPackageName`, `downloadPath` | |

---

## 5.4 `downloadcontroller` — global download control

| Path | Params | Returns |
|------|--------|---------|
| `/downloadcontroller/start` | — | `true` |
| `/downloadcontroller/stop` | — | `true` |
| `/downloadcontroller/pause` | `pause(bool)` | `true` |
| `/downloadcontroller/getSpeedInBps` | — | current speed (bytes/s) |
| `/downloadcontroller/getCurrentState` | — | state string (e.g. `RUNNING`, `STOPPED`, `PAUSE`) |
| `/downloadcontroller/forceDownload` | `linkIds[]`, `packageIds[]` | |

---

## 5.5 `accountsV2` — premium hoster & basic-auth accounts inside JDownloader

| Path | Params | Notes |
|------|--------|-------|
| `/accountsV2/listAccounts` | `selectorObject` (stringified) | Selector: `startAt, maxResults(-1), userName, validUntil, trafficLeft, trafficMax, enabled, valid, error, UUIDList[]`. Returns `[{hostname, infoMap, uuid}]`. |
| `/accountsV2/addAccount` | `premiumHoster`, `username`, `password` | |
| `/accountsV2/setUserNameAndPassword` | `accountId`, `username`, `password` | |
| `/accountsV2/enableAccounts` | `accountIds[]` | |
| `/accountsV2/disableAccounts` | `accountIds[]` | |
| `/accountsV2/refreshAccounts` | `accountIds[]` | |
| `/accountsV2/removeAccounts` | `accountIds[]` | |
| `/accountsV2/listPremiumHoster` | — | Supported premium hosters. |
| `/accountsV2/listPremiumHosterUrls` | — | `{hoster: url}`. |
| `/accountsV2/getPremiumHosterUrl` | `hoster` | |
| `/accountsV2/addBasicAuth` | `type("FTP"\|"HTTP")`, `hostmask`, `username`, `password` | Returns account id. |
| `/accountsV2/listBasicAuth` | — | |
| `/accountsV2/updateBasicAuth` | `basicAuthObject` (stringified) | Fields: `created, enabled, hostmask, id, lastValidated, password, type, username`. |
| `/accountsV2/removeBasicAuths` | `accountIds[]` | |

---

## 5.6 `system` — OS/process control

| Path | Params | Notes |
|------|--------|-------|
| `/system/exitJD` | — | Quit JDownloader. |
| `/system/restartJD` | — | |
| `/system/hibernateOS` | — | |
| `/system/standbyOS` | — | |
| `/system/shutdownOS` | `force(bool)` | |
| `/system/getStorageInfos` | `path` | Disk info for a path. |

---

## 5.7 `jd` & `update` — core info and updates

| Path | Params | Notes |
|------|--------|-------|
| `/jd/getCoreRevision` | — | JDownloader core revision number. |
| `/update/isUpdateAvailable` | — | `true`/`false`. |
| `/update/runUpdateCheck` | — | Trigger a check. |
| `/update/restartAndUpdate` | — | Apply updates and restart. |

---

## 5.8 `config` — advanced settings

| Path | Params | Notes |
|------|--------|-------|
| `/config/query` | `selectorObject` (stringified) | Selector: `configInterface, defaultValues, description, enumInfo, includeExtensions, pattern, values`. Returns all config entries. |
| `/config/list` | (optional selector) | List config entries. |
| `/config/listEnum` | `type` | Possible enum values for a type. |
| `/config/get` | `interfaceName`, `storage`, `key` | `storage` is `null` for default or `"cfg/"+interfaceName`. |
| `/config/getDefault` | `interfaceName`, `storage`, `key` | |
| `/config/set` | `interfaceName`, `storage`, `key`, `value` | |
| `/config/reset` | `interfaceName`, `storage`, `key` | |

---

## 5.9 `extensions`

| Path | Params | Notes |
|------|--------|-------|
| `/extensions/list` | `selectorObject` (stringified) | Selector: `configInterface, description, enabled, iconKey, name, pattern, installed`. |
| `/extensions/install` | `id` | |
| `/extensions/isInstalled` | `id` | |
| `/extensions/isEnabled` | `id` | |
| `/extensions/setEnabled` | `id`, `enabled(bool)` | |

---

## 5.10 `dialogs` — interactive dialogs (e.g. prompts JD raises)

| Path | Params | Notes |
|------|--------|-------|
| `/dialogs/list` | — | Pending dialog ids. |
| `/dialogs/get` | `id`, `icon(bool)`, `properties(bool)` | Dialog details. |
| `/dialogs/getTypeInfo` | `dialogType` | |
| `/dialogs/answer` | `id`, `dataObject` | Answer a dialog. |

---

## 5.11 `captcha` — captcha solving

| Path | Params | Notes |
|------|--------|-------|
| `/captcha/list` | `[]` | Waiting captchas. |
| `/captcha/get` | `captchaId` | Base64 captcha image. |
| `/captcha/solve` | `captchaId`, `solution` | Submit a solution. |

---

## 5.12 `reconnect` (device-level) — change the device's internet IP

Distinct from the **session** `/my/reconnect`. This triggers the JDownloader instance to renew its
own internet connection (new IP).

| Path | Params | Notes |
|------|--------|-------|
| `/reconnect/doReconnect` | — | Reconnect the device's WAN connection. |

---

## 5.13 `toolbar`

| Path | Params | Notes |
|------|--------|-------|
| `/toolbar/getStatus` | — | Status incl. whether a speed limit is active (`limit`). |
| `/toolbar/toggleDownloadSpeedLimit` | — | Toggle the global speed limit. |

---

## 5.14 `events` — server-push event polling

Lets a client subscribe to events (download progress, link added, etc.) and long-poll for them,
avoiding constant `queryLinks` polling.

| Path | Params | Notes |
|------|--------|-------|
| `/events/subscribe` | `subscriptions[]`, `exclusions[]` | (Each list JSON-stringified.) Create a subscription; returns a `subscriptionid`. |
| `/events/unsubscribe` | `subscriptionId` | |
| `/events/listen` | `subscriptionId` | Long-poll: returns queued events for the subscription. |
| `/events/addSubscription` | `subscriptionId`, `subscriptions`, `exclusions` | Add filters. |
| `/events/setsubscription` | `subscriptionId`, `subscriptions[]`, `exclusions[]` | Replace filters. |
| `/events/getSubscription` | `subscriptionId` | Inspect a subscription. |
| `/events/getSubscriptionId` | (`subscriptionId`) or `[]` | Resolve/list subscription ids. |

Subscription/exclusion entries are event-name patterns (e.g. publisher/event-id strings). Use
`/events/subscribe`, then loop on `/events/listen`.
