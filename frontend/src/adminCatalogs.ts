import type { AdminCapability } from '@/stores/organizationAdmin'

interface AdminCatalog {
  title: string
  types: readonly AdminCapability['type'][]
}

export const adminCatalogs = {
  'admin-workbenches': {
    title: '工作台与助理',
    types: ['工作台', '组织助理'],
  },
  'admin-employees': {
    title: 'AI 员工',
    types: ['AI 员工'],
  },
  'admin-resources': {
    title: '组织资源',
    types: ['模型', '技能', 'MCP', '知识', '工具'],
  },
} satisfies Record<string, AdminCatalog>

export type AdminCatalogName = keyof typeof adminCatalogs

export function catalogForType(type: unknown): AdminCatalogName {
  if (type === '工作台' || type === '组织助理') return 'admin-workbenches'
  if (type === 'AI 员工' || type === '数字员工') return 'admin-employees'
  return 'admin-resources'
}

export function adminCapabilityLink(item: Pick<AdminCapability, 'type' | 'id'>) {
  return { name: catalogForType(item.type), params: { id: item.id } }
}
