<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, ListChecks } from 'lucide-vue-next'
import { taskOverviewLocation } from '@/employeeTaskRoutes'
import { autonomousTaskStatusLabels, useEmployeeAutonomousTasks } from '@/stores/employeeAutonomousTasks'
import { usePlatformStore } from '@/stores/platform'

const route = useRoute()
const platform = usePlatformStore()
const { visibleTasks } = useEmployeeAutonomousTasks()
const employee = computed(() => platform.visibleEmployees.find(item => item.id === route.params.id))
const tasks = computed(() => employee.value ? visibleTasks.value.filter(task => task.employeeId === employee.value?.id) : [])
const selectedTask = computed(() => tasks.value.find(task => task.id === route.query.task))
const hasTaskSelection = computed(() => route.query.task !== undefined)
const directorySearch = computed(() => typeof route.query.q === 'string' ? route.query.q : undefined)
const directoryLink = computed(() => ({ name: 'employee-directory', query: { q: directorySearch.value } }))
const fromOverview = computed(() => route.query.from === 'overview')
const overviewLink = computed(() => taskOverviewLocation(route.query))
const ownerName = computed(() => platform.users.find(user => user.id === selectedTask.value?.ownerId)?.name)

function taskLink(id?: string) {
  return {
    name: 'employee-autonomous-tasks',
    params: { id: employee.value?.id },
    query: { q: directorySearch.value, task: id },
  }
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}
</script>

<template>
  <section class="page autonomous-page" aria-labelledby="autonomous-heading">
    <nav class="autonomous-navigation" aria-label="页面位置">
      <RouterLink :to="fromOverview ? overviewLink : directoryLink" class="back-link"><ArrowLeft :size="15" aria-hidden="true" /> {{ fromOverview ? '任务总览' : '员工目录' }}</RouterLink>
      <template v-if="!fromOverview && employee && hasTaskSelection">
        <span aria-hidden="true">/</span>
        <RouterLink :to="taskLink()" class="back-link">自主任务</RouterLink>
      </template>
    </nav>

    <header class="page-header autonomous-header">
      <div>
        <h1 id="autonomous-heading">{{ selectedTask?.title ?? '自主任务' }}</h1>
        <p v-if="employee">{{ employee.name }} · 示例运行记录</p>
      </div>
      <span v-if="selectedTask" class="task-status" :class="selectedTask.status">{{ autonomousTaskStatusLabels[selectedTask.status] }}</span>
    </header>

    <el-empty v-if="!employee" class="panel" description="当前账号无法查看这位员工的自主任务" :image-size="88" />

    <template v-else-if="hasTaskSelection">
      <template v-if="selectedTask">
        <div class="autonomous-detail">
          <section class="panel detail-panel" aria-labelledby="autonomous-progress-heading">
            <h2 id="autonomous-progress-heading" class="section-title">执行进展</h2>
            <el-progress :percentage="selectedTask.progress" :stroke-width="7" :status="selectedTask.status === 'completed' ? 'success' : undefined" aria-label="执行进度" />
            <p class="detail-copy">{{ selectedTask.summary }}</p>
            <time class="updated-at" :datetime="selectedTask.updatedAt">更新于 {{ formatDate(selectedTask.updatedAt) }}</time>
          </section>
          <section class="panel detail-panel" aria-labelledby="autonomous-trigger-heading">
            <h2 id="autonomous-trigger-heading" class="section-title">任务来源</h2>
            <dl class="task-metadata">
              <div><dt>触发事件</dt><dd>{{ selectedTask.trigger }}</dd></div>
              <div v-if="selectedTask.ruleName"><dt>执行规则</dt><dd>{{ selectedTask.ruleName }}</dd></div>
              <div v-if="ownerName"><dt>业务负责人</dt><dd>{{ ownerName }}</dd></div>
            </dl>
          </section>
          <section v-if="selectedTask.result" class="panel detail-panel result-panel" aria-labelledby="autonomous-result-heading">
            <h2 id="autonomous-result-heading" class="section-title">执行结果</h2>
            <p class="detail-copy">{{ selectedTask.result }}</p>
          </section>
        </div>
      </template>
      <el-empty v-else class="panel" description="当前账号无法查看这项自主任务" :image-size="88">
        <RouterLink :to="fromOverview ? overviewLink : taskLink()" class="back-link">{{ fromOverview ? '返回任务总览' : '返回自主任务' }}</RouterLink>
      </el-empty>
    </template>

    <ul v-else-if="tasks.length" class="task-list" aria-label="自主任务记录">
      <li v-for="task in tasks" :key="task.id">
        <RouterLink :to="taskLink(task.id)" class="panel task-card" :aria-labelledby="`autonomous-task-${task.id}`">
          <div class="task-card-heading">
            <h2 :id="`autonomous-task-${task.id}`">{{ task.title }}</h2>
            <span class="task-status" :class="task.status">{{ autonomousTaskStatusLabels[task.status] }}</span>
          </div>
          <p class="task-summary">{{ task.summary }}</p>
          <el-progress :percentage="task.progress" :stroke-width="5" :status="task.status === 'completed' ? 'success' : undefined" aria-label="执行进度" />
          <div class="task-card-footer">
            <time class="updated-at" :datetime="task.updatedAt">更新于 {{ formatDate(task.updatedAt) }}</time>
            <span class="task-action">查看详情 <ArrowRight :size="13" aria-hidden="true" /></span>
          </div>
        </RouterLink>
      </li>
    </ul>

    <el-empty v-else class="panel" description="暂无可查看的自主任务" :image-size="88">
      <template #image><ListChecks :size="44" class="empty-icon" aria-hidden="true" /></template>
    </el-empty>
  </section>
</template>

<style scoped>
.autonomous-navigation { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; color: var(--muted); font-size: 13px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); }
.back-link:hover { text-decoration: underline; }
.autonomous-header { align-items: flex-start; flex-wrap: wrap; }
.autonomous-header h1 { overflow-wrap: anywhere; }
.task-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 275px), 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.task-card { display: flex; flex-direction: column; height: 100%; min-width: 0; gap: 12px; padding: 15px; }
.task-card:hover { border-color: #a8baf1; }
.task-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.task-card-heading h2 { min-width: 0; margin: 0; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.task-status { flex: none; border-radius: 6px; padding: 3px 7px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.task-status.running { background: var(--soft); color: var(--accent); }
.task-status.review { background: #fff3db; color: #825012; }
.task-status.completed { background: #e9f5ed; color: #216841; }
.task-summary, .detail-copy { margin: 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.task-summary { flex: 1; color: var(--muted); }
.task-card-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 5px 8px; border-top: 1px solid var(--line); padding-top: 9px; }
.task-action { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; font-weight: 600; }
.updated-at { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.autonomous-detail { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 295px), 1fr)); gap: 12px; }
.detail-panel { min-width: 0; padding: 16px; }
.detail-panel .el-progress { margin-bottom: 10px; }
.detail-panel .updated-at { display: block; margin-top: 10px; }
.result-panel { grid-column: 1 / -1; }
.task-metadata { display: grid; gap: 11px; margin: 0; font-size: 13px; line-height: 1.6; }
.task-metadata dt { margin-bottom: 2px; color: var(--muted); }
.task-metadata dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.empty-icon { color: var(--muted); }
</style>
