import { browser } from 'wxt/browser';
import type { Credentials, SessionState } from './types';

const STORAGE_KEYS = {
  credentials: 'myjd_credentials',
  session: 'myjd_session',
  lastCall: 'myjd_last_call',
} as const;

export async function getCredentials(): Promise<Credentials | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.credentials);
  return (result[STORAGE_KEYS.credentials] as Credentials) ?? null;
}

export async function setCredentials(credentials: Credentials): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.credentials]: credentials,
  });
}

export async function getSession(): Promise<SessionState | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.session);
  return (result[STORAGE_KEYS.session] as SessionState) ?? null;
}

export async function setSession(session: SessionState): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.session]: session,
    [STORAGE_KEYS.lastCall]: Date.now(),
  });
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove([
    STORAGE_KEYS.session,
    STORAGE_KEYS.lastCall,
  ]);
}

export async function clearAll(): Promise<void> {
  await browser.storage.local.remove([
    STORAGE_KEYS.credentials,
    STORAGE_KEYS.session,
    STORAGE_KEYS.lastCall,
  ]);
}

export async function getLastCall(): Promise<number | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.lastCall);
  return (result[STORAGE_KEYS.lastCall] as number) ?? null;
}

export async function touchLastCall(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.lastCall]: Date.now() });
}
