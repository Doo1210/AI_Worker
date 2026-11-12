export interface OrganizationCapabilityFields {
  maintainerId?: string
  publisherIds?: string[]
  activeVersion?: string
  availableVersions?: string[]
  connectionId?: string | null
  versionSnapshots?: Record<string, CapabilityConfiguration>
}

interface CapabilityConfiguration {
  name: string
  description: string
  instructions: string
  resourceIds: string[]
  role?: string
}

type ConfigurableCapability = OrganizationCapabilityFields & CapabilityConfiguration

const sampleUpdates = new Set(['assistant-org-documents', 'employee-design', 'workbench-design', 'model-deepseek', 'skill-summary', 'mcp-files'])

export function capabilityVersions(item: OrganizationCapabilityFields & { id: string }, isDraft = false) {
  if (item.availableVersions !== undefined) return item.availableVersions
  if (isDraft) return []
  return sampleUpdates.has(item.id) ? ['1.0.0', '1.1.0'] : ['1.0.0']
}

export function activeCapabilityVersion(item: OrganizationCapabilityFields & { id: string }, isDraft = false) {
  return item.activeVersion ?? (item.availableVersions === undefined ? capabilityVersions(item, isDraft)[0] : undefined)
}

export function captureCapabilityVersion(item: ConfigurableCapability, version: string) {
  const { name, description, instructions, resourceIds, role } = item
  item.versionSnapshots ??= {}
  item.versionSnapshots[version] ??= { name, description, instructions, resourceIds: [...resourceIds], ...(role === undefined ? {} : { role }) }
}

export function activeConfiguration<T extends ConfigurableCapability & { id: string }>(item: T): T {
  const version = activeCapabilityVersion(item)
  const snapshot = version ? item.versionSnapshots?.[version] : undefined
  return snapshot ? { ...item, ...snapshot } : item
}

export interface AdminConnection {
  id: string
  name: string
  type: '模型' | 'MCP' | '业务系统'
  endpoint: string
  status: '正常' | '待检测' | '已停用'
  lastCheckedAt?: string
}

export interface AdminChange {
  id: string
  at: string
  actor: string
  target: string
  action: string
  before: string
  after: string
}

const defaultConnections: Record<string, string> = {
  'model-deepseek': 'connection-model-deepseek',
  'mcp-files': 'connection-mcp-files',
}

export function capabilityConnectionId(item: OrganizationCapabilityFields & { id: string }) {
  return item.connectionId === undefined ? defaultConnections[item.id] : item.connectionId ?? undefined
}

export function connectionIsReady(id: string | undefined, connections: AdminConnection[]) {
  return !id || connections.some(connection => connection.id === id && connection.status === '正常')
}

export function makeAdminConnections(): AdminConnection[] {
  const lastCheckedAt = '2026-11-11T09:30:00+08:00'
  return [
    { id: 'connection-model-deepseek', name: '企业模型网关', type: '模型', endpoint: 'https://model.example.com/v1', status: '正常', lastCheckedAt },
    { id: 'connection-mcp-files', name: '企业文档 MCP', type: 'MCP', endpoint: 'https://documents.example.com/mcp', status: '正常', lastCheckedAt },
    { id: 'connection-business', name: '项目系统（演示）', type: '业务系统', endpoint: 'https://projects.example.com/api', status: '待检测' },
  ]
}

export function makeAdminChanges(): AdminChange[] {
  return [
    { id: 'admin-sample-grant', at: '2026-11-11T10:15:00+08:00', actor: '林知远', target: '文档整理助理', action: '分配使用权', before: '林知远', after: '林知远、周可欣' },
    { id: 'admin-sample-connection', at: '2026-11-11T09:30:00+08:00', actor: '林知远', target: '企业模型网关', action: '模拟检测连接', before: '待检测', after: '正常' },
  ]
}
