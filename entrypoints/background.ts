import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { addManualLink, updateBadge } from '../lib/basket';
import {
  initializeCNL,
  processCNLRequest,
  updateRulesetState,
} from '../lib/cnl/cnl-manager';
import { isCNLRequest } from '../lib/cnl/cnl-service';
import type { CNLFormData } from '../lib/cnl/cnl-types';
import { CONTEXT_MENU_IDS } from '../lib/constants';
import { t } from '../lib/i18n';
import { getGeneralOptions } from '../lib/settings';

async function notifyAdded(messageKey: string): Promise<void> {
  const options = await getGeneralOptions();
  if (!options.basketNotificationsEnabled) return;
  browser.notifications?.create({
    type: 'basic',
    iconUrl: '/icons/32.png',
    title: t('extensionName'),
    message: t(messageKey),
  });
}

function createContextMenus(): void {
  browser.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_LINK,
    title: t('contextMenuAddToBasket'),
    contexts: ['link'],
  });
  browser.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_IMAGE,
    title: t('contextMenuAddImageToBasket'),
    contexts: ['image'],
  });
  browser.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_PAGE,
    title: t('contextMenuAddPageToBasket'),
    contexts: ['page'],
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    createContextMenus();
    await updateBadge();
    await initializeCNL();
  });

  browser.runtime.onStartup.addListener(async () => {
    await updateBadge();
    await initializeCNL();
  });

  browser.contextMenus.onClicked.addListener(async (info) => {
    let url: string | undefined;
    let messageKey = '';

    if (info.menuItemId === CONTEXT_MENU_IDS.ADD_LINK) {
      url = info.linkUrl;
      messageKey = 'linkAddedToBasket';
    } else if (info.menuItemId === CONTEXT_MENU_IDS.ADD_IMAGE) {
      url = info.srcUrl;
      messageKey = 'imageAddedToBasket';
    } else if (info.menuItemId === CONTEXT_MENU_IDS.ADD_PAGE) {
      url = info.pageUrl;
      messageKey = 'pageAddedToBasket';
    }

    if (!url) return;
    const added = await addManualLink(url);
    if (added) await notifyAdded(messageKey);
  });

  // Capture Click'n'Load submissions. The matching declarativeNetRequest rule
  // blocks the actual request to JDownloader's local server; here we read the
  // (already-submitted) form body and decrypt it into the basket.
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      const formData = details.requestBody?.formData as CNLFormData | undefined;
      if (isCNLRequest(details.url) && formData) {
        processCNLRequest({ url: details.url, formData }).catch((error) => {
          console.error('CNL: Failed to process request:', error);
        });
      }
      return undefined;
    },
    { urls: ['http://127.0.0.1/flash/*'] },
    ['requestBody'],
  );

  // Keep the CNL ruleset in sync when the setting is toggled from the options page.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.general_options) {
      const next = changes.general_options.newValue as
        | { cnlEnabled?: boolean }
        | undefined;
      updateRulesetState(next?.cnlEnabled ?? false);
    }
  });
});
