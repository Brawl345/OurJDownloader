import { browser } from 'wxt/browser';

export interface CNLData {
  packageName?: string;
  passwords?: string[];
  sourceUrl?: string;
  timestamp: number;
}

export interface BasketItem {
  url: string;
  type: 'manual' | 'cnl';
  cnlData?: CNLData;
}

export const BASKET_STORAGE_KEY = 'linkgrabber_basket';

export async function getBasket(): Promise<BasketItem[]> {
  const result = await browser.storage.local.get(BASKET_STORAGE_KEY);
  return (result[BASKET_STORAGE_KEY] as BasketItem[]) ?? [];
}

async function saveBasket(items: BasketItem[]): Promise<void> {
  await browser.storage.local.set({ [BASKET_STORAGE_KEY]: items });
  await updateBadge(items.length);
}

export async function addManualLink(url: string): Promise<boolean> {
  const basket = await getBasket();
  if (basket.some((item) => item.url === url)) return false;
  basket.push({ url, type: 'manual' });
  await saveBasket(basket);
  return true;
}

export async function addCNLLink(url: string, cnlData: CNLData): Promise<void> {
  const basket = await getBasket();
  if (basket.some((item) => item.url === url)) return;
  basket.push({ url, type: 'cnl', cnlData });
  await saveBasket(basket);
}

export async function removeFromBasket(url: string): Promise<void> {
  const basket = await getBasket();
  await saveBasket(basket.filter((item) => item.url !== url));
}

export async function clearBasket(): Promise<void> {
  await saveBasket([]);
}

export async function updateBadge(count?: number): Promise<void> {
  const total = count ?? (await getBasket()).length;
  await browser.action.setBadgeText({ text: total > 0 ? String(total) : '' });
  if (total > 0) {
    await browser.action.setBadgeBackgroundColor({ color: '#34c759' });
  }
}
