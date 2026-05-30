# LLM Guidance

This file provides guidance to LLMs when working with code in this repository.

## Overview

Chrome/Firefox web extension that communicates with the JDownloader API. Code is written in TypeScript, linted with
Biome, and built with ESBuild. Use Manifest V3.

## Architecture

Clean layered architecture with centralized API communication:

- **API Client**: Central singleton handling all MyJDownloader communication, encryption, and session management
- **Authentication**: Credential storage and device selection, delegates session logic to API client
- **Device Management**: Business logic for device operations using centralized API client
- **Crypto Utilities**: Web Crypto API implementations for MyJDownloader's encryption requirements
- **UI Components**: Popup for device listing, options for credential management, service worker for background tasks

Session management is centralized with automatic error detection and re-authentication based on actual API responses
rather than timeouts.

All API docs live in the `docs` folder.

## Build Commands

- `bun run build`: Production build (always use this, never `bun run dev`)
- `bun run lint:types`: TypeScript type checking
- `bun run lint:code`: Biome code linting
- `bun run web-ext:build`: Build extension package
- `bun run start:chrome` / `bun run start:firefox`: Launch in browser (user runs manually)

## Internationalization

All user-facing strings must be added to `public/_locales/en/messages.json` and accessed via `chrome.i18n.getMessage()`.
Never hardcode strings. German translations use informal (Du) form. HTML placeholder keys use double-underscore format (
`__keyName__`) for programmatic replacement.

## Key Technical Details

**Node Runtime**: Uses Bun as the Node.js runtime, not Node.js itself.
