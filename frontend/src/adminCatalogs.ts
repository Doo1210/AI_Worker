import type { AdminCapability } from '@/stores/organizationAdmin'

interface AdminCatalog {
  title: string
  description: string
  types: readonly AdminCapability['type'][]
}

export const adminCatalogs = {
  'admin-workbenches': {
    title: '工作台与助理',
    description: '管理工作台和组织助理的使用授权、启停及生效版本。',
    types: ['工作台', '组织助理'],
  },
  'admin-employees': {
    title: '数字员工',
    description: '管理数字员工的负责人、服务范围、启停及生效版本。',
    types: ['数字员工'],
  },
  'admin-resources': {
    title: '组织资源',
    description: '管理组织提供的模型、技能、MCP、知识和工具。',
    types: ['模型', '技能', 'MCP', '知识', '工具'],
  },
} satisfies Record<string, AdminCatalog>

export type AdminCatalogName = keyof typeof adminCatalogs

export function catalogForType(type: unknown): AdminCatalogName {
  if (type === '工作台' || type === '组织助理') return 'admin-workbenches'
  if (type === '数字员工') return 'admin-employees'
  return 'admin-resources'
}

export function adminCapabilityLink(item: Pick<AdminCapability, 'type' | 'id'>) {
  return { name: catalogForType(item.type), params: { id: item.id } }
}
