<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { MessageCircle } from 'lucide-vue-next'
import SidebarRecentSection from '@/components/SidebarRecentSection.vue'
import { usePlatformStore } from '@/stores/platform'

defineProps<{ compact: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const store = usePlatformStore()
const route = useRoute()
const recentContacts = computed(() => {
  const seen = new Set<string>()
  const employees = new Map(store.visibleEmployees.map(employee => [employee.id, employee]))
  return store.employeeThreads.flatMap(thread => {
    const employee = employees.get(thread.employeeId)
    if (!employee || seen.has(employee.id)) return []
    seen.add(employee.id)
    return [{ employee, thread }]
  }).slice(0, 8)
})
</script>

<template>
  <SidebarRecentSection label="最近联系" :compact="compact">
    <template #icon><MessageCircle :size="18" :stroke-width="1.8" aria-hidden="true" /></template>
    <template #default="{ close }">
      <nav v-if="recentContacts.length" class="history-nav" aria-label="最近联系">
        <RouterLink
          v-for="{ employee, thread } in recentContacts"
          :key="employee.id"
          :to="{ name: 'employee-contact', params: { id: employee.id }, query: { thread: thread.id } }"
          class="history-link"
          :class="{ active: route.name === 'employee-contact' && route.params.id === employee.id }"
          @click="close(); emit('navigate')"
        >
          <span class="employee-avatar" :style="{ background: employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
          <span class="link-text">
            <strong>{{ employee.name }}</strong>
            <small>{{ thread.messages.at(-1)?.text || employee.role }}</small>
          </span>
        </RouterLink>
      </nav>
      <p v-else class="history-empty">暂无联系记录</p>
    </template>
  </SidebarRecentSection>
</template>

<style scoped>
.employee-avatar {
  display: grid; flex: 0 0 auto; place-items: center; width: 28px; height: 28px;
  border-radius: 8px; color: #fff; font-size: 12px; font-weight: 650;
}
.link-text { display: grid; min-width: 0; gap: 3px; line-height: 1.35; }
.link-text strong, .link-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link-text strong { font-size: 13px; font-weight: 600; }
.link-text small { color: var(--muted); font-size: 11px; font-weight: 450; }
</style>
