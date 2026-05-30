import { browser } from 'wxt/browser';

export interface GeneralOptions {
  basketNotificationsEnabled: boolean;
  cnlEnabled: boolean;
}

const STORAGE_KEY = 'general_options';

const DEFAULTS: GeneralOptions = {
  basketNotificationsEnabled: true,
  cnlEnabled: false,
};

export async function getGeneralOptions(): Promise<GeneralOptions> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(result[STORAGE_KEY] as Partial<GeneralOptions>) };
}

export async function setGeneralOptions(
  options: Partial<GeneralOptions>,
): Promise<GeneralOptions> {
  const next = { ...(await getGeneralOptions()), ...options };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
