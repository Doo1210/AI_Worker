<script setup lang="ts">
import { computed } from 'vue'
import { usePlatformStore } from '@/stores/platform'
import { useWorkbenchAssistant } from '@/workbenchAssistant'

defineProps<{ fallbackLabel: string }>()
const store = usePlatformStore()
const { available, selection } = useWorkbenchAssistant()
const groups = computed(() => [
  { label: '个人配置', assistants: available.value.filter(item => item.scope !== 'organization' && item.userId === store.currentUser.id) },
  { label: '组织共享', assistants: available.value.filter(item => item.scope === 'organization') },
  { label: '成员共享', assistants: available.value.filter(item => item.scope !== 'organization' && item.userId !== store.currentUser.id) },
].filter(group => group.assistants.length))
</script>

<template>
  <select v-model="selection" class="workbench-assistant-select" aria-label="选择助理">
    <option value="">{{ fallbackLabel }} · 内置</option>
    <optgroup v-for="group in groups" :key="group.label" :label="group.label">
      <option v-for="item in group.assistants" :key="item.id" :value="item.id">{{ item.name }}</option>
    </optgroup>
  </select>
</template>

<style scoped>
.workbench-assistant-select {
  min-width: 0;
  max-width: 100%;
  min-height: 31px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  text-overflow: ellipsis;
}
.workbench-assistant-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
