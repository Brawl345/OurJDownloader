import { CNLManager } from '../cnl/cnl-manager.ts';
import { CNLService } from '../cnl/cnl-service.ts';
import type { BasketItem } from '../cnl/cnl-types.ts';
import { CONTEXT_MENU_IDS } from '../constants.ts';

class BasketManager {
  private static readonly STORAGE_KEY = 'linkgrabber_basket';

  static async showNotification(title: string, message: string): Promise<void> {
    const options = await CNLManager.getGeneralOptions();
    if (options.basketNotificationsEnabled) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: '/icons/32.png',
        title,
        message,
      });
    }
  }

  static async updateBadge(): Promise<void> {
    const basket = await BasketManager.getBasket();
    const count = basket.length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  static async addToBasket(url: string): Promise<void> {
    const basket = await BasketManager.getBasket();
    const existingItem = basket.find((item) => item.url === url);

    if (!existingItem) {
      const newItem: BasketItem = {
        url,
        type: 'manual',
      };
      basket.push(newItem);
      await chrome.storage.local.set({ [BasketManager.STORAGE_KEY]: basket });
      await BasketManager.updateBadge();
    }
  }

  static async addToCNLBasket(
    url: string,
    cnlData: NonNullable<BasketItem['cnlData']>,
  ): Promise<void> {
    const basket = await BasketManager.getBasket();
    const existingItem = basket.find((item) => item.url === url);

    if (!existingItem) {
      const newItem: BasketItem = {
        url,
        type: 'cnl',
        cnlData,
      };
      basket.push(newItem);
      await chrome.storage.local.set({ [BasketManager.STORAGE_KEY]: basket });
      await BasketManager.updateBadge();
    }
  }

  static async getBasket(): Promise<BasketItem[]> {
    const result = await chrome.storage.local.get([BasketManager.STORAGE_KEY]);
    return result[BasketManager.STORAGE_KEY] || [];
  }

  static async clearBasket(): Promise<void> {
    await chrome.storage.local.remove([BasketManager.STORAGE_KEY]);
    await BasketManager.updateBadge();
  }

  static async removeFromBasket(url: string): Promise<void> {
    const basket = await BasketManager.getBasket();
    const filtered = basket.filter((item) => item.url !== url);
    await chrome.storage.local.set({ [BasketManager.STORAGE_KEY]: filtered });
    await BasketManager.updateBadge();
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_LINK_TO_LINKGRABBER,
    title: chrome.i18n.getMessage('contextMenuAddToBasket'),
    contexts: ['link'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_IMAGE_TO_LINKGRABBER,
    title: chrome.i18n.getMessage('contextMenuAddImageToBasket'),
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_PAGE_TO_LINKGRABBER,
    title: chrome.i18n.getMessage('contextMenuAddPageToBasket'),
    contexts: ['page'],
  });

  await BasketManager.updateBadge();
  await CNLManager.initialize();
});

chrome.runtime.onStartup.addListener(async () => {
  await BasketManager.updateBadge();
  await CNLManager.initialize();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (
    info.menuItemId === CONTEXT_MENU_IDS.ADD_LINK_TO_LINKGRABBER &&
    info.linkUrl
  ) {
    try {
      await BasketManager.addToBasket(info.linkUrl);

      // Show notification
      await BasketManager.showNotification(
        chrome.i18n.getMessage('extensionName'),
        chrome.i18n.getMessage('linkAddedToBasket'),
      );
    } catch (error) {
      console.error('Failed to add link to basket:', error);
    }
  } else if (
    info.menuItemId === CONTEXT_MENU_IDS.ADD_IMAGE_TO_LINKGRABBER &&
    info.srcUrl
  ) {
    try {
      await BasketManager.addToBasket(info.srcUrl);

      // Show notification
      await BasketManager.showNotification(
        chrome.i18n.getMessage('extensionName'),
        chrome.i18n.getMessage('imageAddedToBasket'),
      );
    } catch (error) {
      console.error('Failed to add image to basket:', error);
    }
  } else if (
    info.menuItemId === CONTEXT_MENU_IDS.ADD_PAGE_TO_LINKGRABBER &&
    info.pageUrl
  ) {
    try {
      await BasketManager.addToBasket(info.pageUrl);

      // Show notification
      await BasketManager.showNotification(
        chrome.i18n.getMessage('extensionName'),
        chrome.i18n.getMessage('pageAddedToBasket'),
      );
    } catch (error) {
      console.error('Failed to add page to basket:', error);
    }
  }
});

// CNL Request Handler
chrome.webRequest.onBeforeRequest.addListener(
  (
    details: chrome.webRequest.OnBeforeRequestDetails,
  ): chrome.webRequest.BlockingResponse => {
    console.log('CNL Request:', details);
    if (!CNLService.isCNLRequest(details.url)) {
      return {};
    }

    if (!details.requestBody?.formData) {
      return {};
    }

    const formData = CNLService.extractFormData(details.requestBody?.formData);
    if (formData) {
      CNLManager.processCNLRequest({
        url: details.url,
        formData,
      }).catch((error) => {
        console.error('CNL: Failed to process request:', error);
      });
    }

    return {};
  },
  {
    urls: ['http://127.0.0.1/flash/add', 'http://127.0.0.1/flash/addcrypted2'],
  },
  ['requestBody'],
);

// Export BasketManager for use in other modules
export { BasketManager };
