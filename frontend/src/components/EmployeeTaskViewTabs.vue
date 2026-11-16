<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { assignedTasksLabel, taskOverviewLocation } from '@/employeeTaskRoutes'
import { useEmployeePendingTasks } from '@/employeePendingTasks'

const route = useRoute()
const { pendingTasks } = useEmployeePendingTasks()
const overview = computed(() => taskOverviewLocation({ ...route.query, scope: null }))
const assigned = computed(() => ({ name: 'employee-tasks', query: overview.value.query }))
const pending = computed(() => taskOverviewLocation({ ...route.query, scope: 'action' }))
const isOverview = computed(() => route.name === 'employee-task-overview')
const pendingCount = computed(() => {
  const employee = route.query.employee
  return typeof employee === 'string' && employee
    ? pendingTasks.value.filter(task => task.employeeId === employee).length
    : pendingTasks.value.length
})
</script>

<template>
  <nav class="page-tabs" aria-label="任务视图">
    <RouterLink :to="overview" custom v-slot="{ href, navigate }">
      <a class="page-tab" :href="href" :aria-current="isOverview && route.query.scope !== 'action' ? 'page' : undefined" @click="navigate">全部任务</a>
    </RouterLink>
    <RouterLink class="page-tab" :to="assigned">{{ assignedTasksLabel }}</RouterLink>
    <RouterLink :to="pending" custom v-slot="{ href, navigate }">
      <a class="page-tab" :href="href" :aria-current="isOverview && route.query.scope === 'action' ? 'page' : undefined" @click="navigate">
        待我处理 <span v-if="pendingCount" class="pending-count">{{ pendingCount }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped>
.pending-count { border-radius: 5px; padding: 0 5px; background: var(--soft); font-size: 11px; font-variant-numeric: tabular-nums; }
</style>
