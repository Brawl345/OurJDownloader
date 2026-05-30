# OurJDownloader

A Chrome/Firefox (Manifest V3) extension to send links to a running JDownloader instance via the
MyJDownloader API. Right-click links, images, or pages to collect them in a basket, then click a
device in the popup to send them. Supports Click'n'Load interception and auto light/dark theming.

Built with [WXT](https://wxt.dev) + Vue 3, tested with Vitest.

## Development

Requires Node 22 and npm.

```bash
npm install          # install deps (runs `wxt prepare`)
npm run dev          # run in Chrome with HMR
npm run dev:firefox  # run in Firefox
npm test             # unit tests (Vitest)
npm run lint:types   # type check (vue-tsc)
npm run lint:code    # lint (Biome)
```

## Build

```bash
npm run build          # -> .output/chrome-mv3
npm run build:firefox  # -> .output/firefox-mv3
npm run zip            # packaged extension
```

## Setup

Open the extension's settings and enter your MyJDownloader email and password. Credentials are
stored locally and only sent to MyJDownloader.

The MyJDownloader API is documented in [`docs/`](docs/).
