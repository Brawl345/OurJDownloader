import { AuthManager } from '../api/auth.ts';
import { DeviceManager, type JDownloaderDevice } from '../api/devices.ts';
import { LinkGrabberManager } from '../api/linkgrabber.ts';
import type { BasketItem } from '../cnl/cnl-types.ts';

class BasketManager {
  private static readonly STORAGE_KEY = 'linkgrabber_basket';

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
    }
  }

  static async getBasket(): Promise<BasketItem[]> {
    const result = await chrome.storage.local.get([BasketManager.STORAGE_KEY]);
    return result[BasketManager.STORAGE_KEY] || [];
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

class PopupManager {
  private statusElement: HTMLElement;
  private statusTextElement: HTMLElement;
  private deviceListElement: HTMLElement;
  private devicesContainerElement: HTMLElement;
  private emptyStateElement: HTMLElement;
  private refreshButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;

  private basketSectionElement: HTMLElement;
  private basketCountElement: HTMLElement;
  private basketLinksElement: HTMLElement;
  private basketActionsElement: HTMLElement;
  private clearBasketButton: HTMLButtonElement;

  private devices: JDownloaderDevice[] = [];
  private basketItems: BasketItem[] = [];

  constructor() {
    this.statusElement = document.getElementById('status') as HTMLElement;
    this.statusTextElement = document.getElementById(
      'status-text',
    ) as HTMLElement;
    this.deviceListElement = document.getElementById(
      'device-list',
    ) as HTMLElement;
    this.devicesContainerElement = document.getElementById(
      'devices-container',
    ) as HTMLElement;
    this.emptyStateElement = document.getElementById(
      'empty-state',
    ) as HTMLElement;
    this.refreshButton = document.getElementById(
      'refresh-btn',
    ) as HTMLButtonElement;
    this.settingsButton = document.getElementById(
      'settings-btn',
    ) as HTMLButtonElement;

    this.basketSectionElement = document.getElementById(
      'basket-section',
    ) as HTMLElement;
    this.basketCountElement = document.getElementById(
      'basket-count',
    ) as HTMLElement;
    this.basketLinksElement = document.getElementById(
      'basket-links',
    ) as HTMLElement;
    this.basketActionsElement = document.getElementById(
      'basket-actions',
    ) as HTMLElement;
    this.clearBasketButton = document.getElementById(
      'clear-basket-btn',
    ) as HTMLButtonElement;

    this.initializeEventListeners();
    this.loadDevices();
    this.loadBasket();
  }

  private initializeEventListeners(): void {
    this.refreshButton.addEventListener('click', () => this.loadDevices(true));
    this.settingsButton.addEventListener('click', () => this.openSettings());
    this.clearBasketButton.addEventListener('click', () => this.clearBasket());

    // Listen for basket changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.linkgrabber_basket) {
        this.loadBasket();
      }
    });
  }

  private async loadDevices(isManualRefresh = false): Promise<void> {
    this.setStatus('loading', chrome.i18n.getMessage('statusLoading'));
    this.refreshButton.disabled = true;

    try {
      const credentials = await AuthManager.getCredentials();
      if (!credentials) {
        this.setStatus(
          'disconnected',
          chrome.i18n.getMessage('statusNoCredentials'),
        );
        this.showEmptyState('noCredentialsTitle', 'noCredentialsMessage');
        return;
      }

      this.setStatus('loading', chrome.i18n.getMessage('statusLoadingDevices'));

      try {
        this.devices = await DeviceManager.listDevices();
      } catch (error) {
        // If it's an authentication error, try signing in fresh and retry
        if (
          error instanceof Error &&
          (error.name === 'TokenInvalidError' ||
            error.name === 'AuthenticationError')
        ) {
          this.setStatus('loading', chrome.i18n.getMessage('statusSigningIn'));
          await AuthManager.signIn();
          this.devices = await DeviceManager.listDevices();
        } else {
          throw error;
        }
      }

      if (this.devices.length === 0) {
        this.setStatus(
          'disconnected',
          chrome.i18n.getMessage('statusNoDevices'),
        );
        this.showEmptyState('noDevicesTitle', 'noDevicesMessage');
        return;
      }

      if (isManualRefresh) {
        this.statusElement.style.display = 'block';
        const messageKey =
          this.devices.length === 1
            ? 'statusConnectedSingle'
            : 'statusConnected';
        this.setStatus(
          'connected',
          chrome.i18n.getMessage(messageKey, [this.devices.length.toString()]),
        );
        setTimeout(() => {
          this.statusElement.style.display = 'none';
        }, 2000);
      } else {
        this.statusElement.style.display = 'none';
      }

      this.renderDeviceList();
    } catch (error) {
      console.error('Failed to load devices:', error);
      this.setStatus('disconnected', chrome.i18n.getMessage('statusError'));
      this.showEmptyState('errorTitle', 'errorMessage');
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  private setStatus(
    type: 'connected' | 'disconnected' | 'loading',
    text: string,
  ): void {
    this.statusElement.className = `status ${type}`;
    this.statusTextElement.textContent = text;

    const spinner = this.statusElement.querySelector('.loading-spinner');
    if (type === 'loading' && !spinner) {
      const spinnerEl = document.createElement('span');
      spinnerEl.className = 'loading-spinner';
      this.statusElement.insertBefore(spinnerEl, this.statusTextElement);
    } else if (type !== 'loading' && spinner) {
      spinner.remove();
    }
  }

  private showEmptyState(titleKey: string, messageKey: string): void {
    this.deviceListElement.style.display = 'none';
    this.emptyStateElement.style.display = 'block';

    const titleElement = document.getElementById('empty-title') as HTMLElement;
    const messageElement = document.getElementById(
      'empty-message',
    ) as HTMLElement;

    titleElement.textContent = chrome.i18n.getMessage(titleKey);
    messageElement.textContent = chrome.i18n.getMessage(messageKey);
  }

  private renderDeviceList(): void {
    this.emptyStateElement.style.display = 'none';
    this.deviceListElement.style.display = 'block';

    this.devicesContainerElement.innerHTML = '';

    this.devices.forEach((device) => {
      const deviceElement = this.createDeviceElement(device);
      this.devicesContainerElement.appendChild(deviceElement);
    });
  }

  private createDeviceElement(device: JDownloaderDevice): HTMLElement {
    const deviceElement = document.createElement('div');
    deviceElement.className = 'device-item';

    deviceElement.innerHTML = `
      <div class="device-info">
        <div class="device-name">${this.escapeHtml(device.name)}</div>
      </div>
      <div class="device-status unknown" title="${chrome.i18n.getMessage('deviceStatusUnknown')}"></div>
    `;

    deviceElement.addEventListener('click', async () => {
      await this.handleDeviceClick(device.id);
    });

    // Start ping check for device status
    this.checkDeviceStatus(device.id, deviceElement);

    return deviceElement;
  }

  private async handleDeviceClick(deviceId: string): Promise<void> {
    try {
      // Only handle device clicks if basket has items
      if (this.basketItems.length > 0) {
        this.setStatus(
          'loading',
          chrome.i18n.getMessage('sendingLinksToDevice'),
        );

        try {
          // Group basket items by package name for CNL items
          const cnlPackages = new Map<string, BasketItem[]>();
          const manualItems: BasketItem[] = [];

          for (const item of this.basketItems) {
            if (item.type === 'cnl' && item.cnlData?.packageName) {
              const packageName = item.cnlData.packageName;
              if (!cnlPackages.has(packageName)) {
                cnlPackages.set(packageName, []);
              }
              cnlPackages.get(packageName)?.push(item);
            } else {
              manualItems.push(item);
            }
          }

          // Send CNL packages
          for (const [packageName, items] of cnlPackages) {
            const links = items.map((item) => item.url);
            const firstItem = items[0];
            const passwords = firstItem?.cnlData?.passwords || [];

            await LinkGrabberManager.addLinks(deviceId, links, {
              packageName,
              extractPassword: passwords[0] || undefined,
              downloadPassword: passwords[1] || undefined,
            });
          }

          // Send manual items
          if (manualItems.length > 0) {
            const links = manualItems.map((item) => item.url);
            await LinkGrabberManager.addLinks(deviceId, links);
          }

          // Clear basket after successful send
          await BasketManager.clearBasket();
          this.loadBasket();

          // Show success message briefly
          this.setStatus(
            'connected',
            chrome.i18n.getMessage('linksSentSuccess'),
          );
          setTimeout(() => {
            this.statusElement.style.display = 'none';
          }, 2000);
        } catch (error) {
          console.error('Failed to send links:', error);
          this.setStatus(
            'disconnected',
            chrome.i18n.getMessage('linksSentError'),
          );
          setTimeout(() => {
            this.statusElement.style.display = 'none';
          }, 3000);
        }
      }
      // If no basket items, clicking device does nothing
    } catch (error) {
      console.error('Failed to handle device click:', error);
    }
  }

  private async checkDeviceStatus(
    deviceId: string,
    deviceElement: HTMLElement,
  ): Promise<void> {
    const statusElement = deviceElement.querySelector(
      '.device-status',
    ) as HTMLElement;

    try {
      const isOnline = await DeviceManager.pingDevice(deviceId);
      statusElement.className = `device-status ${isOnline ? 'online' : 'offline'}`;
      statusElement.title = chrome.i18n.getMessage(
        isOnline ? 'deviceStatusOnline' : 'deviceStatusOffline',
      );
    } catch {
      statusElement.className = 'device-status offline';
      statusElement.title = chrome.i18n.getMessage('deviceStatusOffline');
    }
  }

  private openSettings(): void {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async loadBasket(): Promise<void> {
    this.basketItems = await BasketManager.getBasket();
    this.updateBasketUI();
  }

  private updateBasketUI(): void {
    const hasItems = this.basketItems.length > 0;

    // Show basket section when there are items, hide when empty
    if (hasItems) {
      this.basketSectionElement.classList.remove('hidden');
      this.basketLinksElement.classList.remove('hidden');
      this.basketActionsElement.classList.remove('hidden');

      // Render items grouped by package
      this.basketLinksElement.innerHTML = '';

      // Group items by package
      const cnlPackages = new Map<string, BasketItem[]>();
      const manualItems: BasketItem[] = [];

      for (const item of this.basketItems) {
        if (item.type === 'cnl' && item.cnlData?.packageName) {
          const packageName = item.cnlData.packageName;
          if (!cnlPackages.has(packageName)) {
            cnlPackages.set(packageName, []);
          }
          cnlPackages.get(packageName)?.push(item);
        } else {
          manualItems.push(item);
        }
      }

      // Render manual items first (if any)
      if (manualItems.length > 0) {
        const manualSection = document.createElement('div');
        manualSection.className = 'basket-manual-links';

        manualItems.forEach((item) => {
          const linkElement = this.createBasketLinkElement(item);
          manualSection.appendChild(linkElement);
        });

        this.basketLinksElement.appendChild(manualSection);
      }

      // Render CNL packages
      for (const [packageName, items] of cnlPackages) {
        const packageElement = document.createElement('div');
        packageElement.className = 'basket-package collapsed'; // Start collapsed

        // Package header with title and count
        const packageHeader = document.createElement('div');
        packageHeader.className = 'basket-package-header';

        const packageTitle = document.createElement('div');
        packageTitle.className = 'basket-package-title';
        packageTitle.innerHTML = `
          <span>${this.escapeHtml(packageName)}</span>
          <span class="basket-package-count">${items.length}</span>
        `;
        packageHeader.appendChild(packageTitle);

        // Show password if available
        const firstItem = items[0];
        if (
          firstItem?.cnlData?.passwords &&
          firstItem.cnlData.passwords.length > 0
        ) {
          const passwordElement = document.createElement('div');
          passwordElement.className = 'basket-package-password';
          passwordElement.innerHTML = `
            <span>🔒</span>
            <span>${this.escapeHtml(firstItem.cnlData?.passwords?.[0] || '')}</span>
          `;
          packageHeader.appendChild(passwordElement);
        }

        // Add click handler for collapse/expand
        packageHeader.addEventListener('click', () => {
          packageElement.classList.toggle('collapsed');
        });

        packageElement.appendChild(packageHeader);

        // Package links
        const packageLinks = document.createElement('div');
        packageLinks.className = 'basket-package-links';

        items.forEach((item) => {
          const linkElement = this.createBasketLinkElement(item);
          linkElement.classList.add('basket-cnl-link');
          packageLinks.appendChild(linkElement);
        });

        packageElement.appendChild(packageLinks);
        this.basketLinksElement.appendChild(packageElement);
      }
    } else {
      // Hide entire basket section when empty
      this.basketSectionElement.classList.add('hidden');
    }

    // Update count
    this.basketCountElement.textContent = this.basketItems.length.toString();
  }

  private createBasketLinkElement(item: BasketItem): HTMLElement {
    const linkElement = document.createElement('div');
    linkElement.className = 'basket-link';

    const urlElement = document.createElement('div');
    urlElement.className = 'basket-link-url';
    urlElement.textContent = item.url;
    urlElement.title = item.url;
    urlElement.style.cursor = 'pointer';

    // Add click handler to copy URL to clipboard
    urlElement.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(item.url);
        this.showCopyFeedback(urlElement);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    });

    const removeElement = document.createElement('span');
    removeElement.className = 'basket-link-remove';
    removeElement.textContent = '×';
    removeElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeFromBasket(item.url);
    });

    linkElement.appendChild(urlElement);
    linkElement.appendChild(removeElement);

    return linkElement;
  }

  private async clearBasket(): Promise<void> {
    await BasketManager.clearBasket();
    this.loadBasket();

    // Show brief confirmation
    this.setStatus('connected', chrome.i18n.getMessage('basketCleared'));
    this.statusElement.style.display = 'block';
    setTimeout(() => {
      this.statusElement.style.display = 'none';
    }, 1500);
  }

  private async removeFromBasket(url: string): Promise<void> {
    await BasketManager.removeFromBasket(url);
    this.loadBasket();
  }

  private showCopyFeedback(element: HTMLElement): void {
    const originalText = element.textContent;
    const originalColor = element.style.color;

    element.textContent = chrome.i18n.getMessage('linkCopied');
    element.style.color = '#4caf50';
    element.style.fontWeight = '500';

    setTimeout(() => {
      element.textContent = originalText;
      element.style.color = originalColor;
      element.style.fontWeight = '';
    }, 1000);
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Apply internationalization
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (key) {
      element.textContent = chrome.i18n.getMessage(key);
    }
  });

  // Replace placeholders in HTML
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let node: Text | null = walker.nextNode() as Text;
  while (node) {
    if (node.textContent?.includes('__MSG_')) {
      node.textContent = node.textContent.replace(
        /__MSG_(\w+)__/g,
        (match, key) => {
          return chrome.i18n.getMessage(key) || match;
        },
      );
    }
    node = walker.nextNode() as Text;
  }

  new PopupManager();
});
