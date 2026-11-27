import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteLocationRaw } from 'vue-router'
import { adminCapabilityLink } from '@/adminCatalogs'
import { pluginIssues } from '@/adminDependencies'
import { useOrganizationAdminStore } from './organizationAdmin'
import { usePlatformStore } from './platform'
import { useAdminRuntimeStore } from './adminRuntime'
import { usageCost } from './adminUsage'
import { useScenarioTaskStore } from './scenarioTasks'

export type OverviewPeriod = '24h' | '7d' | '30d'
export type OverviewMetric = 'members' | 'assistant' | 'workbench' | 'tasks' | 'issues' | 'failures' | 'tokens' | 'cost'
export interface OverviewDetailRow {
  id: string; title: string; subtitle: string; value: string; to?: RouteLocationRaw
  facts?: { label: string; value: string }[]
  related?: { id: string; title: string; to: RouteLocationRaw }[]
  severity?: 'danger' | 'warning'
}
export interface OverviewSnapshot {
  metrics: { id: OverviewMetric; label: string; value: string; detail: string }[]
  details: Record<OverviewMetric, OverviewDetailRow[]>
  trend: { label: string; assistant: number; workbench: number; tasks: number }[]
  runs: { id: string; title: string; employee: string; origin: string; status: string; at: string; to: RouteLocationRaw }[]
}
const integer = (value: number) => value.toLocaleString('zh-CN')
const currency = (value: number) => '¥' + value.toFixed(4)
export const useAdminOverviewStore = defineStore('admin-overview', () => {
  const platform = usePlatformStore()
  const organization = useOrganizationAdminStore()
  const runtime = useAdminRuntimeStore()
  const tasks = useScenarioTaskStore()
  const refreshedAt = ref(new Date().toISOString())
  function refresh() { refreshedAt.value = new Date().toISOString() }
  function snapshot(period: OverviewPeriod, departmentId: string): OverviewSnapshot {
    const end = Math.max(Date.now(), Date.parse(refreshedAt.value))
    const start = end - ({ '24h': 1, '7d': 7, '30d': 30 }[period]) * 86_400_000
    const filters = { period, department: departmentId || undefined }
    const records = runtime.inScope(filters, end)
    const totals = runtime.totals(records)
    const capabilities = organization.capabilities.filter(item => item.type !== 'AI 员工')
    const activityLocation = (extra = {}): RouteLocationRaw => ({ name: 'admin-activity', query: { ...filters, ...extra } })
    const usageLocation = (): RouteLocationRaw => ({ name: 'admin-usage', query: filters })
    const issueDetails: OverviewDetailRow[] = []
    const covered = new Set<string>()
    const related = (items: typeof capabilities) => items.filter(item => item.type !== 'AI 员工')
      .map(item => ({ id: item.id, title: item.name, to: adminCapabilityLink(item) }))
    for (const item of organization.connections) {
      const affected = organization.affectedByConnection(item.id).filter(capability => capability.enabled && capability.type !== 'AI 员工')
      if (item.status === '正常' || item.status === '已停用' && !affected.length) continue
      affected.forEach(capability => covered.add(capability.id))
      issueDetails.push({ id: item.id, title: item.name, subtitle: item.lastError ?? (item.status === '待检测' ? '尚未确认连通性，可在接入准备时检测。' : '连接已停用，相关能力当前无法调用。'), value: item.status === '待检测' ? '接入待检测' : '连接异常', severity: item.status === '待检测' ? 'warning' : 'danger',
        to: organization.canManagePlatform ? { name: 'admin-connections', params: { id: item.id }, query: { returnTo: '/admin/overview' } } : undefined,
        related: related(affected), facts: [{ label: '连接类型', value: item.type }, { label: '当前状态', value: item.status }, { label: '处置分工', value: '平台运维人员检查连接；恢复后由业务成员重新发起原操作。' }] })
    }
    for (const item of organization.plugins) {
      const affected = organization.affectedByPlugin(item.id).filter(capability => capability.enabled && capability.type !== 'AI 员工')
      // An unavailable parent plugin is the root issue; its affected abilities include child plugins.
      if (item.dependencyIds.some(id => pluginIssues(id, organization.plugins).length)) continue
      if (item.enabled && item.loadStatus === '已加载' || !item.enabled && !affected.length) continue
      affected.forEach(capability => covered.add(capability.id))
      issueDetails.push({ id: item.id, title: item.name, subtitle: pluginIssues(item.id, organization.plugins).join('；'), value: item.loadStatus === '未加载' && item.enabled ? '插件待检查' : '插件异常', severity: item.loadStatus === '未加载' && item.enabled ? 'warning' : 'danger',
        to: organization.canManagePlatform ? { name: 'admin-plugins', params: { id: item.id } } : undefined, related: related(affected),
        facts: [{ label: '启用版本', value: item.version }, { label: '加载状态', value: item.enabled ? item.loadStatus : '已停用' }, { label: '处置分工', value: '平台运维人员检查插件及其依赖，确认加载通过。' }] })
    }
    for (const item of capabilities.filter(item => !item.enabled && ['模型', 'MCP', '技能', '知识', '工具'].includes(item.type))) {
      const affected = organization.affectedByCapability(item.id).filter(capability => capability.id !== item.id && capability.enabled && capability.type !== 'AI 员工')
      if (!affected.length) continue
      affected.forEach(capability => covered.add(capability.id))
      issueDetails.push({ id: item.id, title: item.name, subtitle: '该资源当前不可用，启用中的能力仍在引用。请核对资源状态与依赖配置。', value: '资源不可用', severity: 'danger', to: adminCapabilityLink(item), related: related(affected) })
    }
    for (const item of capabilities.filter(item => item.enabled && !item.ready && !covered.has(item.id))) {
      issueDetails.push({ id: item.id, title: item.name, subtitle: item.issues.join('；') || '尚无已发布版本', value: '能力未就绪', severity: 'warning', to: adminCapabilityLink(item) })
    }
    issueDetails.sort((a, b) => Number(b.severity === 'danger') - Number(a.severity === 'danger'))
    const byKind = (kind: 'assistant' | 'workbench'): OverviewDetailRow[] => [...new Set(records.filter(item => item.kind === kind).map(item => item.targetId))].map(id => {
      const matching = records.filter(item => item.kind === kind && item.targetId === id)
      return { id, title: runtime.capabilityName(id), subtitle: `${new Set(matching.map(item => item.userId)).size} 位成员 · ${matching.filter(item => item.status === '失败').length} 次失败`, value: `${matching.length} 次`, to: activityLocation({ target: id, kind }) }
    })
    const members: OverviewDetailRow[] = [...new Set(records.map(item => item.userId))].map(id => ({ id, title: runtime.memberName(id), subtitle: platform.users.find(item => item.id === id)?.department ?? '', value: `${records.filter(item => item.userId === id).length} 次使用`, to: activityLocation({ q: runtime.memberName(id) }) }))
    const bucketCount = period === '7d' ? 7 : 6
    const bucketSize = (end - start) / bucketCount
    const trend = Array.from({ length: bucketCount }, (_, index) => {
      const left = start + index * bucketSize, right = left + bucketSize
      const bucket = records.filter(item => item.at >= left && (index === bucketCount - 1 ? item.at <= right : item.at < right))
      return { label: new Date(right).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', ...(period === '24h' ? { hour: '2-digit' } : {}) }), assistant: bucket.filter(item => item.kind === 'assistant').length, workbench: bucket.filter(item => item.kind === 'workbench').length, tasks: tasks.adminTasks.filter(item => Date.parse(item.createdAt) >= left && Date.parse(item.createdAt) < right).length }
    })
    return {
      metrics: [
        { id: 'members', label: '活跃成员', value: integer(totals.members), detail: '有助理或工作台活动的成员' },
        { id: 'assistant', label: '助理请求', value: integer(records.filter(item => item.kind === 'assistant').length), detail: '所选范围内的请求记录' },
        { id: 'workbench', label: '工作台操作', value: integer(records.filter(item => item.kind === 'workbench').length), detail: `${new Set(records.filter(item => item.kind === 'workbench').map(item => item.userId)).size} 位成员 · 访问与关键操作` },
        { id: 'failures', label: '执行失败', value: integer(totals.failed), detail: '所选范围内的历史失败记录' },
        { id: 'tokens', label: 'Token 用量', value: integer(totals.tokens), detail: '输入与输出 Token 合计' },
        { id: 'cost', label: '估算费用', value: currency(totals.cost), detail: `${totals.unpriced} 次请求尚未计价` },
      ],
      details: { members, assistant: byKind('assistant'), workbench: byKind('workbench'), tasks: [], issues: issueDetails,
        failures: records.filter(item => item.status === '失败').map(item => ({ id: item.id, title: `${runtime.capabilityName(item.targetId)} · ${item.operation}`, subtitle: `${runtime.memberName(item.userId)} · ${item.note ?? '执行失败'}`, value: '失败', to: activityLocation({ record: item.id }) })),
        tokens: [{ id: 'input', title: '输入 Token', subtitle: '同一运行记录汇总', value: integer(records.reduce((sum, item) => sum + item.inputTokens, 0)), to: usageLocation() }, { id: 'output', title: '输出 Token', subtitle: '同一运行记录汇总', value: integer(records.reduce((sum, item) => sum + item.outputTokens, 0)), to: usageLocation() }],
        cost: [{ id: 'priced', title: '已计价请求', subtitle: '示例单价：输入 ¥2、输出 ¥3／百万 Token', value: currency(records.reduce((sum, item) => sum + usageCost(item), 0)), to: usageLocation() }, { id: 'unpriced', title: '未计价请求', subtitle: '费用及真实计量待接入', value: `${totals.unpriced} 次`, to: usageLocation() }] },
      trend,
      runs: [...records].sort((a, b) => b.at - a.at).map(item => ({ id: item.id, title: `${runtime.capabilityName(item.targetId)} · ${item.operation}`, employee: runtime.memberName(item.userId), origin: item.kind === 'assistant' ? '助理' : '工作台', status: item.status, at: new Date(item.at).toISOString(), to: activityLocation({ record: item.id }) })),
    }
  }
  return { snapshot, refreshedAt, refresh }
})
