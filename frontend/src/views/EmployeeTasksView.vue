<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, ChatLineRound, CircleCheck, Clock, Close, Document, Tickets } from '@element-plus/icons-vue'
import { ElTabPane, ElTabs } from 'element-plus'
import EmployeeTaskViewTabs from '@/components/EmployeeTaskViewTabs.vue'
import { assignedTasksLabel, taskOverviewLocation } from '@/employeeTaskRoutes'
import { usePlatformStore, type Task } from '@/stores/platform'

const store = usePlatformStore()
const route = useRoute()
const statusLabels = {
  '待补充': { label: '待我补充', tone: 'waiting' },
  '进行中': { label: '进行中', tone: 'running' },
  '已完成': { label: '已完成', tone: 'done' },
} satisfies Record<Task['status'], { label: string; tone: string }>
const statusFilters = ['全部', '待补充', '进行中', '已完成'] as const
const statusFilter = ref<typeof statusFilters[number]>('全部')
const employees = computed(() => new Map(store.visibleEmployees.map(employee => [employee.id, employee])))
const employeeFilter = computed(() => typeof route.query.employee === 'string' ? employees.value.get(route.query.employee) : undefined)
const taskQuery = computed(() => ({ ...taskOverviewLocation(route.query).query, employee: employeeFilter.value?.id }))
const fromOverview = computed(() => route.query.from === 'overview')
const taskListLink = computed(() => fromOverview.value
  ? taskOverviewLocation(route.query) : { name: 'employee-tasks', query: taskQuery.value })
const taskListLabel = computed(() => fromOverview.value ? '任务总览' : assignedTasksLabel)
const scopedTasks = computed(() => employeeFilter.value
  ? store.myTasks.filter(item => item.employeeId === employeeFilter.value?.id)
  : store.myTasks)
const counts = computed(() => ({
  '全部': scopedTasks.value.length,
  '待补充': scopedTasks.value.filter(item => item.status === '待补充').length,
  '进行中': scopedTasks.value.filter(item => item.status === '进行中').length,
  '已完成': scopedTasks.value.filter(item => item.status === '已完成').length,
}))
const filteredTasks = computed(() => scopedTasks.value
  .filter(item => statusFilter.value === '全部' || item.status === statusFilter.value)
  .sort((a, b) => Number(b.status === '待补充') - Number(a.status === '待补充'))
  .map(task => ({ task, employee: employees.value.get(task.employeeId) })))

const taskId = computed(() => typeof route.params.taskId === 'string' ? route.params.taskId : '')
const selectedTask = computed(() => store.myTasks.find(item => item.id === taskId.value))
const selectedEmployee = computed(() => selectedTask.value && employees.value.get(selectedTask.value.employeeId))
const linkedThread = computed(() => store.employeeThreads.find(item =>
  item.id === selectedTask.value?.threadId && item.employeeId === selectedTask.value?.employeeId,
))
const conversationLink = computed(() => selectedTask.value && linkedThread.value ? {
  name: 'employee-contact',
  params: { id: selectedTask.value.employeeId },
  query: { thread: linkedThread.value.id, task: selectedTask.value.id },
} : undefined)

const originalMessage = computed(() => {
  const task = selectedTask.value
  const messages = linkedThread.value?.messages ?? []
  if (!task) return undefined
  const firstUpdateIndex = messages.findIndex(message => message.taskId === task.id && message.role === 'assistant' && !message.taskProposal)
  const beforeUpdates = firstUpdateIndex < 0 ? messages : messages.slice(0, firstUpdateIndex)
  const linked = beforeUpdates.find(message => message.role === 'user' && message.taskId === task.id)
  if (linked) return linked

  // Older demo data linked only the employee's updates to the task.
  if (firstUpdateIndex < 0) return undefined
  const matching = [...beforeUpdates].reverse().find(message => message.role === 'user' && !message.taskId
    && message.text.trim().replace(/\s+/g, ' ').slice(0, 32) === task.title)
  const preceding = beforeUpdates.at(-1)
  return matching ?? (preceding?.role === 'user' && !preceding.taskId ? preceding : undefined)
})
const requestText = computed(() => selectedTask.value?.request || originalMessage.value?.text)
const requestedAt = computed(() => selectedTask.value?.createdAt || originalMessage.value?.createdAt)
const activity = computed(() => linkedThread.value?.messages.filter(message =>
  message.taskId === selectedTask.value?.id && message.id !== originalMessage.value?.id && !message.taskProposal,
) ?? [])
const supplementText = ref('')
const resultPanel = ref<HTMLElement>()
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

watch(taskId, () => { supplementText.value = '' })
watch(() => employeeFilter.value?.id, () => { statusFilter.value = '全部' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

function focusResult() {
  void nextTick(() => resultPanel.value?.focus())
}

function sendSupplement() {
  const task = selectedTask.value
  const text = supplementText.value.trim()
  if (task?.status !== '待补充' || !linkedThread.value || !text) return
  store.supplementEmployeeTask(task.id, text)
  supplementText.value = ''
  focusResult()
}

function continueTask() {
  const task = selectedTask.value
  if (!task || task.status === '已完成') return
  store.advanceEmployeeTask(task.id)
  focusResult()
}
</script>

<template>
  <section class="page employee-tasks-page">
    <template v-if="!taskId">
      <header class="page-header">
        <div><h1>{{ assignedTasksLabel }}</h1><p>跟进交办给数字员工的任务，补充信息并查看结果。</p></div>
        <RouterLink v-if="employeeFilter" class="employee-filter" :to="{ name: 'employee-tasks' }" :aria-label="`清除员工筛选：${employeeFilter.name}`">
          {{ employeeFilter.name }} <el-icon aria-hidden="true"><Close /></el-icon>
        </RouterLink>
      </header>

      <EmployeeTaskViewTabs />
      <ElTabs v-model="statusFilter" class="task-status-tabs" aria-label="按任务状态筛选">
        <ElTabPane v-for="filter in statusFilters" :key="filter" :name="filter">
          <template #label>
            {{ filter === '全部' ? filter : statusLabels[filter].label }} <span class="status-count">{{ counts[filter] }}</span>
          </template>
          <template v-if="statusFilter === filter">
            <ul v-if="filteredTasks.length" class="task-grid" aria-label="交办任务">
              <li v-for="{ task, employee } in filteredTasks" :key="task.id">
                <RouterLink class="panel task-card" :to="{ name: 'employee-task', params: { taskId: task.id }, query: taskQuery }" :aria-labelledby="`task-card-${task.id}`">
                  <div class="task-card-heading">
                    <h2 :id="`task-card-${task.id}`">{{ task.title }}</h2>
                    <span class="task-status" :class="statusLabels[task.status].tone">{{ statusLabels[task.status].label }}</span>
                  </div>
                  <span v-if="employee" class="task-employee">
                    <span class="employee-avatar" :style="{ '--employee-color': employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
                    {{ employee.name }}
                  </span>
                  <p class="task-card-summary">{{ task.detail }}</p>
                  <el-progress class="task-card-progress" aria-label="任务进度" :percentage="task.progress" :stroke-width="4" :status="task.status === '已完成' ? 'success' : undefined" />
                  <div class="task-card-footer">
                    <time class="task-date" :datetime="task.updatedAt">更新于 {{ formatDate(task.updatedAt) }}</time>
                    <span class="task-card-action">{{ task.status === '已完成' ? '查看结果' : '查看进度' }} <el-icon aria-hidden="true"><ArrowRight /></el-icon></span>
                  </div>
                </RouterLink>
              </li>
            </ul>
            <el-empty v-else class="panel" :description="scopedTasks.length ? '此状态暂无任务' : employeeFilter ? '还没有向这位数字员工交办任务' : '还没有交办过任务'" :image-size="88">
              <RouterLink v-if="!scopedTasks.length && store.visibleEmployees.length" class="task-link" :to="employeeFilter ? { name: 'employee-contact', params: { id: employeeFilter.id } } : { name: 'employee-directory' }">
                <el-icon><ChatLineRound /></el-icon> 联系数字员工
              </RouterLink>
            </el-empty>
          </template>
        </ElTabPane>
      </ElTabs>
    </template>

    <template v-else>
      <RouterLink class="task-back" :to="taskListLink"><el-icon><ArrowLeft /></el-icon> {{ taskListLabel }}</RouterLink>
      <template v-if="selectedTask">
        <header class="page-header detail-header">
          <div>
            <h1>{{ selectedTask.title }}</h1>
            <div class="detail-meta">
              <span v-if="selectedEmployee" class="task-employee">
                <span class="employee-avatar" :style="{ '--employee-color': selectedEmployee.color }" aria-hidden="true">{{ selectedEmployee.name.slice(0, 1) }}</span>
                {{ selectedEmployee.name }}
              </span>
              <span v-if="requestedAt">交办于 <time :datetime="requestedAt">{{ formatDate(requestedAt) }}</time></span>
            </div>
          </div>
          <RouterLink v-if="conversationLink" class="task-link" :to="conversationLink"><el-icon><ChatLineRound /></el-icon> 返回原会话</RouterLink>
        </header>

        <div class="task-detail-layout">
          <section class="panel detail-panel progress-panel" aria-labelledby="task-progress-heading">
            <div class="progress-heading">
              <h2 id="task-progress-heading" class="section-title">当前进度</h2>
              <span class="task-status" :class="statusLabels[selectedTask.status].tone" aria-live="polite">{{ statusLabels[selectedTask.status].label }}</span>
            </div>
            <el-progress :percentage="selectedTask.progress" :stroke-width="6" :status="selectedTask.status === '已完成' ? 'success' : undefined" />
            <p class="task-copy">{{ selectedTask.detail }}</p>
            <time class="task-date" :datetime="selectedTask.updatedAt">更新于 {{ formatDate(selectedTask.updatedAt) }}</time>

            <form v-if="selectedTask.status === '待补充' && linkedThread" class="supplement-form" @submit.prevent="sendSupplement">
              <label for="task-supplement">补充信息</label>
              <el-input id="task-supplement" v-model="supplementText" type="textarea" :rows="3" placeholder="填写数字员工需要的信息或交付要求" />
              <div class="supplement-actions">
                <el-button text size="small" @click="continueTask">按现有资料继续</el-button>
                <el-button type="primary" native-type="submit" size="small" :disabled="!supplementText.trim()">提交补充</el-button>
              </div>
            </form>
            <p v-else-if="selectedTask.status === '待补充'" class="task-copy muted">原会话不可用，无法提交补充信息。</p>
            <div v-else-if="selectedTask.status === '进行中'" class="supplement-actions">
              <el-button size="small" @click="continueTask">推进处理</el-button>
            </div>
          </section>

          <div class="task-detail-content">
            <section class="panel detail-panel">
              <h2 class="section-title detail-title"><el-icon><Document /></el-icon> 交办内容</h2>
              <p class="task-copy" :class="{ muted: !requestText }">{{ requestText || '暂无原始交办内容' }}</p>
              <template v-if="selectedTask.deliverable">
                <h3 class="detail-subtitle">期望交付</h3>
                <p class="task-copy">{{ selectedTask.deliverable }}</p>
              </template>
            </section>

            <section v-if="selectedTask.result" ref="resultPanel" class="panel detail-panel result-panel" tabindex="-1" aria-labelledby="task-result-heading">
              <h2 id="task-result-heading" class="section-title detail-title"><el-icon><CircleCheck /></el-icon> 交付结果</h2>
              <p class="task-copy">{{ selectedTask.result }}</p>
            </section>

            <section class="panel detail-panel" aria-labelledby="task-activity-heading">
              <h2 id="task-activity-heading" class="section-title detail-title"><el-icon><Clock /></el-icon> 进展记录</h2>
              <ol v-if="activity.length" class="activity-list">
                <li v-for="message in activity" :key="message.id" :class="{ 'user-activity': message.role === 'user' }">
                  <div class="activity-meta">
                    <strong>{{ message.role === 'user' ? '我补充的信息' : selectedEmployee?.name }}</strong>
                    <time :datetime="message.createdAt">{{ formatDate(message.createdAt) }}</time>
                  </div>
                  <p class="task-copy">{{ message.text }}</p>
                </li>
              </ol>
              <p v-else class="task-copy muted">暂无进展记录</p>
            </section>
          </div>
        </div>
      </template>
      <el-empty v-else class="panel" description="当前账号无法查看这项任务" :image-size="88">
        <RouterLink class="task-link" :to="taskListLink"><el-icon><Tickets /></el-icon> 查看{{ taskListLabel }}</RouterLink>
      </el-empty>
    </template>
  </section>
</template>

<style scoped>
.employee-tasks-page { container-type: inline-size; }
.task-status-tabs :deep(.el-tabs__header) { margin-bottom: 14px; }
.task-status-tabs :deep(.el-tabs__item) { gap: 6px; padding-inline: 14px; font-size: 13px; }
.task-status-tabs :deep(.el-tabs__content) { overflow: visible; }
.status-count { padding: 1px 5px; border-radius: 5px; background: #eef1f6; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.task-status-tabs :deep(.el-tabs__item.is-active) .status-count { background: var(--soft); color: var(--accent); }
.employee-filter {
  display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 100%; min-height: 28px; padding: 4px 8px;
  border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--muted); font-size: 12px; overflow-wrap: anywhere;
}
.employee-filter:hover { color: var(--accent); border-color: #ccd8fa; }
.task-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 265px), 1fr));
  gap: 12px; margin: 0; padding: 0; list-style: none;
}
.task-grid li { min-width: 0; }
.task-card { display: flex; flex-direction: column; align-items: stretch; gap: 10px; height: 100%; min-width: 0; padding: 14px; }
.task-card:hover { border-color: #a8baf1; }
.task-card:focus-visible { outline-offset: 2px; }
.task-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.task-card-heading h2 { min-width: 0; margin: 0; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.task-card-heading .task-status { flex: none; }
.task-card-summary {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
  min-height: 3.2em; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere;
}
.task-card-progress { margin-top: auto; }
.task-card-progress :deep(.el-progress__text) { min-width: 3em; font-variant-numeric: tabular-nums; text-align: right; }
.task-card-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 5px 8px; padding-top: 9px; border-top: 1px solid var(--line); }
.task-card-action { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; font-weight: 600; white-space: nowrap; }
.task-employee { display: inline-flex; align-items: center; gap: 7px; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
.employee-avatar {
  display: grid; place-items: center; flex: 0 0 24px; height: 24px; border-radius: 50%;
  background: color-mix(in srgb, var(--employee-color, var(--accent)) 12%, var(--surface));
  color: var(--employee-color, var(--accent)); font-size: 11px; font-weight: 650;
}
.task-status { justify-self: start; padding: 3px 7px; border-radius: 6px; white-space: nowrap; font-size: 12px; font-weight: 600; }
.task-status.waiting { background: #fff3db; color: #825012; }
.task-status.running { background: var(--soft); color: var(--accent); }
.task-status.done { background: #e9f5ed; color: #246744; }
.task-date { color: var(--muted); font-size: 12px; }
.task-date, .activity-meta time { font-variant-numeric: tabular-nums; }
.task-back, .task-link { display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--accent); font-size: 13px; font-weight: 600; }
.task-back { margin-bottom: 13px; }
.task-back:hover, .task-link:hover { text-decoration: underline; }
.task-link { min-height: 34px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); white-space: nowrap; }
.detail-header h1 { overflow-wrap: anywhere; }
.detail-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; color: var(--muted); font-size: 13px; }
.task-detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(245px, 330px); gap: 14px; align-items: start; }
.progress-panel { grid-area: 1 / 2; }
.task-detail-content { grid-area: 1 / 1; display: grid; gap: 14px; }
.detail-panel { min-width: 0; padding: 16px; }
.detail-title, .progress-heading { display: flex; align-items: center; gap: 8px; }
.detail-title .el-icon { flex: 0 0 auto; color: var(--accent); }
.progress-heading { justify-content: space-between; margin-bottom: 12px; }
.progress-heading h2 { margin: 0; }
.task-copy { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.65; }
.progress-panel .task-copy { margin: 9px 0 6px; }
.detail-subtitle { margin: 12px 0 4px; font-size: 13px; }
.supplement-form { display: grid; gap: 8px; margin-top: 13px; padding-top: 13px; border-top: 1px solid var(--line); }
.supplement-form label { font-size: 13px; font-weight: 650; }
.supplement-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-top: 7px; }
.supplement-actions .el-button + .el-button { margin-left: 0; }
.result-panel .detail-title .el-icon { color: #246744; }
.activity-list { margin: 0; padding: 0 0 0 7px; list-style: none; }
.activity-list li { position: relative; padding: 0 0 14px 14px; border-left: 1px solid var(--line); }
.activity-list li:last-child { border-color: transparent; padding-bottom: 0; }
.activity-list li::before { content: ''; position: absolute; left: -4px; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: #829ce8; }
.activity-list li.user-activity::before { background: #a7b1c2; }
.activity-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 9px; margin-bottom: 4px; font-size: 12px; }
.activity-meta time { color: var(--muted); }
@media (max-width: 850px) {
  .task-detail-layout { grid-template-columns: 1fr; }
  .progress-panel, .task-detail-content { grid-area: auto; }
}
@container (max-width: 420px) {
  .page-header { flex-wrap: wrap; gap: 8px; }
  .task-status-tabs :deep(.el-tabs__item) { gap: 3px; padding-inline: 4px; font-size: 12px; }
  .status-count { padding-inline: 2px; }
}
@media (max-width: 430px) {
  .detail-header { flex-wrap: wrap; gap: 10px; }
}
</style>
