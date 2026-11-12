<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { assignedTasksLabel, taskOverviewLocation } from '@/employeeTaskRoutes'

const route = useRoute()
const overview = computed(() => taskOverviewLocation(route.query))
const assigned = computed(() => ({ name: 'employee-tasks', query: overview.value.query }))
</script>

<template>
  <nav class="task-view-tabs" aria-label="任务视图">
    <RouterLink :to="overview">全部任务</RouterLink>
    <RouterLink :to="assigned">{{ assignedTasksLabel }}</RouterLink>
  </nav>
</template>

<style scoped>
.task-view-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
.task-view-tabs a { padding: 6px 11px; border: 1px solid transparent; border-radius: 7px; color: var(--muted); font-size: 13px; }
.task-view-tabs a:hover { color: var(--accent); }
.task-view-tabs a.router-link-exact-active { background: var(--soft); border-color: #d8e2ff; color: var(--accent); font-weight: 650; }
</style>
