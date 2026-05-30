<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { browser } from 'wxt/browser';
import BasketSection from '../../components/BasketSection.vue';
import DeviceRow from '../../components/DeviceRow.vue';
import { signIn } from '../../lib/api/client';
import { listDevices, pingDevice } from '../../lib/api/devices';
import { addLinks } from '../../lib/api/linkgrabber';
import { getCredentials } from '../../lib/api/session';
import type { JDownloaderDevice } from '../../lib/api/types';
import {
  type BasketItem,
  BASKET_STORAGE_KEY,
  clearBasket,
  getBasket,
  removeFromBasket,
} from '../../lib/basket';
import { SessionError } from '../../lib/api/errors';
import { groupBasket } from '../../lib/group-basket';
import { t } from '../../lib/i18n';

type DeviceStatus = 'checking' | 'online' | 'offline';
type View = 'loading' | 'setup' | 'ready';

const view = ref<View>('loading');
const devices = ref<JDownloaderDevice[]>([]);
const statuses = reactive<Record<string, DeviceStatus>>({});
const basket = ref<BasketItem[]>([]);
const loadError = ref(false);
const busy = ref(false);
const sendingId = ref<string | null>(null);

const groups = computed(() => groupBasket(basket.value));
const hasBasket = computed(() => basket.value.length > 0);

const MIN_SEND_ANIMATION_MS = 850;

function holdAnimation(started: number): Promise<void> {
  const remaining = MIN_SEND_ANIMATION_MS - (Date.now() - started);
  return remaining > 0
    ? new Promise((resolve) => setTimeout(resolve, remaining))
    : Promise.resolve();
}

function notify(message: string): void {
  browser.notifications?.create({
    type: 'basic',
    iconUrl: '/icons/32.png',
    title: t('extensionName'),
    message,
  });
}

async function fetchDevices(): Promise<JDownloaderDevice[]> {
  try {
    return await listDevices();
  } catch (error) {
    if (error instanceof SessionError) {
      await signIn();
      return await listDevices();
    }
    throw error;
  }
}

function pingAll(): void {
  for (const device of devices.value) {
    statuses[device.id] = 'checking';
    pingDevice(device.id).then((online) => {
      statuses[device.id] = online ? 'online' : 'offline';
    });
  }
}

async function loadDevices(): Promise<void> {
  loadError.value = false;
  try {
    devices.value = await fetchDevices();
    pingAll();
  } catch (error) {
    console.error('Failed to load devices:', error);
    loadError.value = true;
  } finally {
    view.value = 'ready';
  }
}

async function loadBasket(): Promise<void> {
  basket.value = await getBasket();
}

async function sendTo(deviceId: string): Promise<void> {
  if (!hasBasket.value || busy.value) return;
  busy.value = true;
  sendingId.value = deviceId;
  const started = Date.now();
  try {
    for (const pkg of groups.value.packages) {
      await addLinks(
        deviceId,
        pkg.items.map((item) => item.url),
        {
          packageName: pkg.name,
          extractPassword: pkg.passwords[0] ?? null,
          downloadPassword: pkg.passwords[1] ?? null,
        },
      );
    }
    if (groups.value.manual.length) {
      await addLinks(
        deviceId,
        groups.value.manual.map((item) => item.url),
      );
    }
    await clearBasket();
    await holdAnimation(started);
    notify(t('linksSentSuccess'));
  } catch (error) {
    console.error('Failed to send links:', error);
    await holdAnimation(started);
    notify(t('linksSentError'));
  } finally {
    busy.value = false;
    sendingId.value = null;
  }
}

function openSettings(): void {
  browser.runtime.openOptionsPage();
  window.close();
}

function onStorageChanged(
  changes: Record<string, { newValue?: unknown }>,
  area: string,
): void {
  if (area === 'local' && changes[BASKET_STORAGE_KEY]) {
    basket.value =
      (changes[BASKET_STORAGE_KEY].newValue as BasketItem[]) ?? [];
  }
}

onMounted(async () => {
  browser.storage.onChanged.addListener(onStorageChanged);
  if (!(await getCredentials())) {
    view.value = 'setup';
    return;
  }
  await loadBasket();
  await loadDevices();
});

onUnmounted(() => {
  browser.storage.onChanged.removeListener(onStorageChanged);
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <img class="logo" src="/icons/32.png" alt="" />
      <h1>{{ t('extensionName') }}</h1>
      <button class="icon-btn" :title="t('settingsButton')" @click="openSettings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </header>

    <main class="content">
      <div v-if="view === 'loading'" class="center">
        <span class="spinner"></span>
      </div>

      <div v-else-if="view === 'setup'" class="card">
        <h2>{{ t('noCredentialsTitle') }}</h2>
        <p>{{ t('noCredentialsMessage') }}</p>
        <button class="primary" @click="openSettings">{{ t('settingsButton') }}</button>
      </div>

      <template v-else>
        <div class="card error" v-if="loadError">
          <h2>{{ t('errorTitle') }}</h2>
          <p>{{ t('errorMessage') }}</p>
          <button @click="loadDevices">{{ t('refreshButton') }}</button>
        </div>

        <div class="card" v-else-if="devices.length === 0">
          <h2>{{ t('noDevicesTitle') }}</h2>
          <p>{{ t('noDevicesMessage') }}</p>
        </div>

        <section v-else class="devices">
          <h3>{{ t('devicesTitle') }}</h3>
          <DeviceRow
            v-for="device in devices"
            :key="device.id"
            :name="device.name"
            :status="statuses[device.id] ?? 'checking'"
            :active="hasBasket && !busy"
            :sending="sendingId === device.id"
            :busy="busy"
            @select="sendTo(device.id)"
          />
        </section>

        <BasketSection
          v-if="hasBasket"
          :groups="groups"
          :count="basket.length"
          @remove="removeFromBasket"
          @clear="clearBasket"
        />
      </template>
    </main>

    <footer class="actions" v-if="view === 'ready'">
      <button class="wide" :disabled="busy" @click="loadDevices">
        {{ t('refreshButton') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.app {
  width: 460px;
  min-height: 360px;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.logo {
  width: 22px;
  height: 22px;
}

.topbar h1 {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.devices h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.devices {
  display: flex;
  flex-direction: column;
}

.devices :deep(.device) {
  margin-bottom: 6px;
}

.card {
  text-align: center;
  padding: 28px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.card h2 {
  margin: 0 0 6px;
  font-size: 15px;
}

.card p {
  margin: 0 0 14px;
  color: var(--text-muted);
  font-size: 13px;
}

.card.error h2 {
  color: var(--danger);
}

button.primary,
.card button {
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 550;
  font-size: 13px;
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

button.primary:hover {
  background: var(--accent-hover);
}

.actions {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.wide {
  width: 100%;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-weight: 550;
}

.wide:hover:not(:disabled) {
  background: var(--surface-2);
}
</style>
