import { browser } from 'wxt/browser';
import { addCNLLink } from '../basket';
import { t } from '../i18n';
import { getGeneralOptions } from '../settings';
import { decryptCNL, extractFormData } from './cnl-service';
import type { CNLRequestData } from './cnl-types';

const RULESET_ID = 'cnl_rules';

function notify(message: string): void {
  browser.notifications?.create({
    type: 'basic',
    iconUrl: '/icons/32.png',
    title: t('extensionName'),
    message,
  });
}

export async function processCNLRequest(
  requestData: CNLRequestData,
): Promise<void> {
  const options = await getGeneralOptions();
  if (!options.cnlEnabled) return;

  try {
    const formData = extractFormData(requestData.formData);
    if (!formData) {
      console.error('CNL: No form data found in request');
      return;
    }

    const decrypted = await decryptCNL(formData);
    for (const link of decrypted.links) {
      await addCNLLink(link, {
        packageName: decrypted.packageName,
        passwords: decrypted.passwords,
        sourceUrl: decrypted.sourceUrl,
        timestamp: Date.now(),
      });
    }

    if (options.basketNotificationsEnabled) {
      notify(
        t('cnlLinksProcessed', [
          String(decrypted.links.length),
          decrypted.packageName || t('unknownPackage'),
        ]),
      );
    }
  } catch (error) {
    console.error('CNL: Failed to process request:', error);
    if (options.basketNotificationsEnabled) {
      notify(t('cnlProcessingError'));
    }
  }
}

export async function updateRulesetState(enabled: boolean): Promise<void> {
  try {
    await browser.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] },
    );
  } catch (error) {
    console.error('CNL: Failed to update ruleset state:', error);
  }
}

export async function initializeCNL(): Promise<void> {
  const options = await getGeneralOptions();
  await updateRulesetState(options.cnlEnabled);
}
