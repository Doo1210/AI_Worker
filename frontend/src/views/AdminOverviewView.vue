<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ElDrawer } from 'element-plus'
import {
  Activity, ArrowRight, BadgeDollarSign, Bot, Boxes, Check, ChevronRight, CircleAlert,
  Clock3, Cpu, Layers3, MessagesSquare, RefreshCw, ShieldCheck, UsersRound,
} from 'lucide-vue-next'
import { useAdminOverviewStore, type OverviewDetailRow, type OverviewMetric, type OverviewPeriod } from '@/stores/adminOverview'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const overview = useAdminOverviewStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const periods: { value: OverviewPeriod; label: string }[] = [
  { value: '24h', label: '近 24 小时' }, { value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' },
]
const period = computed(() => periods.find(item => item.value === route.query.period)?.value ?? '7d')
const departmentId = computed(() => organization.departments.find(item => item.id === route.query.department)?.id ?? '')
const data = computed(() => overview.snapshot(period.value, departmentId.value))
const metricIcons = {
  members: UsersRound, assistant: MessagesSquare, tasks: Bot, issues: CircleAlert, tokens: Layers3, cost: BadgeDollarSign,
}
const currentMetric = computed(() => data.value.metrics.find(item => item.id === route.query.metric))
const currentRows = computed(() => currentMetric.value ? data.value.details[currentMetric.value.id] : [])
const currentRecord = computed(() => currentRows.value.find(item => item.id === route.query.record))
const drawerOpen = computed({
  get: () => !!currentMetric.value,
  set: value => { if (!value) void router.replace({ query: { ...route.query, metric: undefined, record: undefined } }) },
})
const trendOptions = [
  { id: 'assistant', name: '助理请求' }, { id: 'workbench', name: '工作台使用' }, { id: 'tasks', name: 'AI 员工任务' },
] as const
const trendType = computed(() => trendOptions.find(item => item.id === route.query.trend) ?? trendOptions[0])
const trendMaximum = computed(() => Math.max(1, ...data.value.trend.map(item => item[trendType.value.id])))
const trendTotal = computed(() => data.value.trend.reduce((total, item) => total + item[trendType.value.id], 0))
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const shortcuts: { name: string; icon: typeof UsersRound; to: RouteLocationRaw }[] = [
  { name: '管理成员', icon: UsersRound, to: { name: 'admin-members' } },
  { name: '分配能力', icon: ShieldCheck, to: { name: 'admin-workbenches' } },
  { name: '系统接入', icon: Cpu, to: { name: 'admin-connections' } },
  { name: '新建 AI 员工', icon: Bot, to: { name: 'employee-management', query: { from: 'admin', create: '1' } } },
]

function filterBy(key: 'period' | 'department', value: string) {
  void router.replace({ query: { ...route.query, [key]: value || undefined, metric: undefined, record: undefined } })
}

function metricLocation(id: OverviewMetric, record?: string) {
  return { name: 'admin-overview', query: { ...route.query, metric: id, record } }
}

function detailLocation(row: OverviewDetailRow) {
  return row.facts && currentMetric.value ? metricLocation(currentMetric.value.id, row.id) : row.to
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? timeFormat.format(date) : '—'
}

function statusTone(status: string) {
  if (/异常|失败|受阻/.test(status)) return 'danger'
  if (/复核|退回|暂停|待/.test(status)) return 'warning'
  if (/完成|成功/.test(status)) return 'success'
  return 'primary'
}
</script>

<template>
  <section class="page-surface overview-page" aria-label="平台概览">
    <template v-if="organization.isAdmin">
      <header class="page-controls page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters">
          <el-select :model-value="period" aria-label="统计时间" class="period-filter" @update:model-value="filterBy('period', $event)">
            <el-option v-for="item in periods" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
          <el-select :model-value="departmentId" aria-label="统计部门" placeholder="全部部门" class="department-filter" @update:model-value="filterBy('department', $event)">
            <el-option value="" label="全部部门" />
            <el-option v-for="item in organization.departments" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </div>
        <div class="page-toolbar-controls">
          <span class="demo-mark">模拟数据</span>
          <time class="refresh-time" :datetime="overview.refreshedAt">更新于 {{ formatTime(overview.refreshedAt) }}</time>
          <el-button :icon="RefreshCw" @click="overview.refresh">刷新</el-button>
        </div>
      </header>

      <div class="page-body overview-body">
        <section class="metric-grid" aria-label="核心指标">
          <RouterLink v-for="metric in data.metrics" :key="metric.id" class="metric-card"
            :class="'metric-' + metric.id" :to="metricLocation(metric.id)" :aria-label="'查看' + metric.label + '明细'">
            <div class="metric-heading">
              <span class="metric-icon"><component :is="metricIcons[metric.id]" :size="17" aria-hidden="true" /></span>
              <span>{{ metric.label }}</span><ChevronRight :size="14" class="metric-arrow" aria-hidden="true" />
            </div>
            <strong class="metric-value">{{ metric.value }}</strong>
            <span class="metric-note">{{ metric.detail }}</span>
          </RouterLink>
        </section>

        <div class="overview-columns">
          <section class="panel dashboard-panel trend-panel" aria-labelledby="usage-trend-title">
            <header class="section-heading">
              <h2 id="usage-trend-title">使用趋势</h2>
              <span class="muted">{{ periods.find(item => item.value === period)?.label }}</span>
            </header>
            <div class="trend-toolbar">
              <div class="page-segments" role="group" aria-label="趋势类型">
                <button v-for="item in trendOptions" :key="item.id" class="page-segment" type="button"
                  :aria-pressed="trendType.id === item.id"
                  @click="router.replace({ query: { ...route.query, trend: item.id } })">{{ item.name }}</button>
              </div>
              <span class="trend-total">{{ trendTotal.toLocaleString('zh-CN') }} 次</span>
            </div>
            <div class="trend-chart" role="img" :aria-label="trendType.name + '趋势，共 ' + trendTotal + ' 次'">
              <div class="chart-grid" aria-hidden="true"><span /><span /><span /><span /></div>
              <div v-for="item in data.trend" :key="item.label" class="chart-column">
                <span class="chart-value">{{ item[trendType.id] }}</span>
                <div class="chart-bar-track">
                  <div class="chart-bar" :class="'series-' + trendType.id"
                    :style="{ height: item[trendType.id] / trendMaximum * 100 + '%' }"
                    :title="item.label + ' · ' + trendType.name + ' ' + item[trendType.id] + ' 次'" />
                </div>
                <span class="chart-label">{{ item.label }}</span>
              </div>
            </div>
          </section>

          <section class="panel dashboard-panel" aria-labelledby="management-pending-title">
            <header class="section-heading">
              <h2 id="management-pending-title">待管理事项 <span v-if="data.pending.length" class="count-badge">{{ data.pending.length }}</span></h2>
              <span class="scope-note">全组织当前状态</span>
            </header>
            <ul v-if="data.pending.length" class="pending-list">
              <li v-for="item in data.pending" :key="item.id">
                <RouterLink class="pending-link" :to="item.to">
                  <span class="issue-dot" :class="item.tone" aria-hidden="true" />
                  <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div>
                  <ChevronRight :size="14" aria-hidden="true" />
                </RouterLink>
              </li>
            </ul>
            <div v-else class="compact-empty"><Check :size="22" aria-hidden="true" /><p>当前没有待管理事项</p></div>
          </section>

          <section class="panel dashboard-panel recent-panel" aria-labelledby="recent-runs-title">
            <header class="section-heading">
              <h2 id="recent-runs-title">最近运行</h2>
              <RouterLink :to="metricLocation('tasks')" class="text-link">查看全部 <ArrowRight :size="14" aria-hidden="true" /></RouterLink>
            </header>
            <ul v-if="data.runs.length" class="run-list" aria-label="最近运行">
              <li v-for="item in data.runs.slice(0, 5)" :key="item.id">
                <RouterLink :to="item.to" class="run-link" :aria-label="'查看运行 ' + item.title">
                  <span class="run-icon"><Bot :size="17" aria-hidden="true" /></span>
                  <span class="run-copy"><strong>{{ item.title }}</strong><span>{{ item.employee }} · {{ item.origin }}</span></span>
                  <span class="run-trailing">
                    <span class="status-label" :class="statusTone(item.status)">{{ item.status }}</span>
                    <time :datetime="item.at">{{ formatTime(item.at) }}</time>
                  </span>
                  <ChevronRight :size="14" class="row-arrow" aria-hidden="true" />
                </RouterLink>
              </li>
            </ul>
            <div v-else class="compact-empty"><Clock3 :size="24" aria-hidden="true" /><p>该范围内暂无运行记录</p></div>
          </section>

          <section class="panel dashboard-panel" aria-labelledby="platform-health-title">
            <header class="section-heading">
              <h2 id="platform-health-title">平台状态</h2><span class="scope-note">全组织当前状态</span>
            </header>
            <ul class="health-list">
              <li v-for="item in data.health" :key="item.id">
                <component :is="item.to ? 'RouterLink' : 'div'" :to="item.to" class="health-row">
                  <div><strong>{{ item.name }}</strong><span>{{ item.detail }}</span></div>
                  <span class="health-status" :class="item.tone"><i aria-hidden="true" />{{ item.status }}</span>
                </component>
              </li>
            </ul>
          </section>
        </div>

        <section class="panel dashboard-panel" aria-labelledby="resource-summary-title">
          <header class="section-heading">
            <h2 id="resource-summary-title"><Boxes :size="17" aria-hidden="true" />能力与资源</h2><span class="scope-note">全组织当前状态</span>
          </header>
          <div class="asset-grid">
            <RouterLink v-for="item in data.assets" :key="item.id" class="asset-link" :to="item.to">
              <span>{{ item.name }}<ChevronRight :size="13" aria-hidden="true" /></span>
              <strong>{{ item.total }}</strong>
              <small>启用 {{ item.enabled }}<span v-if="item.issues"> · 异常 {{ item.issues }}</span></small>
            </RouterLink>
          </div>
        </section>

        <div class="overview-columns bottom-columns">
          <section class="panel dashboard-panel" aria-labelledby="recent-changes-title">
            <header class="section-heading">
              <h2 id="recent-changes-title">最近管理变更</h2>
              <RouterLink :to="{ name: 'admin-changes' }" class="text-link">查看全部 <ArrowRight :size="14" aria-hidden="true" /></RouterLink>
            </header>
            <ul v-if="data.changes.length" class="change-list">
              <li v-for="item in data.changes.slice(0, 3)" :key="item.id">
                <RouterLink :to="item.to">
                  <Activity :size="15" aria-hidden="true" />
                  <span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span>
                  <time :datetime="item.at">{{ formatTime(item.at) }}</time>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="muted">暂无管理变更</p>
          </section>
          <section class="panel dashboard-panel" aria-labelledby="overview-shortcuts-title">
            <header class="section-heading"><h2 id="overview-shortcuts-title">快捷操作</h2></header>
            <div class="shortcut-grid">
              <RouterLink v-for="item in shortcuts" :key="item.name" :to="item.to">
                <component :is="item.icon" :size="17" aria-hidden="true" /><span>{{ item.name }}</span><ChevronRight :size="13" aria-hidden="true" />
              </RouterLink>
            </div>
          </section>
        </div>
      </div>

      <ElDrawer v-model="drawerOpen" :title="currentRecord ? '运行详情' : (currentMetric?.label ?? '') + '明细'"
        size="min(580px, 100vw)" append-to-body destroy-on-close>
        <template v-if="currentMetric">
          <template v-if="currentRecord">
            <RouterLink class="text-link back-to-metric" :to="metricLocation(currentMetric.id)">返回{{ currentMetric.label }}明细</RouterLink>
            <h2 class="record-title">{{ currentRecord.title }}</h2>
            <p class="record-subtitle">{{ currentRecord.subtitle }}</p>
            <dl class="record-facts">
              <div v-for="fact in currentRecord.facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
            </dl>
            <RouterLink v-if="currentRecord.to" class="el-button" :to="currentRecord.to">查看管理对象</RouterLink>
          </template>
          <template v-else>
            <div class="detail-summary"><strong>{{ currentMetric.value }}</strong><span>{{ currentMetric.detail }}</span></div>
            <ul v-if="currentRows.length" class="metric-details" :aria-label="currentMetric.label + '明细'">
              <li v-for="row in currentRows" :key="row.id">
                <component :is="detailLocation(row) ? 'RouterLink' : 'div'" :to="detailLocation(row)" class="metric-detail-row">
                  <span><strong>{{ row.title }}</strong><small>{{ row.subtitle }}</small></span>
                  <span class="detail-value">{{ row.value }}<ChevronRight v-if="detailLocation(row)" :size="14" aria-hidden="true" /></span>
                </component>
              </li>
            </ul>
            <el-empty v-else description="该范围内暂无记录" :image-size="70" />
          </template>
          <p class="detail-data-note">使用与计量采用模拟数据，运行与管理对象按当前原型状态展示。</p>
        </template>
      </ElDrawer>
    </template>
    <el-empty v-else description="当前账号没有组织概览查看权限" />
  </section>
</template>

<style scoped>
.overview-page { container-type: inline-size; }
.period-filter { width: 128px; }
.department-filter { width: 160px; }
.demo-mark { padding: 3px 7px; border-radius: 5px; background: #eaf0fd; color: #5b70a5; font-size: 11px; white-space: nowrap; }
.refresh-time { color: var(--muted); font-size: 12px; }
.overview-body { display: grid; gap: 12px; }
.metric-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.metric-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.metric-card:hover { border-color: #bacbf6; background: #fafbff; }
.metric-heading { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
.metric-heading > span:nth-child(2) { flex: 1; min-width: 0; }
.metric-icon { display: grid; flex: none; place-items: center; width: 29px; height: 29px; border-radius: 8px; background: var(--soft); color: var(--accent); }
.metric-issues .metric-icon { color: #bd8030; background: #fff4e3; }
.metric-arrow { flex: none; margin-inline-start: auto; color: #9ca7ba; }
.metric-value { color: var(--text); font-size: clamp(23px, 2.6cqi, 31px); font-weight: 680; line-height: 1.2; font-variant-numeric: tabular-nums; }
.metric-note { margin-top: auto; color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.overview-columns { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.dashboard-panel { min-width: 0; padding: 14px; border-radius: 10px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; margin-bottom: 12px; }
.section-heading h2 { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--text); font-size: 14px; font-weight: 650; }
.section-heading > .muted, .scope-note { color: var(--muted); font-size: 11px; white-space: nowrap; }
.text-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; white-space: nowrap; }
.count-badge { min-width: 19px; padding: 1px 5px; border-radius: 5px; background: #fff2e1; color: #a96925; font-size: 11px; text-align: center; }
.trend-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.trend-total { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.trend-chart { position: relative; display: flex; align-items: stretch; gap: 10px; height: 188px; margin-top: 16px; }
.chart-grid { position: absolute; inset: 21px 0 22px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.chart-grid span { border-top: 1px dashed #e9edf4; }
.chart-column { position: relative; display: flex; flex: 1; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.chart-value, .chart-label { color: var(--muted); font-size: 10px; line-height: 1.3; white-space: nowrap; }
.chart-bar-track { display: flex; flex: 1; align-items: flex-end; justify-content: center; width: 100%; min-height: 0; }
.chart-bar { width: min(34px, 80%); border-radius: 5px 5px 0 0; background: #6486e9; }
.chart-bar.series-workbench { background: #8d7bc4; }
.chart-bar.series-tasks { background: #52a69a; }
.pending-list, .run-list, .health-list, .change-list, .metric-details { list-style: none; padding: 0; margin: 0; }
.pending-list { max-height: 254px; overflow-y: auto; scrollbar-width: thin; padding-inline: 2px; }
.pending-list li + li, .run-list li + li, .health-list li + li, .change-list li + li, .metric-details li + li { border-top: 1px solid #edf0f5; }
.pending-link { display: flex; align-items: flex-start; gap: 9px; padding: 11px 0; }
.pending-link div { flex: 1; min-width: 0; }
.pending-link strong, .run-copy strong, .health-row strong, .change-list strong { font-size: 13px; font-weight: 560; overflow-wrap: anywhere; }
.pending-link p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.pending-link > svg { flex: none; margin-top: 3px; color: var(--muted); }
.pending-link:hover strong, .run-link:hover strong, .change-list a:hover strong { color: var(--accent); }
.issue-dot { flex: none; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: #c08a40; }
.issue-dot.danger { background: #cd6b63; }
.run-link { display: flex; align-items: center; gap: 9px; padding: 11px 0; }
.run-icon { display: grid; flex: none; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--soft); color: #6175a3; }
.run-copy { display: grid; flex: 1; gap: 5px; min-width: 0; }
.run-copy > span { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.run-trailing { display: grid; flex: none; justify-items: end; gap: 5px; }
.run-trailing time, .change-list time { color: var(--muted); font-size: 10px; }
.row-arrow { flex: none; color: #98a3b5; }
.status-label { padding: 2px 6px; border-radius: 5px; background: #edf2fe; color: #4c70be; font-size: 11px; }
.status-label.success { color: #43836c; background: #ebf6f0; }
.status-label.warning { color: #a37433; background: #fcf3e4; }
.status-label.danger { color: #b8645c; background: #fff0ed; }
.health-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 0; }
.health-row > div { display: grid; gap: 4px; min-width: 0; }
.health-row > div > span { color: var(--muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.health-status { display: inline-flex; align-items: center; flex: none; gap: 5px; color: var(--muted); font-size: 11px; }
.health-status i { width: 6px; height: 6px; border-radius: 50%; background: #a7afbd; }
.health-status.success { color: #43836c; }
.health-status.success i { background: #58a58b; }
.health-status.warning { color: #aa7c38; }
.health-status.warning i { background: #c5964b; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
.asset-link { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
.asset-link > span { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 12px; }
.asset-link > strong { font-size: 22px; font-weight: 650; }
.asset-link > small { color: var(--muted); font-size: 10px; }
.asset-link:hover { border-color: #c1d0f4; background: #fafbff; }
.asset-link small > span { color: #ad7832; }
.change-list a { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
.change-list svg { flex: none; color: #8a9ab7; }
.change-list a > span { display: grid; flex: 1; gap: 4px; min-width: 0; }
.change-list small { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.change-list time { flex: none; }
.shortcut-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.shortcut-grid a { display: flex; align-items: center; gap: 7px; min-height: 40px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; color: #566885; font-size: 12px; }
.shortcut-grid a > svg { flex: none; }
.shortcut-grid a > svg:last-child { margin-inline-start: auto; color: #99a4b6; }
.shortcut-grid a:hover { color: var(--accent); background: var(--soft); }
.compact-empty { display: grid; justify-items: center; gap: 9px; padding: 30px 0; color: var(--muted); }
.compact-empty p { margin: 0; font-size: 12px; }
.detail-summary { display: grid; gap: 8px; padding: 12px 0 20px; }
.detail-summary strong { font-size: 30px; font-weight: 650; }
.detail-summary span, .record-subtitle { color: var(--muted); font-size: 13px; line-height: 1.6; }
.metric-detail-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 2px; }
.metric-detail-row > span:first-child { display: grid; gap: 5px; min-width: 0; }
.metric-detail-row strong { font-size: 14px; font-weight: 550; overflow-wrap: anywhere; }
.metric-detail-row small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.detail-value { display: inline-flex; align-items: center; flex: none; gap: 6px; font-size: 13px; white-space: nowrap; }
a.metric-detail-row:hover { color: var(--accent); }
.detail-data-note { margin: 20px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.6; }
.record-title { margin: 20px 0 8px; font-size: 19px; font-weight: 650; }
.record-facts { display: grid; gap: 0; margin: 18px 0; }
.record-facts div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.7; }
.record-facts dt { color: var(--muted); }
.record-facts dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
@container (max-width: 1000px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (max-width: 740px) {
  .overview-columns { grid-template-columns: minmax(0, 1fr); }
  .refresh-time { display: none; }
}
@container (max-width: 420px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .department-filter { width: 126px; }
  .period-filter { width: 112px; }
  .dashboard-panel { padding: 11px; }
  .metric-heading { gap: 5px; font-size: 11px; }
  .metric-icon { width: 24px; height: 26px; }
  .metric-arrow { display: none; }
  .chart-label { font-size: 9px; }
  .trend-chart { gap: 5px; }
  .change-list a { flex-wrap: wrap; }
  .change-list time { margin-inline-start: 23px; }
  .run-trailing { max-width: 80px; }
  .row-arrow { display: none; }
}
</style>
