<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowUpRight, ChevronRight, Search, Zap } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore } from '@/stores/platform'
import { scenarioStatusLabels, useScenarioTaskStore, type ScenarioTaskStatus } from '@/stores/scenarioTasks'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const runtime = useScenarioTaskStore()
const route = useRoute()
const router = useRouter()

const taskStatusTone = {
  running: 'primary', review: 'warning', blocked: 'danger', returned: 'warning', completed: 'success',
} as const satisfies Record<ScenarioTaskStatus, string>

const attemptStatus = {
  running: { label: '执行中', tone: 'primary' },
  succeeded: { label: '成功', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
} as const

type AdminTask = (typeof runtime.adminTasks)[number]
type Filter = 'q' | 'employee' | 'origin' | 'status' | 'connection'

const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date)
}

function queryValue(name: Filter | 'task') {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

function locationFor(task?: string) {
  return { name: 'admin-scenario-runs', query: { ...route.query, task } }
}

function updateFilter(key: Filter, value: string) {
  void router.replace({ name: 'admin-scenario-runs', query: { ...route.query, [key]: value || undefined, task: undefined } })
}

const employeeNames = computed(() => new Map(platform.employees.map(employee => [employee.id, employee.name])))
const members = computed(() => new Map(platform.users.map(user => [user.id, user.name])))
const connections = computed(() => new Map(organization.connections.map(connection => [connection.id, connection])))
const employees = computed(() => [...new Set(runtime.adminTasks.map(task => task.employeeId))])
const origins = ['人员交办', '业务事件', '定时规则'] as const
const selectedId = computed(() => queryValue('task'))
const selected = computed(() => runtime.adminTasks.find(task => task.id === selectedId.value))
const latestAttempt = computed(() => selected.value?.attempts.at(-1))
const dependency = computed(() => connections.value.get(latestAttempt.value?.connectionId ?? ''))
const dependencyReady = computed(() => !!dependency.value && runtime.isConnectionAvailable(dependency.value.id))
const canRecoverConnection = computed(() => selected.value?.status === 'blocked' && dependency.value
  && dependency.value.status !== '已停用' && !dependencyReady.value)

const hasFilters = computed(() => (['q', 'employee', 'origin', 'status', 'connection'] as const).some(key => queryValue(key)))
const visibleTasks = computed(() => {
  const keyword = queryValue('q').trim().toLocaleLowerCase()
  const employee = queryValue('employee')
  const origin = queryValue('origin')
  const status = queryValue('status')
  const connection = queryValue('connection')

  return runtime.adminTasks.filter(task =>
    (!employee || task.employeeId === employee)
    && (!origin || task.origin === origin)
    && (!status || task.status === status)
    && (!connection || task.attempts.some(attempt => attempt.connectionId === connection))
    && [task.id, task.objectId, employeeNames.value.get(task.employeeId) ?? ''].some(value => value.toLocaleLowerCase().includes(keyword)),
  ).sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
})

const stats = computed(() => ({
  tasks: runtime.adminTasks.length,
  review: runtime.adminTasks.filter(task => task.status === 'review' || task.status === 'returned').length,
  blocked: runtime.adminTasks.filter(task => task.status === 'blocked').length,
  attempts: runtime.adminTasks.reduce((count, task) => count + task.attempts.length, 0),
}))

function nextStep(task: AdminTask) {
  switch (task.status) {
    case 'running': return '等待 AI 员工完成本次执行。'
    case 'review': return '由当前接手人在工作门户复核。'
    case 'returned': return '由当前接手人在工作门户补充后重新提交。'
    case 'completed': return '任务已完成，可查看历次执行记录。'
    case 'blocked': {
      if (dependencyReady.value) return '连接已恢复，等待业务负责人在工作门户重试。'
      if (dependency.value?.status === '已停用') return '在系统接入启用连接并完成检测后，由业务负责人重试。'
      if (dependency.value) return '恢复依赖连接后，由业务负责人在工作门户重试。'
      return '由业务负责人核对异常并在工作门户处理。'
    }
  }
}

function restoreDependency() {
  const connection = dependency.value
  if (!connection || !canRecoverConnection.value) return
  if (runtime.restoreConnection(connection.id)) ElMessage.success('模拟连接已恢复，等待业务负责人重试。')
  else ElMessage.warning('连接恢复失败，请在系统接入检查连接配置。')
}
</script>

<template>
  <section class="page page-surface" :aria-label="selectedId ? '任务运行详情' : '运行监管'">
    <header v-if="selectedId" class="page-controls page-toolbar page-tab-toolbar">
      <RouterLink class="run-link back-link" :to="locationFor()"><ArrowLeft :size="16" aria-hidden="true" />返回运行监管</RouterLink>
    </header>

    <div v-if="selected" class="page-body">
      <div class="runtime-details">
        <section class="panel detail-panel" aria-labelledby="runtime-task-heading">
          <h2 id="runtime-task-heading" class="section-title">任务信息</h2>
          <dl class="run-fields">
            <div><dt>任务编号</dt><dd>{{ selected.id }}</dd></div>
            <div><dt>状态</dt><dd><el-tag :type="taskStatusTone[selected.status]" effect="light" size="small" disable-transitions>{{ scenarioStatusLabels[selected.status] }}</el-tag></dd></div>
            <div><dt>场景</dt><dd>{{ selected.title }}</dd></div>
            <div><dt>AI 员工</dt><dd>{{ employeeNames.get(selected.employeeId) ?? selected.employeeId }}</dd></div>
            <div><dt>业务记录编号</dt><dd>{{ selected.objectId }}</dd></div>
            <div><dt>业务版本</dt><dd>{{ selected.objectVersion || '—' }}</dd></div>
            <div><dt>发起方式</dt><dd>{{ selected.origin }}</dd></div>
            <div><dt>来源入口</dt><dd>{{ selected.channel }}</dd></div>
            <div v-if="selected.trigger"><dt>触发规则</dt><dd>{{ selected.trigger }}</dd></div>
            <div><dt>发起时间</dt><dd><time :datetime="selected.createdAt">{{ formatDate(selected.createdAt) }}</time></dd></div>
            <div><dt>最近更新</dt><dd><time :datetime="selected.updatedAt">{{ formatDate(selected.updatedAt) }}</time></dd></div>
          </dl>
        </section>

        <section class="panel detail-panel" aria-labelledby="runtime-handler-heading">
          <h2 id="runtime-handler-heading" class="section-title">当前处理</h2>
          <dl class="run-fields">
            <div><dt>当前接手人</dt><dd>{{ members.get(selected.assigneeId) ?? '—' }}</dd></div>
            <div v-if="latestAttempt"><dt>最近执行版本</dt><dd>{{ latestAttempt.version || '—' }}</dd></div>
            <div v-if="latestAttempt?.connectionId"><dt>依赖连接</dt><dd>
              <RouterLink v-if="dependency" class="run-link" :to="'/admin/connections/' + encodeURIComponent(dependency.id)">{{ dependency.name }} <ArrowUpRight :size="14" aria-hidden="true" /></RouterLink>
              <span v-else>连接不可用</span>
              <el-tag v-if="dependency" class="dependency-status" :type="dependencyReady ? 'success' : 'warning'" size="small" effect="light" disable-transitions>{{ dependency.status }}</el-tag>
            </dd></div>
          </dl>
          <p class="next-step" :class="{ 'has-issue': selected.status === 'blocked' }">{{ nextStep(selected) }}</p>
          <el-button v-if="canRecoverConnection" :icon="Zap" type="primary" @click="restoreDependency">模拟恢复连接</el-button>
        </section>
      </div>

      <section class="panel detail-panel execution-list" aria-labelledby="runtime-attempt-heading">
        <div class="run-section-header">
          <h2 id="runtime-attempt-heading" class="section-title">执行记录</h2>
          <span class="muted">{{ selected.attempts.length }} 次</span>
        </div>
        <ol v-if="selected.attempts.length" class="run-attempts">
          <li v-for="(attempt, index) in selected.attempts" :key="attempt.id" class="run-attempt">
            <div class="attempt-heading">
              <strong>第 {{ index + 1 }} 项 · {{ attempt.operation }}</strong>
              <el-tag :type="attemptStatus[attempt.status].tone" effect="light" size="small" disable-transitions>{{ attemptStatus[attempt.status].label }}</el-tag>
            </div>
            <p class="attempt-data muted">
              <span>版本 {{ attempt.version || '—' }}</span>
              <span><time :datetime="attempt.startedAt">{{ formatDate(attempt.startedAt) }}</time><template v-if="attempt.endedAt"> 至 <time :datetime="attempt.endedAt">{{ formatDate(attempt.endedAt) }}</time></template></span>
              <span v-if="attempt.connectionId">{{ connections.get(attempt.connectionId)?.name ?? '连接不可用' }}</span>
            </p>
            <p class="attempt-message">{{ attempt.message }}</p>
          </li>
        </ol>
        <p v-else class="muted">暂无执行记录。</p>
      </section>
    </div>

    <el-empty v-else-if="selectedId" :image-size="84" description="任务不存在或当前账号无权查看" />

    <template v-else>
      <header class="page-controls page-toolbar page-tab-toolbar run-filters">
        <div class="page-toolbar-filters">
          <el-input :model-value="queryValue('q')" :prefix-icon="Search" clearable aria-label="搜索运行任务" placeholder="搜索任务编号、记录编号或员工" @update:model-value="updateFilter('q', $event)" />
          <el-select :model-value="queryValue('employee')" popper-class="filter-options" aria-label="AI 员工" placeholder="全部员工" clearable @update:model-value="updateFilter('employee', $event ?? '')">
            <el-option v-for="id in employees" :key="id" :label="employeeNames.get(id) ?? id" :value="id" />
          </el-select>
          <el-select :model-value="queryValue('origin')" popper-class="filter-options" aria-label="发起方式" placeholder="全部发起方式" clearable @update:model-value="updateFilter('origin', $event ?? '')">
            <el-option v-for="origin in origins" :key="origin" :label="origin" :value="origin" />
          </el-select>
          <el-select :model-value="queryValue('status')" popper-class="filter-options" aria-label="任务状态" placeholder="全部状态" clearable @update:model-value="updateFilter('status', $event ?? '')">
            <el-option v-for="(label, status) in scenarioStatusLabels" :key="status" :label="label" :value="status" />
          </el-select>
          <el-tag v-if="queryValue('connection')" effect="plain" closable @close="updateFilter('connection', '')">{{ connections.get(queryValue('connection'))?.name ?? '连接不可用' }}</el-tag>
        </div>
        <div class="page-toolbar-controls">
          <span class="run-filter-count muted" aria-live="polite">{{ visibleTasks.length }} 项任务</span>
          <RouterLink v-if="hasFilters" class="run-link" :to="{ name: 'admin-scenario-runs' }">清除筛选</RouterLink>
        </div>
      </header>

      <dl class="runtime-stats page-body" aria-label="任务运行统计">
        <div class="panel"><dt>任务总数</dt><dd>{{ stats.tasks }}</dd></div>
        <div class="panel"><dt>待业务处理</dt><dd>{{ stats.review }}</dd></div>
        <div class="panel"><dt>运行异常</dt><dd :class="{ 'stat-issue': stats.blocked }">{{ stats.blocked }}</dd></div>
        <div class="panel"><dt>执行记录</dt><dd>{{ stats.attempts }}</dd></div>
      </dl>

      <section aria-label="任务运行列表">
        <template v-if="visibleTasks.length">
          <div class="run-columns run-labels" aria-hidden="true"><span>业务记录</span><span>AI 员工</span><span>发起方式</span><span>任务状态</span><span>最近更新</span><span></span></div>
          <ul class="run-list">
            <li v-for="task in visibleTasks" :key="task.id">
              <RouterLink class="run-columns run-row" :to="locationFor(task.id)">
                <span class="run-object"><strong>{{ task.objectId }}</strong><small class="muted">{{ task.id }}</small></span>
                <span class="run-employee">{{ employeeNames.get(task.employeeId) ?? task.employeeId }}</span>
                <span class="run-origin">{{ task.origin }}<small class="muted">{{ task.channel }}</small></span>
                <el-tag class="run-status" :type="taskStatusTone[task.status]" effect="light" size="small" disable-transitions>{{ scenarioStatusLabels[task.status] }}</el-tag>
                <time class="run-updated muted" :datetime="task.updatedAt">{{ formatDate(task.updatedAt) }}</time>
                <ChevronRight class="run-open" :size="16" aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
        </template>
        <el-empty v-else :image-size="84" :description="hasFilters ? '没有符合条件的任务' : '暂无场景任务。可在 ET 设计或招投标工作台发起演示。'" />
      </section>
    </template>
  </section>
</template>

<style scoped>
.run-link { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); overflow-wrap: anywhere; }
.run-link:hover { text-decoration: underline; }
.back-link { font-size: 13px; }
.runtime-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; }
.runtime-stats > div { display: flex; flex-direction: column; gap: 7px; padding: 14px 16px; }
.runtime-stats dt { color: var(--muted); font-size: 13px; }
.runtime-stats dd { margin: 0; color: var(--text); font-size: 24px; font-weight: 680; font-variant-numeric: tabular-nums; }
.runtime-stats .stat-issue { color: #a83232; }
.run-filters .el-input { width: min(100%, 204px); }
.run-filters .el-select { width: 112px; }
.run-filters .el-tag { max-width: 100%; height: auto; min-height: 24px; white-space: normal; overflow-wrap: anywhere; }
.run-filters .run-link, .run-filter-count { font-size: 12px; }
.run-filter-count { white-space: nowrap; }
.run-list, .run-attempts { list-style: none; padding: 0; margin: 0; }
.run-list > li { border-top: 1px solid var(--line); }
.run-columns {
  display: grid; grid-template-columns: minmax(115px, 1.15fr) minmax(75px, 1fr) minmax(70px, .9fr) 76px 125px 16px;
  align-items: center; gap: 10px; padding: 11px 15px;
}
.run-labels { border-top: 1px solid var(--line); color: var(--muted); background: var(--canvas); font-size: 12px; font-weight: 610; }
.run-row:hover { background: var(--soft); }
.run-row:focus-visible { outline-offset: -3px; }
.run-row > * { min-width: 0; overflow-wrap: anywhere; }
.run-row small { display: block; margin-top: 3px; font-size: 12px; }
.run-status { justify-self: start; }
.run-open, .run-updated { color: var(--muted); }
.run-updated { font-size: 12px; font-variant-numeric: tabular-nums; }
.runtime-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 14px; }
.detail-panel { min-width: 0; padding: 16px; }
.run-fields { margin: 0; }
.run-fields > div { display: grid; grid-template-columns: 95px minmax(0, 1fr); gap: 8px; padding: 7px 0; }
.run-fields > div + div { border-top: 1px solid var(--line); }
.run-fields dt { color: var(--muted); font-size: 13px; }
.run-fields dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.dependency-status { margin-left: 8px; }
.next-step { margin: 8px 0 0; padding: 9px 11px; border-radius: 7px; background: var(--canvas); line-height: 1.6; }
.next-step.has-issue { background: #fff3e6; color: #854922; }
.next-step + .el-button { margin-top: 10px; }
.execution-list { margin-top: 14px; }
.run-section-header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px; }
.run-section-header > span { font-size: 13px; }
.run-attempt { padding: 12px 0; border-top: 1px solid var(--line); }
.run-attempt:last-child { padding-bottom: 0; }
.attempt-heading, .attempt-data { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 14px; }
.attempt-data { margin: 6px 0 0; font-size: 12px; }
.attempt-message { margin: 7px 0 0; line-height: 1.6; overflow-wrap: anywhere; }

@media (max-width: 900px) {
  .runtime-details { grid-template-columns: 1fr; }
  .run-columns { grid-template-columns: minmax(95px, 1fr) minmax(65px, 1fr) minmax(62px, .9fr) 67px 98px 16px; gap: 6px; }
}
@media (max-width: 740px) {
  .runtime-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .runtime-stats > div { padding: 10px 12px; }
  .run-labels { display: none; }
  .run-row {
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto 16px;
    grid-template-areas: 'object object status arrow' 'employee origin updated updated';
    gap: 6px; padding: 10px 12px;
  }
  .run-object { grid-area: object; }
  .run-employee { grid-area: employee; }
  .run-origin { grid-area: origin; }
  .run-status { grid-area: status; }
  .run-updated { grid-area: updated; justify-self: end; }
  .run-open { grid-area: arrow; }
  .run-employee, .run-origin { font-size: 12px; }
  .detail-panel { padding: 12px; }
  .run-fields > div { grid-template-columns: 85px minmax(0, 1fr); }
}
</style>
