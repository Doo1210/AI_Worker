<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Bot, ClipboardList, ContactRound } from 'lucide-vue-next'
import { useEmployeePendingTasks } from '@/employeePendingTasks'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore } from '@/stores/platform'

defineProps<{ compact: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const organization = useOrganizationAdminStore()
const platform = usePlatformStore()
const { pendingTasks } = useEmployeePendingTasks()
const route = useRoute()
const directoryActive = computed(() => route.name === 'employee-directory')
const canOpenResponsibilities = computed(() => platform.currentUser.role === 'admin' || organization.myEmployeeMaintenance.size > 0)
const fromResponsibilityRuns = computed(() => canOpenResponsibilities.value && route.query.from === 'employee-runs'
  && (route.name === 'employee-task' || route.name === 'scenario-task'))
const tasksActive = computed(() => !fromResponsibilityRuns.value
  && ['employee-task-overview', 'employee-tasks', 'employee-task', 'employee-autonomous-tasks', 'scenario-task'].some(name => name === route.name))
const pendingCount = computed(() => pendingTasks.value.length)
const pendingDescription = computed(() => pendingCount.value ? `有 ${pendingCount.value} 项任务待处理` : undefined)
</script>

<template>
  <div class="employee-navigation">
    <nav class="sidebar-nav" aria-label="AI 员工">
      <RouterLink
        :to="{ name: 'employee-directory' }"
        class="side-link"
        :class="{ active: directoryActive }"
        aria-label="员工目录"
        :title="compact ? '员工目录' : undefined"
        @click="emit('navigate')"
      >
        <ContactRound :size="18" :stroke-width="1.8" aria-hidden="true" /><span>员工目录</span>
      </RouterLink>
      <RouterLink
        :to="{ name: 'employee-task-overview' }"
        class="side-link"
        :class="{ active: tasksActive }"
        aria-label="任务总览"
        :aria-description="pendingDescription"
        :title="compact ? '任务总览' : undefined"
        @click="emit('navigate')"
      >
        <ClipboardList :size="18" :stroke-width="1.8" aria-hidden="true" /><span>任务总览</span>
        <span v-if="!compact && pendingCount" class="pending-badge" aria-hidden="true">{{ pendingCount }}</span>
      </RouterLink>
      <RouterLink
        v-if="canOpenResponsibilities"
        :to="{ name: 'employee-management', params: { id: '' } }"
        class="side-link"
        :class="{ active: (route.name === 'employee-management' && route.query.from !== 'admin') || fromResponsibilityRuns }"
        aria-label="我的员工分身"
        :title="compact ? '我的员工分身' : undefined"
        @click="emit('navigate')"
      >
        <Bot :size="18" :stroke-width="1.8" aria-hidden="true" /><span>我的员工分身</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.employee-navigation { min-width: 0; }
.employee-navigation .side-link { gap: 7px; padding-inline: 9px; white-space: nowrap; }
.pending-badge {
  display: grid; flex: 0 0 auto; place-items: center; margin-left: auto; min-width: 18px; height: 18px;
  padding: 0 4px; border-radius: 9px; color: var(--accent); background: #e1e9fd; font-size: 10px; font-weight: 700;
}
</style>
