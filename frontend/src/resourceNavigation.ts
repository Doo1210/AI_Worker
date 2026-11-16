import { BookOpen, Cable, Cpu, Layers3, LibraryBig, Wrench, type LucideIcon } from 'lucide-vue-next'
import type { LocationQueryRaw } from 'vue-router'
import type { Resource } from '@/stores/platform'

export const resourceTypes = ['模型', '技能', 'MCP', '知识', '工具'] as const satisfies readonly Resource['type'][]

export type ResourceScopeFilter = 'all' | 'own' | 'shared'

const resourceIcons = {
  模型: Cpu,
  技能: Layers3,
  MCP: Cable,
  知识: BookOpen,
  工具: Wrench,
} satisfies Record<Resource['type'], LucideIcon>

export const resourceTypeItems = [
  { type: undefined, label: '全部资源', icon: LibraryBig },
  ...resourceTypes.map(type => ({ type, label: type, icon: resourceIcons[type] })),
]

export function resourceTypeFromQuery(query: LocationQueryRaw) {
  return resourceTypes.find(type => type === query.type)
}

export function resourceScopeFromQuery(query: LocationQueryRaw): ResourceScopeFilter {
  return query.scope === 'own' || query.scope === 'shared' ? query.scope : 'all'
}

export function resourceLibraryLocation(query: LocationQueryRaw, type?: Resource['type']) {
  const scope = resourceScopeFromQuery(query)
  return {
    path: '/work/resources',
    query: {
      type,
      scope: scope === 'all' ? undefined : scope,
      q: type === resourceTypeFromQuery(query) && typeof query.q === 'string' ? query.q : undefined,
    },
  }
}
