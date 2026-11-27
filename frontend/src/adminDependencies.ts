import type { PlatformState } from '@/stores/platform'
import { activeConfiguration, activeCapabilityVersion, capabilityConnectionId, connectionIsReady, type AdminConnection, type AdminPlugin } from '@/stores/organizationAdminData'

export interface CapabilityNode {
  id: string
  name: string
  enabled: boolean
  dependencies: string[]
  connectionId?: string
  connectionMissing?: boolean
}

export function capabilityNodes(state: Pick<PlatformState, 'assistants' | 'employees' | 'workbenches' | 'resources'>): CapabilityNode[] {
  return [
    ...state.assistants.filter(item => item.scope === 'organization').map(item => ({ ...activeConfiguration(item), enabled: item.enabled !== false, dependencies: activeConfiguration(item).resourceIds })),
    ...state.employees.map(item => ({ ...activeConfiguration(item), enabled: item.status === 'published', dependencies: activeConfiguration(item).resourceIds })),
    ...state.workbenches.map(item => ({ ...item, versionSnapshots: undefined, enabled: item.status === 'active', dependencies: item.dependencyIds ?? [] })),
    ...state.resources.filter(item => item.scope === 'organization').map(item => ({ ...item, enabled: item.status === '可用', dependencies: item.versionSnapshots?.[activeCapabilityVersion(item) ?? '']?.resourceIds ?? item.dependencyIds ?? [] })),
  ].map(item => ({ id: item.id, name: item.versionSnapshots?.[activeCapabilityVersion(item) ?? '']?.name ?? item.name, enabled: item.enabled, dependencies: item.dependencies,
    connectionId: capabilityConnectionId(item), connectionMissing: item.connectionId === null && 'type' in item && ['模型', 'MCP'].includes(String(item.type)) }))
}

export function pluginIssues(id: string, plugins: AdminPlugin[], path = new Set<string>()): string[] {
  const item = plugins.find(plugin => plugin.id === id)
  if (!item) return ['依赖插件不存在']
  if (path.has(id)) return [`${item.name}存在循环依赖`]
  if (!item.enabled) return [`${item.name}已停用`]
  if (item.loadStatus !== '已加载') return [`${item.name}${item.loadStatus}：${item.lastError ?? '请检查加载结果'}`]
  const next = new Set(path).add(id)
  return item.dependencyIds.flatMap(dependency => pluginIssues(dependency, plugins, next))
}

export function connectionCredentialLabel(connection: AdminConnection, memberId?: string) {
  if (connection.credentialMode === 'none') return '无需凭据'
  if (!connection.credentialMode || connection.credentialMode === 'environment') return '使用环境变量回退（演示）'
  if (connection.credentialMode === 'member') return memberId
    ? connection.memberCredentialRefs?.[memberId] ? '已绑定本人凭据（演示）' : '本人凭据缺失，调用将失败'
    : `${Object.keys(connection.memberCredentialRefs ?? {}).length} 位成员已绑定凭据（演示）`
  return connection.credentialRef ? '已配置凭据（演示）' : '凭据缺失，调用将失败'
}

export function dependencyIssues(id: string, nodes: CapabilityNode[], connections: AdminConnection[], plugins: AdminPlugin[], memberId?: string, path = new Set<string>(), checkEnabled = false): string[] {
  const node = nodes.find(item => item.id === id)
  if (!node) return ['依赖能力不存在']
  if (path.has(id)) return [`${node.name}存在循环依赖`]
  const issues: string[] = []
  if (checkEnabled && !node.enabled) issues.push(`${node.name}已停用`)
  if (node.connectionMissing) issues.push(`${node.name}尚未关联连接`)
  if (node.connectionId) {
    const connection = connections.find(item => item.id === node.connectionId)
    if (!connectionIsReady(node.connectionId, connections)) issues.push(`${connection?.name ?? '依赖连接'}${connection?.status ?? '不存在'}`)
    if (connection?.credentialMode === 'organization' && !connection.credentialRef) issues.push(`${connection.name}凭据缺失`)
    if (connection?.credentialMode === 'member' && memberId && !connection.memberCredentialRefs?.[memberId]) issues.push(`${connection.name}缺少本人凭据`)
  }
  for (const plugin of plugins.filter(item => item.capabilityIds.includes(id))) issues.push(...pluginIssues(plugin.id, plugins))
  const next = new Set(path).add(id)
  for (const dependency of node.dependencies) issues.push(...dependencyIssues(dependency, nodes, connections, plugins, memberId, next, true))
  return [...new Set(issues)]
}
