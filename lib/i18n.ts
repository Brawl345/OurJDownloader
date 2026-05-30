import { browser } from 'wxt/browser';

// WXT generates a typed getMessage whose key is a union of known message names;
// we wrap it with a plain string signature for dynamic lookups.
const getMessage = browser.i18n.getMessage as (
  key: string,
  substitutions?: string | string[],
) => string;

export function t(key: string, substitutions?: string | string[]): string {
  return getMessage(key, substitutions) || key;
}
