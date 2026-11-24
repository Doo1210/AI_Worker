import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteLocationRaw } from 'vue-router'
import { adminCapabilityLink, catalogForType } from '@/adminCatalogs'
import { useOrganizationAdminStore } from './organizationAdmin'
import { usePlatformStore } from './platform'
import { scenarioStatusLabels, useScenarioTaskStore, type ScenarioTaskStatus } from './scenarioTasks'

export type OverviewPeriod = '24h' | '7d' | '30d'
export type OverviewMetric = 'members' | 'assistant' | 'tasks' | 'issues' | 'tokens' | 'cost'

export interface OverviewDetailRow {
  id: string
  title: string
  subtitle: string
  value: string
  to?: RouteLocationRaw
  facts?: { label: string; value: string }[]
}

export interface OverviewSnapshot {
  metrics: { id: OverviewMetric; label: string; value: string; detail: string }[]
  details: Record<OverviewMetric, OverviewDetailRow[]>
  trend: { label: string; assistant: number; workbench: number; tasks: number }[]
  pending: { id: string; title: string; detail: string; tone: 'danger' | 'warning'; to: RouteLocationRaw }[]
  runs: { id: string; title: string; employee: string; origin: string; status: string; at: string; to: RouteLocationRaw }[]
  assets: { id: string; name: string; total: number; enabled: number; issues: number; to: RouteLocationRaw }[]
  health: { id: string; name: string; status: string; tone: 'success' | 'warning' | 'info'; detail: string; to?: RouteLocationRaw }[]
  changes: { id: string; title: string; detail: string; at: string; to: RouteLocationRaw }[]
}

interface UsageRecord {
  id: string
  userId: string
  at: number
  kind: 'assistant' | 'workbench'
  targetId: string
  inputTokens: number
  outputTokens: number
  priced: boolean
}

interface OverviewTask {
  id: string
  title: string
  objectId: string
  employeeId: string
  initiatorId: string
  assigneeId: string
  origin: string
  status: ScenarioTaskStatus
  createdAt: string
  updatedAt: string
  simulated?: boolean
}

const day = 86_400_000
const integer = new Intl.NumberFormat('zh-CN')
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 4, maximumFractionDigits: 4 })
const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })
const clockLabel = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', hourCycle: 'h23' })
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
const periodDays: Record<OverviewPeriod, number> = { '24h': 1, '7d': 7, '30d': 30 }
const assetTypes = ['组织助理', '工作台', 'AI 员工', '模型', '技能', 'MCP', '知识', '工具'] as const

export const useAdminOverviewStore = defineStore('admin-overview', () => {
  const platform = usePlatformStore()
  const organization = useOrganizationAdminStore()
  const runtime = useScenarioTaskStore()
  const refreshedAt = ref(new Date().toISOString())
  const sampleTime = Date.now()
  const usage: UsageRecord[] = []
  const sampleUsers = platform.users.filter(user => user.status !== 'disabled').slice(0, 3)
  const sampleAssistants = platform.assistants.filter(assistant => assistant.scope === 'organization')
  const sampleWorkbenches = platform.workbenches.filter(workbench => workbench.status === 'active')
  const taskSamples: OverviewTask[] = []
  const sampleEmployees = platform.employees.filter(employee => employee.status === 'published')

  // One stable sample ledger drives both summary cards and their detail rows.
  for (let daysAgo = 0; daysAgo < 30; daysAgo += 1) {
    for (const [memberIndex, member] of sampleUsers.entries()) {
      const dailyRequests = 2 + (daysAgo + memberIndex) % 4
      for (let slot = 0; slot < dailyRequests; slot += 1) {
        const kind = slot % 3 === 2 ? 'workbench' : 'assistant'
        const target = kind === 'assistant'
          ? sampleAssistants[(daysAgo + memberIndex + slot) % sampleAssistants.length]
          : sampleWorkbenches[(daysAgo + memberIndex) % sampleWorkbenches.length]
        if (!target) continue
        usage.push({
          id: `usage-${daysAgo}-${member.id}-${slot}`, userId: member.id,
          at: sampleTime - daysAgo * day - (memberIndex * 90 + slot * 25 + 15) * 60_000,
          kind, targetId: target.id, inputTokens: 2400 + (daysAgo % 5) * 280 + memberIndex * 160,
          outputTokens: 600 + slot * 110, priced: (daysAgo + memberIndex + slot) % 7 !== 0,
        })
      }
    }
    if (daysAgo < 7 || daysAgo % 5 === 0) {
      for (const [index, employee] of sampleEmployees.entries()) {
        const owner = sampleUsers[index % sampleUsers.length]
        if (!owner) continue
        const createdAt = new Date(sampleTime - daysAgo * day - (index * 70 + 20) * 60_000).toISOString()
        taskSamples.push({
          id: `overview-run-${daysAgo}-${employee.id}`, title: ['例行资料核对', '交付清单检查', '会议行动项整理'][index % 3]!,
          objectId: `DEMO-${String(daysAgo * 3 + index + 1).padStart(3, '0')}`,
          employeeId: employee.id, initiatorId: owner.id, assigneeId: owner.id, origin: ['人员交办', '业务事件', '定时规则'][index % 3]!,
          status: daysAgo === 0 ? (['completed', 'blocked', 'review'] as const)[index % 3]! : 'completed',
          createdAt, updatedAt: createdAt, simulated: true,
        })
      }
    }
  }

  function refresh() {
    refreshedAt.value = new Date().toISOString()
  }

  function snapshot(period: OverviewPeriod, departmentId: string): OverviewSnapshot {
    const end = Date.parse(refreshedAt.value)
    const start = end - periodDays[period] * day
    const users = new Map(platform.users.map(user => [user.id, user]))
    const employees = new Map(platform.employees.map(employee => [employee.id, employee]))
    const capabilities = organization.capabilities
    const capabilityMap = new Map(capabilities.map(capability => [capability.id, capability]))
    const memberInScope = (id: string) => !!users.get(id) && (!departmentId || users.get(id)?.departmentId === departmentId)
    const inPeriod = (at: number) => at >= start && at <= end
    const records = organization.isAdmin ? usage.filter(record =>
      memberInScope(record.userId) && inPeriod(record.at) && capabilityMap.has(record.targetId)) : []
    const sampleTasks = organization.isAdmin ? taskSamples.filter(task => employees.has(task.employeeId)) : []
    const allTasks: OverviewTask[] = [...sampleTasks, ...runtime.adminTasks]
    const tasks = allTasks.filter(task => inPeriod(Date.parse(task.createdAt))
      && (!departmentId || memberInScope(task.initiatorId)))
    const activeMemberIds = new Set([
      ...records.map(record => record.userId),
      ...tasks.map(task => task.initiatorId).filter(id => users.has(id)),
    ])
    const assistantRecords = records.filter(record => record.kind === 'assistant')
    const tokens = records.reduce((total, record) => total + record.inputTokens + record.outputTokens, 0)
    const unpriced = records.filter(record => !record.priced)
    const estimatedCost = (record: UsageRecord) => record.priced
      ? (record.inputTokens * 2 + record.outputTokens * 3) / 1_000_000 : 0
    const cost = records.reduce((total, record) => total + estimatedCost(record), 0)
    const issueConnections = organization.isAdmin ? organization.connections.filter(connection => connection.status === '待检测') : []
    const blocked = allTasks.filter(task => task.status === 'blocked')
    const unavailable = capabilities.filter(capability => capability.enabled && !capability.ready)
    const taskLocation = (id: string): RouteLocationRaw => ({ name: 'admin-scenario-runs', query: { task: id } })
    const overviewTaskLocation = (task: OverviewTask, metric: OverviewMetric = 'tasks'): RouteLocationRaw => task.simulated
      ? { name: 'admin-overview', query: { period, department: departmentId || undefined, metric, record: task.id } }
      : taskLocation(task.id)
    const taskFacts = (task: OverviewTask) => [
      { label: 'AI 员工', value: employees.get(task.employeeId)?.name ?? task.employeeId },
      { label: '任务编号', value: task.id },
      { label: '业务对象', value: task.objectId },
      { label: '发起方式', value: task.origin },
      { label: '当前状态', value: scenarioStatusLabels[task.status] },
      { label: '发起人', value: users.get(task.initiatorId)?.name ?? '未分配' },
      { label: '接手人', value: users.get(task.assigneeId)?.name ?? '未分配' },
      { label: '发起时间', value: dateTime.format(new Date(task.createdAt)) },
      { label: '记录来源', value: task.simulated ? '概览演示记录' : '场景任务运行记录' },
    ]
    const taskDetails = tasks.map(task => ({
      id: task.id, title: `${task.objectId} · ${task.title}`,
      subtitle: `${employees.get(task.employeeId)?.name ?? task.employeeId} · ${task.origin}`,
      value: scenarioStatusLabels[task.status],
      to: task.simulated ? undefined : taskLocation(task.id),
      facts: taskFacts(task),
    }))
    const issueDetails: OverviewDetailRow[] = [
      ...blocked.map(task => ({
        id: task.id, title: `${task.objectId} · ${task.title}`, subtitle: 'AI 员工任务受阻',
        value: '执行异常', to: overviewTaskLocation(task, 'issues'), facts: taskFacts(task),
      })),
      ...issueConnections.map(connection => ({
        id: connection.id, title: connection.name, subtitle: '连接尚待模拟检测',
        value: connection.status, to: { name: 'admin-connections', params: { id: connection.id } },
      })),
      ...unavailable.map(capability => ({
        id: capability.id, title: capability.name, subtitle: `${capability.type}已启用，依赖尚未就绪`,
        value: '依赖未就绪', to: adminCapabilityLink(capability),
      })),
    ]
    const memberDetails = [...activeMemberIds].map(id => {
      const member = users.get(id)!
      const count = records.filter(record => record.userId === id).length + tasks.filter(task => task.initiatorId === id).length
      return {
        id, title: member.name, subtitle: member.department, value: `${integer.format(count)} 次使用`,
        to: { name: 'admin-members', params: { id } },
      }
    })
    const assistantDetails = [...new Set(assistantRecords.map(record => record.targetId))].map(id => {
      const assistant = capabilityMap.get(id)!
      const matching = assistantRecords.filter(record => record.targetId === id)
      return {
        id, title: assistant.name, subtitle: `${new Set(matching.map(record => record.userId)).size} 位成员使用`,
        value: `${integer.format(matching.length)} 次`, to: adminCapabilityLink(assistant),
      }
    })
    const model = capabilities.find(capability => capability.type === '模型')
    const modelLocation = model ? adminCapabilityLink(model) : { name: 'admin-resources', query: { type: '模型' } }
    const tokenDetails: OverviewDetailRow[] = [
      { id: 'input', title: '输入 Token', subtitle: '所选范围内的模拟模型请求', value: integer.format(records.reduce((total, record) => total + record.inputTokens, 0)), to: modelLocation },
      { id: 'output', title: '输出 Token', subtitle: '所选范围内的模拟模型请求', value: integer.format(records.reduce((total, record) => total + record.outputTokens, 0)), to: modelLocation },
    ]
    const costDetails: OverviewDetailRow[] = [
      { id: 'priced', title: '已计价请求', subtitle: `${records.length - unpriced.length} 次 · 示例单价输入 ¥2 / 百万 Token，输出 ¥3 / 百万 Token`, value: currency.format(cost), to: modelLocation },
      { id: 'unpriced', title: '未计价请求', subtitle: `${integer.format(unpriced.reduce((total, record) => total + record.inputTokens + record.outputTokens, 0))} Token，费用待配置单价`, value: `${unpriced.length} 次`, to: modelLocation },
    ]
    const bucketCount = period === '7d' ? 7 : 6
    const bucketSize = (end - start) / bucketCount
    const trend = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = start + index * bucketSize
      const bucketEnd = bucketStart + bucketSize
      const belongs = (at: number) => at >= bucketStart && (index === bucketCount - 1 ? at <= bucketEnd : at < bucketEnd)
      return {
        label: period === '24h' ? clockLabel.format(bucketEnd) : dateLabel.format(bucketEnd),
        assistant: records.filter(record => record.kind === 'assistant' && belongs(record.at)).length,
        workbench: records.filter(record => record.kind === 'workbench' && belongs(record.at)).length,
        tasks: tasks.filter(task => belongs(Date.parse(task.createdAt))).length,
      }
    })

    const pending: OverviewSnapshot['pending'] = issueDetails.map(issue => ({
      id: issue.id, title: issue.title, detail: issue.subtitle,
      tone: blocked.some(task => task.id === issue.id) ? 'danger' : 'warning', to: issue.to!,
    }))
    for (const capability of capabilities) {
      const latestVersion = capability.availableVersions.at(-1)
      if (!latestVersion || latestVersion === capability.version) continue
      pending.push({
        id: 'version-' + capability.id, title: `${capability.name}有可切换版本`,
        detail: `当前 ${capability.version ? 'v' + capability.version : '尚无生效版本'} · 可用 v${latestVersion}`,
        tone: 'warning', to: adminCapabilityLink(capability),
      })
    }
    const assets = assetTypes.map(type => {
      const matching = capabilities.filter(capability => capability.type === type)
      return {
        id: type, name: type, total: matching.length,
        enabled: matching.filter(capability => capability.enabled).length,
        issues: matching.filter(capability => capability.enabled && !capability.ready).length,
        to: { name: catalogForType(type), query: { type } },
      }
    })
    const health: OverviewSnapshot['health'] = organization.connections.map(connection => ({
      id: connection.id, name: connection.name, status: connection.status === '正常' ? '正常（模拟）' : connection.status,
      tone: connection.status === '正常' ? 'success' : connection.status === '待检测' ? 'warning' : 'info',
      detail: connection.lastCheckedAt ? `上次模拟检测 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(connection.lastCheckedAt))}` : '尚无检测记录',
      to: { name: 'admin-connections', params: { id: connection.id } },
    }))
    health.push(
      { id: 'executor', name: '执行服务', status: '未接入监测', tone: 'info', detail: '并发与队列监测待接入' },
      { id: 'schedule', name: '调度服务', status: '未接入监测', tone: 'info', detail: '后台调度监测待接入' },
    )

    return {
      metrics: [
        { id: 'members', label: '活跃成员', value: integer.format(activeMemberIds.size), detail: '有助理、工作台或任务活动的成员' },
        { id: 'assistant', label: '助理请求', value: integer.format(assistantRecords.length), detail: '按成员提交次数统计' },
        { id: 'tasks', label: 'AI 员工任务', value: integer.format(tasks.length), detail: '所选周期受理的场景任务' },
        { id: 'issues', label: '运行需关注', value: integer.format(issueDetails.length), detail: '全组织当前任务、连接与依赖' },
        { id: 'tokens', label: 'Token 用量', value: integer.format(tokens), detail: '输入与输出 Token 合计' },
        { id: 'cost', label: '估算费用', value: currency.format(cost), detail: `${unpriced.length} 次请求尚未计价` },
      ],
      details: { members: memberDetails, assistant: assistantDetails, tasks: taskDetails, issues: issueDetails, tokens: tokenDetails, cost: costDetails },
      trend, pending,
      runs: [...tasks].sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt)).map(task => ({
        id: task.id, title: `${task.objectId} · ${task.title}`,
        employee: employees.get(task.employeeId)?.name ?? task.employeeId, origin: task.origin,
        status: scenarioStatusLabels[task.status], at: task.updatedAt, to: overviewTaskLocation(task),
      })),
      assets, health,
      changes: [...organization.changes].sort((first, second) => Date.parse(second.at) - Date.parse(first.at)).slice(0, 5).map(change => ({
        id: change.id, title: `${change.action} · ${change.target}`, detail: `${change.actor} · ${change.after}`,
        at: change.at, to: { name: 'admin-changes', query: { target: change.target } },
      })),
    }
  }

  return { snapshot, refreshedAt, refresh }
})
