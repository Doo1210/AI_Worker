<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type RouteLocationRaw } from 'vue-router'
import { ArrowRight, Search } from 'lucide-vue-next'
import EmployeeTaskEmployeeList from '@/components/EmployeeTaskEmployeeList.vue'
import EmployeeTaskViewTabs from '@/components/EmployeeTaskViewTabs.vue'
import { useEmployeePendingTasks } from '@/employeePendingTasks'
import { autonomousTaskStatusLabels, useEmployeeAutonomousTasks } from '@/stores/employeeAutonomousTasks'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore, type Task } from '@/stores/platform'
import { scenarioNextStep, scenarioProgress, scenarioStatusLabels, useScenarioTaskStore } from '@/stores/scenarioTasks'

const route = useRoute()
const router = useRouter()
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const { visibleTasks } = useEmployeeAutonomousTasks()
const scenario = useScenarioTaskStore()
const { pendingTasks } = useEmployeePendingTasks()

const sourceLabels = { assigned: '成员交办', autonomous: '自主触发' } as const
const statusLabels = { waiting: '待补充', running: '进行中', review: '待复核', blocked: '执行异常', returned: '已退回', completed: '已完成' } as const
const assignedStatuses = { 待补充: 'waiting', 进行中: 'running', 已完成: 'completed' } satisfies Record<Task['status'], keyof typeof statusLabels>
const periodOptions = { '7d': { label: '近 7 天', days: 7 }, '30d': { label: '近 30 天', days: 30 } } as const

type Filter = 'q' | 'employee' | 'source' | 'status' | 'period'
type OverviewTask = {
  id: string
  employeeId: string
  kind: 'assigned' | 'autonomous' | 'scenario'
  title: string
  source: keyof typeof sourceLabels
  status: keyof typeof statusLabels
  statusLabel: string
  progress: number
  summary: string
  updatedAt: string
  origin?: string
  channel?: string
}

function queryString(query: LocationQuery, key: Filter) {
  const value = query[key]
  return typeof value === 'string' ? value : ''
}

function readFilters(query: LocationQuery) {
  const source = queryString(query, 'source')
  const status = queryString(query, 'status')
  const period = queryString(query, 'period')
  return {
    q: queryString(query, 'q'),
    employee: queryString(query, 'employee'),
    source: Object.hasOwn(sourceLabels, source) ? source : '',
    status: Object.hasOwn(statusLabels, status) ? status : '',
    period: Object.hasOwn(periodOptions, period) ? period : '',
  }
}

const filters = reactive(readFilters(route.query))
const actionScope = computed(() => route.query.scope === 'action')
const pendingIds = computed(() => new Set(pendingTasks.value.map(task => `${task.kind}:${task.id}`)))
const overviewEmployees = computed(() => {
  const additionalIds = new Set(scenario.visibleTasks.map(task => task.employeeId))
  if (actionScope.value && organization.myEmployeeMaintenance.has(filters.employee)) additionalIds.add(filters.employee)
  const visibleIds = new Set(platform.visibleEmployees.map(employee => employee.id))
  return [...platform.visibleEmployees, ...platform.employees.filter(employee => additionalIds.has(employee.id) && !visibleIds.has(employee.id))]
})
const employees = computed(() => new Map(overviewEmployees.value.map(employee => [employee.id, employee])))
const selectedEmployee = computed(() => employees.value.get(filters.employee))
const unavailableEmployee = computed(() => !!filters.employee && !selectedEmployee.value)
const hasTaskFilters = computed(() => Boolean(filters.q || filters.source || filters.status || filters.period))
const filterQuery = computed(() => ({
  q: filters.q || undefined,
  employee: filters.employee || undefined,
  source: filters.source || undefined,
  status: filters.status || undefined,
  period: filters.period || undefined,
  scope: actionScope.value ? 'action' : undefined,
}))

watch(() => route.query, query => {
  if (route.name === 'employee-task-overview') Object.assign(filters, readFilters(query))
})

function updateFilter(key: Filter, value: string) {
  filters[key] = value
  void router.replace({ name: 'employee-task-overview', query: filterQuery.value })
}

function resetTaskFilters() {
  Object.assign(filters, readFilters({ employee: filters.employee }))
  void router.replace({ name: 'employee-task-overview', query: filterQuery.value })
}

const overviewTasks = computed<OverviewTask[]>(() => [
  ...platform.myTasks.map(task => ({
    id: task.id,
    employeeId: task.employeeId,
    title: task.title,
    kind: 'assigned' as const,
    source: 'assigned' as const,
    status: assignedStatuses[task.status],
    statusLabel: task.status === '待补充' ? '待我补充' : task.status,
    progress: task.progress,
    summary: task.detail,
    updatedAt: task.updatedAt,
  })),
  ...visibleTasks.value.map(task => ({
    id: task.id,
    employeeId: task.employeeId,
    title: task.title,
    kind: 'autonomous' as const,
    source: 'autonomous' as const,
    status: task.status,
    statusLabel: autonomousTaskStatusLabels[task.status],
    progress: task.progress,
    summary: task.summary,
    updatedAt: task.updatedAt,
  })),
  ...scenario.visibleTasks.map(task => ({
    id: task.id, employeeId: task.employeeId, title: task.title,
    source: task.origin === '人员交办' ? 'assigned' as const : 'autonomous' as const,
    status: task.status, statusLabel: scenarioStatusLabels[task.status],
    progress: scenarioProgress(task), summary: scenarioNextStep(task), updatedAt: task.updatedAt,
    kind: 'scenario' as const, origin: task.origin, channel: task.channel,
  })),
])

const matchingTasks = computed(() => {
  const search = filters.q.trim().toLocaleLowerCase()
  const period = periodOptions[filters.period as keyof typeof periodOptions]
  const since = period ? Date.now() - period.days * 86_400_000 : undefined
  return overviewTasks.value
    .flatMap(task => {
      const employee = employees.value.get(task.employeeId)
      if (!employee) return []
      if (actionScope.value && !pendingIds.value.has(`${task.kind}:${task.id}`)) return []
      if (filters.source && task.source !== filters.source) return []
      if (filters.status && task.status !== filters.status) return []
      const updatedAt = Date.parse(task.updatedAt)
      if (since !== undefined && !(updatedAt >= since)) return []
      if (search && ![task.title, employee.name, employee.role, task.channel ?? ''].some(value => value.toLocaleLowerCase().includes(search))) return []
      return [{ task, employee, updatedAt }]
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

const employeeTaskCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const { employee } of matchingTasks.value) counts.set(employee.id, (counts.get(employee.id) ?? 0) + 1)
  return counts
})

const filteredTasks = computed(() => filters.employee
  ? matchingTasks.value.filter(({ employee }) => employee.id === filters.employee)
  : matchingTasks.value)

const emptyDescription = computed(() => {
  if (unavailableEmployee.value) return '当前账号无法查看这位员工的任务'
  return hasTaskFilters.value ? '没有符合当前筛选的任务' : actionScope.value ? '暂无待你处理的任务' : '暂无可查看的任务'
})

function taskLink(task: OverviewTask): RouteLocationRaw {
  const query = { ...filterQuery.value, from: 'overview' }
  if (task.kind === 'scenario') return { name: 'scenario-task', params: { taskId: task.id }, query }
  return task.source === 'assigned'
    ? { name: 'employee-task', params: { taskId: task.id }, query }
    : { name: 'employee-autonomous-tasks', params: { id: task.employeeId }, query: { ...query, task: task.id } }
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="page page-surface task-overview" aria-label="任务总览">
    <header class="page-controls">
      <EmployeeTaskViewTabs />
      <div class="page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters overview-filters" role="group" aria-label="筛选任务">
          <label class="search-field filter-search">
            <Search :size="16" aria-hidden="true" />
            <input :value="filters.q" type="search" aria-label="搜索任务" placeholder="搜索任务名称、专家姓名或岗位" @input="updateFilter('q', ($event.target as HTMLInputElement).value)" />
          </label>
          <select class="filter-field" :value="filters.source" aria-label="任务来源" @change="updateFilter('source', ($event.target as HTMLSelectElement).value)">
            <option value="">全部来源</option>
            <option v-for="(label, source) in sourceLabels" :key="source" :value="source">{{ label }}</option>
          </select>
          <select class="filter-field" :value="filters.status" aria-label="任务状态" @change="updateFilter('status', ($event.target as HTMLSelectElement).value)">
            <option value="">全部状态</option>
            <option v-for="(label, status) in statusLabels" :key="status" :value="status">{{ label }}</option>
          </select>
          <select class="filter-field" :value="filters.period" aria-label="更新时间" @change="updateFilter('period', ($event.target as HTMLSelectElement).value)">
            <option value="">全部时间</option>
            <option v-for="(period, id) in periodOptions" :key="id" :value="id">{{ period.label }}</option>
          </select>
        </div>
        <div v-if="hasTaskFilters" class="page-toolbar-controls">
          <button class="reset-filters" type="button" @click="resetTaskFilters">清除任务筛选</button>
        </div>
      </div>
    </header>

    <div class="page-body overview-layout">
      <EmployeeTaskEmployeeList
        :employees="overviewEmployees"
        :selected-id="filters.employee"
        :counts="employeeTaskCounts"
        :total="matchingTasks.length"
        @select="updateFilter('employee', $event)"
      />

      <section class="overview-results" aria-labelledby="task-scope-heading">
        <header class="overview-scope">
          <h2 id="task-scope-heading">{{ selectedEmployee?.name ?? (unavailableEmployee ? '员工不可用' : '全部员工的任务') }}</h2>
          <span class="muted" aria-live="polite">{{ filteredTasks.length }} 项任务</span>
        </header>
        <div v-if="filteredTasks.length" class="panel task-list" :class="{ 'is-scoped': selectedEmployee }">
          <div class="task-list-heading task-columns" aria-hidden="true">
            <span>任务</span><span v-if="!selectedEmployee">AI 员工</span><span>来源</span><span>状态</span><span>最近进展</span>
          </div>
          <ul aria-label="任务记录">
            <li v-for="{ task, employee, updatedAt } in filteredTasks" :key="`${task.kind}:${task.id}`">
              <RouterLink class="task-row task-columns" :to="taskLink(task)">
                <strong class="task-title">{{ task.title }}</strong>
                <span v-if="!selectedEmployee" class="task-employee">{{ employee.name }} <small>{{ employee.role }}</small></span>
                <span class="task-source">{{ task.origin ?? sourceLabels[task.source] }}<small v-if="task.channel">{{ task.channel }}</small></span>
                <span class="task-status" :class="task.status">{{ task.statusLabel }}</span>
                <span class="task-update">
                  <span class="update-details">
                    <span class="update-summary">{{ task.summary }}</span>
                    <span class="update-meta">
                      <span>{{ task.progress }}%</span>
                      <time v-if="Number.isFinite(updatedAt)" :datetime="task.updatedAt">{{ dateFormat.format(updatedAt) }}</time>
                    </span>
                  </span>
                  <ArrowRight :size="14" aria-hidden="true" class="row-arrow" />
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>
        <el-empty v-else class="panel" :description="emptyDescription" :image-size="88" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.task-overview { container-type: inline-size; }
.overview-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); align-items: start; gap: 16px; }
.overview-results { min-width: 0; container-type: inline-size; }
.overview-scope { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin-bottom: 10px; }
.overview-scope h2 { margin: 0; font-size: 17px; font-weight: 680; overflow-wrap: anywhere; }
.overview-scope .muted { font-size: 12px; }
.search-field { width: 225px; }
.reset-filters { padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; }
.reset-filters:hover { text-decoration: underline; }
.task-list ul { margin: 0; padding: 0; list-style: none; }
.task-columns { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(86px, .7fr) 70px 75px minmax(0, 1.45fr); align-items: center; gap: 12px; padding: 12px 14px; }
.is-scoped .task-columns { grid-template-columns: minmax(0, 1.2fr) 70px 75px minmax(0, 1.45fr); }
.task-list-heading { border-radius: 11px 11px 0 0; background: var(--soft); color: var(--muted); font-size: 12px; }
.task-row { min-height: 62px; border-top: 1px solid var(--line); color: var(--text); font-size: 13px; }
.task-row:hover, .task-row:focus-visible { background: var(--soft); }
.task-row:focus-visible { outline-offset: -2px; }
.task-list li:last-child .task-row { border-radius: 0 0 11px 11px; }
.task-title { min-width: 0; overflow-wrap: anywhere; font-size: 14px; font-weight: 650; }
.task-employee { overflow-wrap: anywhere; }
.task-employee small { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
.task-source { color: var(--muted); white-space: nowrap; }
.task-source small { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.task-status { justify-self: start; padding: 3px 7px; border-radius: 6px; font-size: 11px; white-space: nowrap; }
.task-status.waiting, .task-status.review, .task-status.returned, .task-status.blocked { background: #fff4dd; color: #81550b; }
.task-status.running { background: #edf2ff; color: #2c55bd; }
.task-status.completed { background: #e8f6ed; color: #25734b; }
.task-update { display: flex; min-width: 0; justify-content: space-between; align-items: center; gap: 8px; }
.update-details { display: grid; min-width: 0; gap: 4px; }
.update-summary { display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.update-meta { display: flex; flex-wrap: wrap; gap: 2px 9px; color: var(--muted); font-size: 11px; }
.row-arrow { flex-shrink: 0; color: var(--muted); }

@container (max-width: 820px) {
  .overview-layout { grid-template-columns: minmax(0, 1fr); }
}

@container (max-width: 660px) {
  .task-list-heading { display: none; }
  .task-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px 10px; }
  .is-scoped .task-row { grid-template-columns: minmax(0, 1fr) auto; }
  .task-list li:first-child .task-row { border-top: 0; border-radius: 11px 11px 0 0; }
  .task-title { grid-column: 1 / -1; }
  .task-employee small { display: none; }
  .task-update { grid-column: 1 / -1; }
}

@container (max-width: 400px) {
  .overview-filters { flex-basis: 100%; }
  .search-field { flex: 1 0 100%; }
  .overview-filters select { flex: 1 1 68px; }
}
</style>
