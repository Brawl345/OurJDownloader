# LLM Guidance

This file provides guidance to LLMs when working with code in this repository.

## Overview

Chrome/Firefox web extension that communicates with the MyJDownloader API. Code is TypeScript + Vue 3 (`<script setup>`,
scoped styles), built with [WXT](https://wxt.dev) (Vite), linted/formatted with Biome, and tested with Vitest. Manifest V3.

## Architecture

Clean layered architecture with centralized API communication. Framework-free logic lives in `lib/`; Vue UI in
`entrypoints/` + `components/`:

- **`lib/api/`**: `crypto.ts` (Web Crypto: secrets, AES-128-CBC, HMAC, server-token chaining), `client.ts` (centralized
  connect/reconnect/device calls with reactive single-flight reconnect+retry-once via Web Locks shared across
  popup+background, backoff, rid validation), `session.ts`, `errors.ts`,
  `devices.ts`, `linkgrabber.ts`.
- **`lib/cnl/`**: Click'n'Load decryption + ruleset management. **`lib/basket.ts`**: pending-links store + badge.
- **`entrypoints/`**: `background.ts` (context menus, CNL webRequest hook), `popup/`, `options/`.

The server encryption token **chains** across reconnects (docs §1.4.1) — this is the critical correctness invariant.
All API docs live in the `docs` folder and are authoritative.

## Commands (npm + Node 22)

- `npm run build`: Production build → `.output/chrome-mv3` (use this, never `dev` for verification)
- `npm run build:firefox`: Firefox MV3 build → `.output/firefox-mv3`
- `npm run lint:types`: `wxt prepare` + `vue-tsc` type checking
- `npm run lint:code`: Biome linting (`format` to format)
- `npm test`: Vitest unit tests
- `npm run zip`: Package the extension
- `npm run dev` / `dev:firefox`: Launch in a browser (user runs manually)

## Internationalization

All user-facing strings live in `public/_locales/{en,de}/messages.json` and are accessed via the `t()` helper
(`lib/i18n.ts`), never hardcoded. Add every new key to **both** locales. German translations use the informal "Du" form.

## Key Technical Details

**Runtime**: npm + Node 22. The unified `browser` API (`wxt/browser`) is used instead of raw `chrome.*` so the
same code runs on Chrome and Firefox.
