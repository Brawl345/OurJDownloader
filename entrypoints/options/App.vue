<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { signIn } from '../../lib/api/client';
import { isAuthError } from '../../lib/api/errors';
import {
  clearAll,
  getCredentials,
  setCredentials,
} from '../../lib/api/session';
import { t } from '../../lib/i18n';
import {
  type GeneralOptions,
  getGeneralOptions,
  setGeneralOptions,
} from '../../lib/settings';

const email = ref('');
const password = ref('');
const saving = ref(false);
const clearing = ref(false);
const message = ref<{ text: string; kind: 'success' | 'error' } | null>(null);

const options = ref<GeneralOptions>({
  basketNotificationsEnabled: true,
  cnlEnabled: false,
});

let messageTimer: ReturnType<typeof setTimeout> | undefined;

function show(text: string, kind: 'success' | 'error'): void {
  message.value = { text, kind };
  clearTimeout(messageTimer);
  if (kind === 'success') {
    messageTimer = setTimeout(() => {
      message.value = null;
    }, 3000);
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function save(): Promise<void> {
  const mail = email.value.trim();
  if (!mail || !password.value) {
    show(t('errorFillBoth'), 'error');
    return;
  }
  if (!isValidEmail(mail)) {
    show(t('errorInvalidEmail'), 'error');
    return;
  }

  saving.value = true;
  try {
    await setCredentials({ email: mail, password: password.value });
    await signIn();
    show(t('credentialsSaved'), 'success');
  } catch (error) {
    console.error('Sign-in failed:', error);
    show(
      isAuthError(error) ? t('authFailed') : t('connectionTestFailed'),
      'error',
    );
  } finally {
    saving.value = false;
  }
}

async function clearData(): Promise<void> {
  if (!confirm(t('clearConfirm'))) return;
  clearing.value = true;
  try {
    await clearAll();
    email.value = '';
    password.value = '';
    show(t('dataCleared'), 'success');
  } catch (error) {
    console.error('Failed to clear data:', error);
    show(t('connectionTestFailed'), 'error');
  } finally {
    clearing.value = false;
  }
}

async function updateOption<K extends keyof GeneralOptions>(
  key: K,
  value: GeneralOptions[K],
): Promise<void> {
  options.value = await setGeneralOptions({ [key]: value });
}

onMounted(async () => {
  const credentials = await getCredentials();
  if (credentials) {
    email.value = credentials.email;
    password.value = credentials.password;
  }
  options.value = await getGeneralOptions();
});
</script>

<template>
  <div class="page">
    <div class="container">
      <header class="head">
        <img src="/icons/48.png" alt="" />
        <h1>{{ t('optionsTitle') }}</h1>
      </header>

      <section class="section">
        <h2>{{ t('credentialsSection') }}</h2>
        <p class="hint">{{ t('credentialsHint') }}</p>

        <label for="email">{{ t('emailLabel') }}</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="you@example.com"
          @keyup.enter="save"
        />

        <label for="password">{{ t('passwordLabel') }}</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          @keyup.enter="save"
        />

        <div class="buttons">
          <button class="danger" :disabled="clearing" @click="clearData">
            {{ t('clearButton') }}
          </button>
          <button class="primary" :disabled="saving" @click="save">
            <span v-if="saving" class="spinner"></span>
            {{ t('saveButton') }}
          </button>
        </div>

        <transition name="fade">
          <div v-if="message" class="message" :class="message.kind">
            {{ message.text }}
          </div>
        </transition>
      </section>

      <section class="section">
        <h2>{{ t('generalSection') }}</h2>

        <label class="toggle">
          <input
            type="checkbox"
            :checked="options.basketNotificationsEnabled"
            @change="updateOption('basketNotificationsEnabled', ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-text">
            <strong>{{ t('basketNotificationsLabel') }}</strong>
            <small>{{ t('basketNotificationsDescription') }}</small>
          </span>
        </label>

        <label class="toggle">
          <input
            type="checkbox"
            :checked="options.cnlEnabled"
            @change="updateOption('cnlEnabled', ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-text">
            <strong>{{ t('cnlEnabledLabel') }}</strong>
            <small>{{ t('cnlEnabledDescription') }}</small>
          </span>
        </label>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32px 16px;
}

.container {
  max-width: 560px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 28px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.head img {
  width: 36px;
  height: 36px;
}

.head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.section {
  padding: 20px 0;
  border-top: 1px solid var(--border);
}

.section h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
}

.hint {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 13px;
}

label {
  display: block;
  margin: 14px 0 6px;
  font-weight: 550;
  font-size: 13px;
}

input[type='email'],
input[type='password'] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

input[type='email']:focus,
input[type='password']:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.buttons button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}

.buttons .primary {
  margin-left: auto;
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.buttons .primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.buttons .danger {
  color: var(--danger);
}

.buttons .danger:hover:not(:disabled) {
  background: var(--danger-soft);
}

.message {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.message.success {
  background: rgba(52, 199, 89, 0.15);
  color: var(--online);
}

.message.error {
  background: var(--danger-soft);
  color: var(--danger);
}

.toggle {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 0 16px;
  cursor: pointer;
  font-weight: 400;
}

.toggle input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  flex-shrink: 0;
}

.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-text strong {
  font-weight: 600;
}

.toggle-text small {
  color: var(--text-muted);
  font-size: 12px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
