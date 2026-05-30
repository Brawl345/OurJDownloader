<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { BasketGroups } from '../lib/group-basket';
import { t } from '../lib/i18n';

defineProps<{ groups: BasketGroups; count: number }>();
const emit = defineEmits<{ remove: [url: string]; clear: [] }>();

const collapsed = reactive<Record<string, boolean>>({});
const copiedUrl = ref<string | null>(null);

function toggle(name: string): void {
  collapsed[name] = !collapsed[name];
}

async function copy(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    copiedUrl.value = url;
    setTimeout(() => {
      if (copiedUrl.value === url) copiedUrl.value = null;
    }, 1000);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}
</script>

<template>
  <section class="basket">
    <header class="basket-head">
      <span class="title">{{ t('linkBasketTitle') }}</span>
      <span class="count">{{ count }}</span>
      <button type="button" class="clear" @click="emit('clear')">
        {{ t('clearBasket') }}
      </button>
    </header>

    <div class="body">
      <div v-if="groups.manual.length" class="manual">
        <div v-for="item in groups.manual" :key="item.url" class="link">
          <span
            class="url"
            :title="item.url"
            @click="copy(item.url)"
          >{{ copiedUrl === item.url ? t('linkCopied') : item.url }}</span>
          <button type="button" class="remove" @click="emit('remove', item.url)">×</button>
        </div>
      </div>

      <div v-for="pkg in groups.packages" :key="pkg.name" class="package">
        <button type="button" class="pkg-head" @click="toggle(pkg.name)">
          <span class="chevron" :class="{ open: !collapsed[pkg.name] }">›</span>
          <span class="pkg-name">{{ pkg.name }}</span>
          <span class="pkg-count">{{ pkg.items.length }}</span>
        </button>
        <div v-if="pkg.passwords.length" class="pkg-pass">
          🔒 {{ pkg.passwords[0] }}
        </div>
        <div v-show="!collapsed[pkg.name]" class="pkg-links">
          <div v-for="item in pkg.items" :key="item.url" class="link cnl">
            <span
              class="url"
              :title="item.url"
              @click="copy(item.url)"
            >{{ copiedUrl === item.url ? t('linkCopied') : item.url }}</span>
            <button type="button" class="remove" @click="emit('remove', item.url)">×</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.basket {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}

.basket-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.title {
  font-weight: 650;
}

.count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 10px;
}

.clear {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--danger);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: 6px;
}

.clear:hover {
  background: var(--danger-soft);
}

.body {
  padding: 8px 10px;
  max-height: 280px;
  overflow-y: auto;
}

.link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.url {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.url:hover {
  color: var(--text);
}

.remove {
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 4px;
}

.remove:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

.package {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin: 6px 0;
  overflow: hidden;
}

.pkg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: var(--surface-2);
  color: var(--text);
  text-align: left;
}

.pkg-head:hover {
  background: var(--surface-hover);
}

.chevron {
  display: inline-block;
  transition: transform 0.15s ease;
  color: var(--text-muted);
  font-size: 15px;
}

.chevron.open {
  transform: rotate(90deg);
}

.pkg-name {
  flex: 1;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pkg-count {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 8px;
}

.pkg-pass {
  font-size: 11px;
  color: var(--text-muted);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  padding: 4px 12px;
  background: var(--surface-2);
}

.pkg-links {
  padding: 4px 10px 6px;
}

.link.cnl {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}
</style>
