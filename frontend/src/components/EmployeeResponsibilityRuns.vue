<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ElDrawer } from 'element-plus'
import { ArrowUpRight, ChevronRight, Search } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore, type Task } from '@/stores/platform'
import {
  scenarioNextStep, scenarioStatusLabels, useScenarioTaskStore,
  type ScenarioOrigin, type ScenarioTaskStatus,
} from '@/stores/scenarioTasks'

const route = useRoute()
const router = useRouter()
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const scenario = useScenarioTaskStore()

const origins = ['人员交办', '业务事件', '定时规则'] as const
const statusLabels = { waiting: '待补充', ...scenarioStatusLabels }
type RunStatus = ScenarioTaskStatus | 'waiting'
const statusTones = {
  waiting: 'warning', running: 'primary', review: 'warning', blocked: 'danger', returned: 'warning', completed: 'success',
} as const satisfies Record<RunStatus, string>
const ordinaryStatuses = {
  待补充: 'waiting', 进行中: 'running', 已完成: 'completed',
} as const satisfies Record<Task['status'], RunStatus>
const followUpStatuses: readonly RunStatus[] = ['blocked', 'review', 'waiting', 'returned']
const periods = {
  '7d': { label: '近 7 天', days: 7 },
  '30d': { label: '近 30 天', days: 30 },
} as const
const attemptStatuses = {
  running: { label: '执行中', tone: 'primary' },
  succeeded: { label: '成功', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
} as const
const dateTime = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const filters = ['q', 'employee', 'origin', 'status', 'period'] as const
type Filter = typeof filters[number]

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date)
}

const employees = computed(() => platform.employees.filter(employee => organization.myEmployeeMaintenance.has(employee.id)))
const employeeNames = computed(() => new Map(employees.value.map(employee => [employee.id, employee.name])))
const people = computed(() => new Map(platform.users.map(person => [person.id, person.name])))
const connections = computed(() => new Map(organization.connections.map(connection => [connection.id, connection.name])))
const businessTasks = computed(() => new Map(scenario.visibleTasks.map(task => [task.id, task])))
const personalTaskIds = computed(() => new Set(platform.myTasks.map(task => task.id)))

type ScenarioRun = (typeof scenario.monitoredTasks)[number]
type Run = {
  id: string
  employeeId: string
  title: string
  origin: ScenarioOrigin
  status: RunStatus
  assigneeId?: string
  updatedAt: string
  next: string
  hasDetail: boolean
  execution?: ScenarioRun
}

function scenarioStep(run: ScenarioRun) {
  switch (run.status) {
    case 'blocked': {
      const connectionId = run.attempts.at(-1)?.connectionId
      return connectionId && scenario.isConnectionAvailable(connectionId)
        ? '连接已恢复，等待接手人重试' : '等待管理员恢复依赖连接'
    }
    case 'review': {
      const task = businessTasks.value.get(run.id)
      return task ? scenarioNextStep(task) : '等待接手人复核'
    }
    case 'returned': return '补充信息后重新提交'
    case 'completed': return '结果已写回业务记录'
    case 'running': return 'AI 员工正在执行'
  }
}

function ordinaryStep(status: Task['status']) {
  switch (status) {
    case '待补充': return '等待发起人补充信息'
    case '已完成': return '交办任务已完成'
    case '进行中': return 'AI 员工正在处理'
  }
}

const runs = computed<Run[]>(() => [
  ...scenario.monitoredTasks.map(run => {
    const task = businessTasks.value.get(run.id)
    return {
      id: run.id, employeeId: run.employeeId, title: task?.title ?? run.title, origin: run.origin,
      status: run.status, assigneeId: run.assigneeId, updatedAt: run.updatedAt, next: scenarioStep(run),
      hasDetail: Boolean(task), execution: run,
    }
  }),
  ...platform.tasks.filter(task => employeeNames.value.has(task.employeeId)).map(task => {
    const hasDetail = personalTaskIds.value.has(task.id)
    return {
      id: task.id, employeeId: task.employeeId, title: hasDetail ? task.title : '人员交办任务', origin: '人员交办' as const,
      status: ordinaryStatuses[task.status], assigneeId: task.status === '待补充' ? task.userId : undefined,
      updatedAt: task.updatedAt, next: ordinaryStep(task.status), hasDetail,
    }
  }),
])

function queryString(key: Filter | 'run') {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

const view = computed(() => route.query.view === 'all' ? 'all' : 'follow-up')
const statusOptions = computed<RunStatus[]>(() => view.value === 'all'
  ? Object.keys(statusLabels) as RunStatus[] : [...followUpStatuses])
const activeFilters = computed(() => ({
  q: queryString('q') || undefined,
  employee: queryString('employee') || undefined,
  origin: origins.find(origin => origin === queryString('origin')),
  status: statusOptions.value.find(status => status === queryString('status')),
  period: Object.hasOwn(periods, queryString('period')) ? queryString('period') as keyof typeof periods : undefined,
}))
const hasFilters = computed(() => Object.values(activeFilters.value).some(Boolean))
const visibleRuns = computed(() => {
  const { q, employee, origin, status, period } = activeFilters.value
  const keyword = q?.trim().toLocaleLowerCase()
  const since = period ? Date.now() - periods[period].days * 86400000 : 0
  return runs.value.filter(run =>
    (view.value === 'all' || followUpStatuses.includes(run.status))
    && (!employee || run.employeeId === employee)
    && (!origin || run.origin === origin)
    && (!status || run.status === status)
    && (!period || Date.parse(run.updatedAt) >= since)
    && (!keyword || [run.title, employeeNames.value.get(run.employeeId), run.hasDetail ? run.execution?.objectId : undefined, run.id]
      .some(value => value?.toLocaleLowerCase().includes(keyword))),
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

function locationFor(query: Record<string, string | undefined> = {}): RouteLocationRaw {
  return {
    name: 'employee-management', params: { id: '' },
    query: { scope: 'runs', view: view.value === 'all' ? 'all' : undefined, ...activeFilters.value, ...query },
  }
}

function openView(next: 'follow-up' | 'all') {
  const status = activeFilters.value.status
  return locationFor({
    view: next === 'all' ? 'all' : undefined,
    status: next === 'all' || (status && followUpStatuses.includes(status)) ? status : undefined,
  })
}

function updateFilter(key: Filter, value: string) {
  void router.replace(locationFor({ [key]: value || undefined }))
}

function clearFilters() {
  void router.replace(locationFor(Object.fromEntries(filters.map(key => [key, undefined]))))
}

const selected = computed(() => runs.value.find(run => run.id === queryString('run')))
const drawerOpen = computed({
  get: () => Boolean(selected.value),
  set: (open: boolean) => { if (!open) void router.replace(locationFor()) },
})
const selectedBusinessTask = computed(() => selected.value && businessTasks.value.get(selected.value.id))
const latestAttempt = computed(() => selected.value?.execution?.attempts.at(-1))
const recoveryLink = computed<RouteLocationRaw | undefined>(() => {
  const run = selected.value
  if (platform.currentUser.role !== 'admin' || !run?.execution || run.status !== 'blocked'
    || !latestAttempt.value || scenario.isConnectionAvailable(latestAttempt.value.connectionId)) return
  return { name: 'admin-scenario-runs', query: { task: run.id } }
})
const detailLink = computed<RouteLocationRaw | undefined>(() => {
  const run = selected.value
  if (!run?.hasDetail) return
  return {
    name: run.execution ? 'scenario-task' : 'employee-task', params: { taskId: run.id },
    query: { from: 'employee-runs', run: run.id, view: view.value === 'all' ? 'all' : undefined, ...activeFilters.value },
  }
})

function personName(userId?: string) {
  return userId ? people.value.get(userId) ?? '成员已移除' : '—'
}
</script>

<template>
  <section class="runs-panel" aria-label="负责人运行监管">
    <div class="page-toolbar page-tab-toolbar">
      <div class="page-toolbar-filters run-filters" role="group" aria-label="筛选运行任务">
        <nav class="page-segments" aria-label="运行视图">
          <RouterLink :to="openView('follow-up')" custom v-slot="{ href, navigate }">
            <a class="page-segment" :href="href" :aria-current="view === 'follow-up' ? 'page' : undefined" @click="navigate">待跟进</a>
          </RouterLink>
          <RouterLink :to="openView('all')" custom v-slot="{ href, navigate }">
            <a class="page-segment" :href="href" :aria-current="view === 'all' ? 'page' : undefined" @click="navigate">全部运行</a>
          </RouterLink>
        </nav>
        <el-input :model-value="activeFilters.q" :prefix-icon="Search" placeholder="搜索任务、员工或编号"
          aria-label="搜索运行任务" clearable @update:model-value="updateFilter('q', $event)" />
        <el-select :model-value="activeFilters.employee" popper-class="filter-options" placeholder="全部员工" aria-label="筛选 AI 员工"
          clearable @update:model-value="updateFilter('employee', $event)">
          <el-option v-for="employee in employees" :key="employee.id" :label="employee.name" :value="employee.id" />
        </el-select>
        <el-select :model-value="activeFilters.origin" popper-class="filter-options" placeholder="全部来源" aria-label="筛选任务来源"
          clearable @update:model-value="updateFilter('origin', $event)">
          <el-option v-for="origin in origins" :key="origin" :label="origin" :value="origin" />
        </el-select>
        <el-select :model-value="activeFilters.status" popper-class="filter-options" placeholder="全部状态" aria-label="筛选任务状态"
          clearable @update:model-value="updateFilter('status', $event)">
          <el-option v-for="status in statusOptions" :key="status" :label="statusLabels[status]" :value="status" />
        </el-select>
        <el-select :model-value="activeFilters.period" popper-class="filter-options" placeholder="全部时间" aria-label="筛选更新时间"
          clearable @update:model-value="updateFilter('period', $event)">
          <el-option v-for="(period, id) in periods" :key="id" :label="period.label" :value="id" />
        </el-select>
      </div>
      <div class="page-toolbar-controls">
        <span class="run-count muted" aria-live="polite">{{ visibleRuns.length }} 项任务</span>
        <el-button v-if="hasFilters" text @click="clearFilters">清除筛选</el-button>
      </div>
    </div>
    <template v-if="visibleRuns.length">
      <div class="run-columns run-labels" aria-hidden="true">
        <span>任务</span><span>AI 员工</span><span>来源</span><span>状态</span><span>接手与下一步</span><span />
      </div>
      <ul class="run-list" aria-label="运行任务">
        <li v-for="run in visibleRuns" :key="run.id">
          <RouterLink class="run-columns run-row" :to="locationFor({ run: run.id })">
            <div class="run-title">
              <strong>{{ run.title }}</strong>
              <small class="muted">
                <template v-if="run.execution && run.hasDetail">{{ run.execution.objectId }} · {{ run.execution.objectVersion }} · </template>
                <time :datetime="run.updatedAt">{{ formatDate(run.updatedAt) }}</time>
              </small>
            </div>
            <span class="run-employee">{{ employeeNames.get(run.employeeId) ?? '—' }}</span>
            <span class="run-origin muted">{{ run.origin }}</span>
            <el-tag class="run-status" :type="statusTones[run.status]" size="small" effect="light">{{ statusLabels[run.status] }}</el-tag>
            <div class="run-next">
              <strong v-if="run.assigneeId">{{ personName(run.assigneeId) }}</strong>
              <small class="muted">{{ run.next }}</small>
            </div>
            <ChevronRight :size="15" aria-hidden="true" class="run-chevron muted" />
          </RouterLink>
        </li>
      </ul>
    </template>
    <el-empty v-else :description="hasFilters ? '没有符合筛选条件的任务' : view === 'follow-up' ? '暂无待跟进的任务' : '暂无运行任务'" :image-size="72" />
  </section>

  <ElDrawer v-model="drawerOpen" title="任务运行详情" size="min(100vw, 480px)" class="responsibility-run-drawer" append-to-body destroy-on-close>
    <template v-if="selected">
      <header class="run-detail-heading">
        <h2>{{ selected.title }}</h2>
        <el-tag :type="statusTones[selected.status]" effect="light">{{ statusLabels[selected.status] }}</el-tag>
      </header>
      <section class="run-current" aria-labelledby="run-current-heading">
        <h3 id="run-current-heading">当前处理</h3>
        <p>{{ selected.next }}</p>
        <span v-if="selected.assigneeId" class="muted">接手人 · {{ personName(selected.assigneeId) }}</span>
      </section>
      <dl class="run-fields">
        <div><dt>任务编号</dt><dd>{{ selected.id }}</dd></div>
        <div><dt>AI 员工</dt><dd>{{ employeeNames.get(selected.employeeId) ?? '—' }}</dd></div>
        <div><dt>来源</dt><dd>{{ selected.origin }}<template v-if="selected.execution"> · {{ selected.execution.channel }}</template></dd></div>
        <template v-if="selected.execution">
          <div v-if="selected.hasDetail"><dt>业务对象</dt><dd>{{ selected.execution.objectId }} · {{ selected.execution.objectVersion }}</dd></div>
          <div v-if="selected.execution.trigger"><dt>触发规则</dt><dd>{{ selected.execution.trigger }}</dd></div>
          <div v-if="latestAttempt"><dt>执行版本</dt><dd>{{ latestAttempt.version }}</dd></div>
          <div v-if="selected.execution.writtenAt"><dt>结果写回</dt><dd>{{ formatDate(selected.execution.writtenAt) }}</dd></div>
        </template>
        <div><dt>更新时间</dt><dd>{{ formatDate(selected.updatedAt) }}</dd></div>
      </dl>
      <section v-if="selected.execution?.attempts.length" class="run-detail-section" aria-labelledby="run-attempts-heading">
        <h3 id="run-attempts-heading">执行与写回记录</h3>
        <ol class="run-history">
          <li v-for="attempt in selected.execution.attempts" :key="attempt.id">
            <div class="run-history-title">
              <strong>{{ attempt.operation }}</strong>
              <el-tag :type="attemptStatuses[attempt.status].tone" size="small" effect="plain">{{ attemptStatuses[attempt.status].label }}</el-tag>
            </div>
            <small class="muted">{{ formatDate(attempt.startedAt) }} · {{ attempt.version }} · {{ connections.get(attempt.connectionId) ?? '依赖连接' }}</small>
            <p v-if="attempt.message">{{ attempt.message }}</p>
          </li>
        </ol>
      </section>
      <section v-if="selectedBusinessTask?.activity.length" class="run-detail-section" aria-labelledby="run-activity-heading">
        <h3 id="run-activity-heading">任务进展</h3>
        <ol class="run-history">
          <li v-for="(entry, index) in selectedBusinessTask.activity" :key="index">
            <div class="run-history-title"><strong>{{ entry.label }}</strong><time class="muted" :datetime="entry.at">{{ formatDate(entry.at) }}</time></div>
            <p>{{ entry.detail }}</p>
          </li>
        </ol>
      </section>
    </template>
    <template #footer>
      <div class="run-detail-actions">
        <span v-if="selected && !detailLink" class="muted">任务内容由获业务授权的成员查看和处理。</span>
        <RouterLink v-if="recoveryLink" class="el-button" :to="recoveryLink">
          前往后台恢复连接
        </RouterLink>
        <RouterLink v-if="detailLink" class="el-button el-button--primary" :to="detailLink">
          打开任务详情 <ArrowUpRight :size="15" aria-hidden="true" />
        </RouterLink>
      </div>
    </template>
  </ElDrawer>
</template>

<style scoped>
.runs-panel { container-type: inline-size; }
.run-count { font-size: 12px; white-space: nowrap; }
.run-filters { flex: 1 1 300px; }
.run-filters .el-input { width: 190px; min-width: 0; max-width: 100%; }
.run-filters .el-select { width: 104px; min-width: 0; max-width: 100%; }
.run-list, .run-history { margin: 0; padding: 0; list-style: none; }
.run-columns {
  display: grid; grid-template-columns: minmax(130px, 1.45fr) minmax(76px, .75fr) 65px 70px minmax(105px, 1fr) 15px;
  align-items: center; gap: 10px; padding: 10px 13px;
}
.run-labels { margin-block-start: var(--page-body-start); background: var(--canvas); color: var(--muted); font-size: 12px; font-weight: 650; border-top: 1px solid var(--line); }
.run-list li { border-top: 1px solid var(--line); }
.run-row { color: var(--text); font-size: 13px; }
.run-row:hover { background: var(--soft); }
.run-row:focus-visible { outline-offset: -3px; }
.run-row > * { min-width: 0; overflow-wrap: anywhere; }
.run-title strong { font-size: 14px; }
.run-row small { display: block; font-size: 12px; line-height: 1.45; }
.run-title small, .run-next strong + small { margin-top: 3px; }
.run-next strong { font-weight: 550; }
.run-status { justify-self: start; }
.run-detail-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.run-detail-heading h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
.run-current { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); }
.run-current h3, .run-detail-section h3 { margin: 0 0 5px; font-size: 14px; }
.run-current p { margin: 0; font-size: 14px; }
.run-current span { display: block; margin-top: 4px; font-size: 12px; }
.run-fields { margin: 10px 0 0; }
.run-fields > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--line); }
.run-fields dt { color: var(--muted); }
.run-fields dd { margin: 0; overflow-wrap: anywhere; }
.run-detail-section { margin-top: 16px; }
.run-history li { padding: 8px 0; border-bottom: 1px solid var(--line); }
.run-history-title { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; font-size: 13px; }
.run-history time, .run-history small { display: inline-block; font-size: 12px; }
.run-history p { margin: 5px 0 0; color: var(--muted); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
:global(.responsibility-run-drawer .el-drawer__body) { padding-top: 10px; }
:global(.responsibility-run-drawer .el-drawer__footer) { border-top: 1px solid var(--line); }
.run-detail-actions { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 8px; }
.run-detail-actions .el-button { margin: 0; gap: 5px; }
.run-detail-actions > span { font-size: 12px; }
@container (max-width: 650px) {
  .run-labels { display: none; }
  .run-row {
    grid-template-columns: minmax(0, 1fr) auto 15px;
    grid-template-areas: 'title status arrow' 'employee origin origin' 'next next next';
    gap: 6px 8px;
  }
  .run-title { grid-area: title; }
  .run-status { grid-area: status; }
  .run-chevron { grid-area: arrow; }
  .run-employee { grid-area: employee; }
  .run-origin { grid-area: origin; justify-self: end; }
  .run-next { grid-area: next; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .run-next strong + small { margin-top: 0; }
}
@container (max-width: 440px) {
  .run-filters { flex-basis: 100%; }
  .run-filters .el-input { flex: 1 1 110px; }
  .run-filters .el-select { flex-basis: calc(50% - 4px); width: 0; max-width: none; }
}
</style>
