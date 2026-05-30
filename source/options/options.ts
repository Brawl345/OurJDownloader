import { AuthManager } from '../api/auth.ts';
import { CNLManager } from '../cnl/cnl-manager.ts';
import type { GeneralOptions } from '../cnl/cnl-types.ts';

class OptionsManager {
  private emailInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private saveButton: HTMLButtonElement;
  private clearButton: HTMLButtonElement;
  private messageElement: HTMLElement;
  private basketNotificationsInput: HTMLInputElement;
  private cnlEnabledInput: HTMLInputElement;

  constructor() {
    this.emailInput = document.getElementById('email') as HTMLInputElement;
    this.passwordInput = document.getElementById(
      'password',
    ) as HTMLInputElement;
    this.saveButton = document.getElementById('save-btn') as HTMLButtonElement;
    this.clearButton = document.getElementById(
      'clear-btn',
    ) as HTMLButtonElement;
    this.messageElement = document.getElementById('message') as HTMLElement;
    this.basketNotificationsInput = document.getElementById(
      'basket-notifications-enabled',
    ) as HTMLInputElement;
    this.cnlEnabledInput = document.getElementById(
      'cnl-enabled',
    ) as HTMLInputElement;

    this.initializeEventListeners();
    this.loadExistingCredentials();
    this.loadGeneralSettings();
  }

  private initializeEventListeners(): void {
    this.saveButton.addEventListener('click', () => this.saveCredentials());
    this.clearButton.addEventListener('click', () => this.clearAllData());

    // Allow Enter key to save
    this.passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveCredentials();
      }
    });

    // General settings listeners
    this.basketNotificationsInput.addEventListener('change', () =>
      this.saveGeneralSettings(),
    );
    this.cnlEnabledInput.addEventListener('change', () =>
      this.saveGeneralSettings(),
    );
  }

  private async loadExistingCredentials(): Promise<void> {
    try {
      const credentials = await AuthManager.getCredentials();
      if (credentials) {
        this.emailInput.value = credentials.email;
        this.passwordInput.value = credentials.password;
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  }

  private async saveCredentials(): Promise<void> {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      this.showMessage('Please fill in both email and password.', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showMessage('Please enter a valid email address.', 'error');
      return;
    }

    this.setLoading(this.saveButton, true);

    try {
      // Save credentials and sign in automatically
      await AuthManager.setCredentials({ email, password });
      await AuthManager.signIn();
      this.showMessage(chrome.i18n.getMessage('credentialsSaved'), 'success');
    } catch (error) {
      console.error('Failed to save credentials or sign in:', error);
      this.showMessage(chrome.i18n.getMessage('connectionTestFailed'), 'error');
    } finally {
      this.setLoading(this.saveButton, false);
    }
  }

  private async clearAllData(): Promise<void> {
    if (
      !confirm(
        'Are you sure you want to clear all stored data? This cannot be undone.',
      )
    ) {
      return;
    }

    this.setLoading(this.clearButton, true);

    try {
      await AuthManager.clearCredentials();
      this.emailInput.value = '';
      this.passwordInput.value = '';
      this.showMessage(chrome.i18n.getMessage('dataCleared'), 'success');
    } catch (error) {
      console.error('Failed to clear data:', error);
      this.showMessage('Failed to clear data. Please try again.', 'error');
    } finally {
      this.setLoading(this.clearButton, false);
    }
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.messageElement.textContent = text;
    this.messageElement.className = `message ${type}`;
    this.messageElement.style.display = 'block';

    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        this.messageElement.style.display = 'none';
      }, 3000);
    }
  }

  private setLoading(button: HTMLButtonElement, loading: boolean): void {
    if (loading) {
      button.disabled = true;
      const spinner = document.createElement('span');
      spinner.className = 'loading-spinner';
      button.insertBefore(spinner, button.firstChild);
    } else {
      button.disabled = false;
      const spinner = button.querySelector('.loading-spinner');
      if (spinner) {
        spinner.remove();
      }
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async loadGeneralSettings(): Promise<void> {
    try {
      const options = await CNLManager.getGeneralOptions();
      this.basketNotificationsInput.checked =
        options.basketNotificationsEnabled;
      this.cnlEnabledInput.checked = options.cnlEnabled;
    } catch (error) {
      console.error('Failed to load general settings:', error);
    }
  }

  private async saveGeneralSettings(): Promise<void> {
    try {
      const options: Partial<GeneralOptions> = {
        basketNotificationsEnabled: this.basketNotificationsInput.checked,
        cnlEnabled: this.cnlEnabledInput.checked,
      };

      await CNLManager.setGeneralOptions(options);
      this.showMessage(
        chrome.i18n.getMessage('generalSettingsSaved'),
        'success',
      );
    } catch (error) {
      console.error('Failed to save general settings:', error);
      this.showMessage(chrome.i18n.getMessage('generalSettingsError'), 'error');
    }
  }
}

// Initialize options when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Apply internationalization
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

  new OptionsManager();
});
