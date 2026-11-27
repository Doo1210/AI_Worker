export interface OrganizationCapabilityFields {
  maintainerId?: string
  publisherIds?: string[]
  activeVersion?: string
  availableVersions?: string[]
  connectionId?: string | null
  versionSnapshots?: Record<string, CapabilityConfiguration>
  dependencyIds?: string[]
  releases?: { version: string; at: string; actor: string; notes: string }[]
}

interface CapabilityConfiguration {
  name: string
  description: string
  instructions: string
  resourceIds: string[]
  role?: string
}

type ConfigurableCapability = OrganizationCapabilityFields & CapabilityConfiguration

const sampleUpdates = new Set(['assistant-org-documents', 'employee-design', 'model-deepseek', 'skill-summary', 'mcp-files'])

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
  type: '模型' | 'MCP' | '业务 API' | '业务系统' | '企业消息'
  endpoint: string
  status: '正常' | '待检测' | '异常' | '已停用'
  lastCheckedAt?: string
  credentialMode?: 'environment' | 'organization' | 'member' | 'none'
  credentialRef?: string
  memberCredentialRefs?: Record<string, string>
  lastError?: string
  checks?: { at: string; status: '正常' | '异常'; message: string }[]
}

export interface AdminPlugin {
  id: string
  name: string
  description: string
  enabled: boolean
  version: string
  versions: string[]
  dependencyIds: string[]
  capabilityIds: string[]
  loadStatus: '已加载' | '未加载' | '加载失败'
  lastError?: string
  checkedAt?: string
}

export function makeAdminPlugins(): AdminPlugin[] {
  return [
    { id: 'plugin-assistants', name: '助理运行组件', description: '提供组织助理的会话与能力配置。', enabled: true, version: '1.0.0', versions: ['1.0.0', '1.1.0'], dependencyIds: [], capabilityIds: ['assistant-org-documents', 'assistant-org-et-design'], loadStatus: '已加载' },
    { id: 'plugin-workbenches', name: '业务工作台组件', description: '提供已交付的业务工作台入口。', enabled: true, version: '1.0.0', versions: ['1.0.0', '1.1.0'], dependencyIds: [], capabilityIds: ['workbench-design', 'workbench-project', 'workbench-trade', 'workbench-cost', 'workbench-tender', 'workbench-design-studio'], loadStatus: '已加载' },
    { id: 'plugin-documents', name: '文档工具组件', description: '提供文档总结与表格分析功能。', enabled: true, version: '1.0.0', versions: ['1.0.0', '1.1.0'], dependencyIds: ['plugin-assistants'], capabilityIds: ['skill-summary', 'tool-sheet'], loadStatus: '已加载' },
  ]
}

export interface OrganizationDepartment {
  id: string
  name: string
  parentId?: string
  leaderId?: string
}

export const organizationRoleLabels = {
  admin: '系统管理员',
  'department-admin': '组织管理员',
  operator: '运行运营人员',
  'platform-operator': '平台运维人员',
  member: '普通成员',
}

export interface AdminChange {
  id: string
  at: string
  actor: string
  target: string
  action: string
  before: string
  after: string
  targetId?: string
  targetType?: 'member' | 'role' | 'capability' | 'connection' | 'plugin' | 'department'
  relatedIds?: string[]
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
