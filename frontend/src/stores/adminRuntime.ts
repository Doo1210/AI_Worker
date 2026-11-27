import { computed } from 'vue'
import { defineStore } from 'pinia'
import { usePlatformStore } from './platform'
import { useOrganizationAdminStore } from './organizationAdmin'
import { filterUsage, usageCost, useAdminUsageStore } from './adminUsage'

export const useAdminRuntimeStore = defineStore('admin-runtime', () => {
  const platform = usePlatformStore()
  const organization = useOrganizationAdminStore()
  const usage = useAdminUsageStore()
  usage.seed(platform.users, platform.assistants.filter(item => item.scope === 'organization'), platform.workbenches.filter(item => item.status === 'active'), platform.resources.find(item => item.type === '模型' && item.scope === 'organization')?.id)
  const records = computed(() => organization.canViewRuns ? usage.records.filter(item => organization.capabilities.some(capability => capability.id === item.targetId)) : [])
  const memberName = (id: string) => platform.users.find(item => item.id === id)?.name ?? '成员已移除'
  const capabilityName = (id?: string) => organization.capabilities.find(item => item.id === id)?.name ?? (id ? '能力已移除' : '未使用模型')
  const inScope = (filters: Parameters<typeof filterUsage>[1], end?: number) => filterUsage(records.value, filters, platform.users, end)
  const totals = (rows: typeof records.value) => ({
    count: rows.length, members: new Set(rows.map(item => item.userId)).size,
    failed: rows.filter(item => item.status === '失败').length,
    tokens: rows.reduce((total, item) => total + item.inputTokens + item.outputTokens, 0),
    cost: rows.reduce((total, item) => total + usageCost(item), 0),
    unpriced: rows.filter(item => (item.modelId || item.kind === 'assistant') && !item.priced).length,
  })
  return { records, memberName, capabilityName, inScope, totals }
})
