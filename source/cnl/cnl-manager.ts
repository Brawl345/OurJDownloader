import { BasketManager } from '../service-worker/service-worker.ts';
import { CNLService } from './cnl-service.ts';
import type { CNLRequestData, GeneralOptions } from './cnl-types.ts';

const STORAGE_KEYS = {
  GENERAL_OPTIONS: 'general_options',
} as const;

const DEFAULT_GENERAL_OPTIONS: GeneralOptions = {
  basketNotificationsEnabled: true,
  cnlEnabled: false,
};

const RULESET_ID = 'cnl_rules';

export class CNLManager {
  static async processCNLRequest(requestData: CNLRequestData): Promise<void> {
    const options = await CNLManager.getGeneralOptions();

    if (!options.cnlEnabled) {
      return;
    }

    try {
      const formData = CNLService.extractFormData(requestData.formData);
      if (!formData) {
        console.error('CNL: No form data found in request');
        return;
      }

      const decryptedData = await CNLService.decryptCNL(formData);

      for (const link of decryptedData.links) {
        await BasketManager.addToCNLBasket(link, {
          packageName: decryptedData.packageName,
          passwords: decryptedData.passwords,
          sourceUrl: decryptedData.sourceUrl,
          timestamp: Date.now(),
        });
      }

      const generalOptions = await CNLManager.getGeneralOptions();
      if (generalOptions.basketNotificationsEnabled) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '/icons/32.png',
          title: chrome.i18n.getMessage('extensionName'),
          message: chrome.i18n.getMessage('cnlLinksProcessed', [
            decryptedData.links.length.toString(),
            decryptedData.packageName || 'Unknown Package',
          ]),
        });
      }
    } catch (error) {
      console.error('CNL: Failed to process CNL request:', error);

      const generalOptions = await CNLManager.getGeneralOptions();
      if (generalOptions.basketNotificationsEnabled) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '/icons/32.png',
          title: chrome.i18n.getMessage('extensionName'),
          message: chrome.i18n.getMessage('cnlProcessingError'),
        });
      }
    }
  }

  static async updateRulesetState(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: [RULESET_ID],
        });
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: [RULESET_ID],
        });
      }
    } catch (error) {
      console.error('CNL: Failed to update ruleset state:', error);
    }
  }

  static async initialize(): Promise<void> {
    const options = await CNLManager.getGeneralOptions();
    await CNLManager.updateRulesetState(options.cnlEnabled);
  }

  static async getGeneralOptions(): Promise<GeneralOptions> {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.GENERAL_OPTIONS,
    ]);
    return {
      ...DEFAULT_GENERAL_OPTIONS,
      ...result[STORAGE_KEYS.GENERAL_OPTIONS],
    };
  }

  static async setGeneralOptions(
    options: Partial<GeneralOptions>,
  ): Promise<void> {
    const currentOptions = await CNLManager.getGeneralOptions();
    const newOptions = { ...currentOptions, ...options };

    await chrome.storage.local.set({
      [STORAGE_KEYS.GENERAL_OPTIONS]: newOptions,
    });

    // Update CNL ruleset if CNL setting changed
    if (options.cnlEnabled !== undefined) {
      await CNLManager.updateRulesetState(newOptions.cnlEnabled);
    }
  }
}
