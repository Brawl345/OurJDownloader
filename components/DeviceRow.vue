<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../lib/i18n';

const props = defineProps<{
  name: string;
  status: 'checking' | 'online' | 'offline';
  active: boolean;
  sending?: boolean;
  busy?: boolean;
}>();

defineEmits<{ select: [] }>();

const statusTitle = computed(() => {
  if (props.status === 'online') return t('deviceStatusOnline');
  if (props.status === 'offline') return t('deviceStatusOffline');
  return t('deviceStatusUnknown');
});
</script>

<template>
  <button
    type="button"
    class="device"
    :class="{ active, sending }"
    :disabled="busy"
    @click="$emit('select')"
  >
    <span class="dot" :class="status" :title="statusTitle"></span>
    <span class="name">{{ name }}</span>
    <span v-if="sending" class="send-hint">{{ t('sendingToDevice') }}</span>
    <span v-else-if="active" class="send-hint">{{ t('sendToDevice') }}</span>
  </button>
</template>

<style scoped>
.device {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

.device.active:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.device.active:active {
  transform: scale(0.99);
}

.device.sending {
  position: relative;
  overflow: hidden;
  border-color: var(--accent);
  background: var(--accent-soft);
  opacity: 1;
}

.device.sending::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 25%,
    color-mix(in srgb, var(--accent) 55%, transparent) 50%,
    transparent 75%
  );
  transform: translateX(-100%) skewX(-12deg);
  animation: whoosh 0.85s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes whoosh {
  to {
    transform: translateX(100%) skewX(-12deg);
  }
}

.dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--unknown);
}

.dot.online {
  background: var(--online);
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.18);
}

.dot.offline {
  background: var(--offline);
}

.dot.checking {
  background: var(--unknown);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

.name {
  flex: 1;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.send-hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>
