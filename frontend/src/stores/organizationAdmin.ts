import { computed } from 'vue'
import { defineStore } from 'pinia'
import { makeId, nowIso, usePlatformStore, type Assistant, type Employee, type Resource, type User, type Workbench } from './platform'
import {
  activeCapabilityVersion, activeConfiguration, capabilityConnectionId, capabilityVersions, captureCapabilityVersion,
  connectionIsReady, organizationRoleLabels, type AdminChange, type AdminConnection, type OrganizationDepartment,
} from './organizationAdminData'

export type { AdminChange, AdminConnection } from './organizationAdminData'

export interface AdminCapability {
  id: string
  name: string
  type: '组织助理' | 'AI 员工' | '工作台' | Resource['type']
  description: string
  enabled: boolean
  ready: boolean
  memberIds: string[]
  pairedId?: string
  maintainerId?: string
  configuratorIds: string[]
  publisherIds: string[]
  connectionId?: string
  dependencyIds: string[]
  version?: string
  availableVersions: string[]
  usage?: { label: string; value: string; detail?: string }
}

export function capabilityResponsibilities(capability: AdminCapability, memberId: string) {
  return [
    capability.maintainerId === memberId && (capability.type === 'AI 员工' ? '主要负责人' : '维护负责人'),
    capability.configuratorIds.includes(memberId) && '共同负责人',
    capability.publisherIds.includes(memberId) && '版本发布',
  ].filter(Boolean).join(' · ')
}

type Target =
  | { kind: 'assistant'; item: Assistant }
  | { kind: 'employee'; item: Employee }
  | { kind: 'workbench'; item: Workbench }
  | { kind: 'resource'; item: Resource }

type MemberDraft = Pick<User, 'name' | 'title' | 'status'> & { departmentId: string }
type DepartmentDraft = Omit<OrganizationDepartment, 'id'>
type MemberRoleDraft = Pick<User, 'role' | 'managementDepartmentIds' | 'assignableCapabilityIds'>
interface MemberTransfer {
  departmentId: string
  title: string
  revokeIds: string[]
  handoverIds: string[]
  successorId: string
}
type ConnectionDraft = Pick<AdminConnection, 'name' | 'type' | 'endpoint'>

const sampleUsage: Record<string, NonNullable<AdminCapability['usage']>> = {
  'assistant-org-documents': { label: '会话数', value: '42 次' },
  'employee-service': { label: '交办任务', value: '18 项' },
  'employee-design': { label: '交办任务', value: '12 项' },
  'employee-office': { label: '交办任务', value: '7 项' },
  'workbench-design': { label: '打开次数', value: '31 次', detail: '8 位成员使用' },
  'model-deepseek': { label: '模型请求', value: '1,284 次', detail: '286,400 Token' },
  'mcp-files': { label: '工具调用', value: '217 次', detail: '其中失败 4 次' },
  'knowledge-design': { label: '知识检索', value: '108 次' },
  'skill-summary': { label: '技能触发', value: '94 次' },
  'tool-sheet': { label: '工具调用', value: '63 次' },
}

function versionsOf(target: Target) {
  return capabilityVersions(target.item, target.kind === 'employee' && target.item.status === 'draft')
}

function currentVersion(target: Target) {
  return activeCapabilityVersion(target.item, target.kind === 'employee' && target.item.status === 'draft')
}

function isEnabled(target: Target) {
  switch (target.kind) {
    case 'assistant': return target.item.enabled !== false
    case 'employee': return target.item.status === 'published'
    case 'workbench': return target.item.status === 'active'
    case 'resource': return target.item.status === '可用'
  }
}

function targetType(target: Target): AdminCapability['type'] {
  switch (target.kind) {
    case 'assistant': return '组织助理'
    case 'employee': return 'AI 员工'
    case 'workbench': return '工作台'
    case 'resource': return target.item.type
  }
}

function connectionType(target: Target): AdminConnection['type'] | undefined {
  const type = targetType(target)
  if (type === '模型' || type === 'MCP') return type
  if (type === '工作台') return '业务系统'
}

function maintainerOf(target: Target) {
  return target.kind === 'employee' ? target.item.ownerId : target.item.maintainerId
}

function configuresEmployee(employee: Employee, memberId: string) {
  return employee.ownerId === memberId || !!employee.configuratorIds?.includes(memberId)
}

function employeeMaintenancePermissions(employee: Employee, memberId: string) {
  return {
    canConfigure: configuresEmployee(employee, memberId),
    canPublish: employee.publisherIds?.includes(memberId) ?? false,
  }
}

function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && right.every(id => left.includes(id))
}

export const useOrganizationAdminStore = defineStore('organization-admin', () => {
  const platform = usePlatformStore()
  const isAdmin = computed(() => platform.currentUser.role === 'admin')
  const departments = computed(() => platform.organizationDepartments)
  const managedDepartmentIds = computed(() => new Set(departments.value
    .filter(department => platform.currentUser.role === 'department-admin'
      && platform.currentUser.managementDepartmentIds?.includes(department.id))
    .map(department => department.id)))
  const canOpenAdmin = computed(() => isAdmin.value || managedDepartmentIds.value.size > 0)
  const visibleDepartments = computed(() => departments.value.filter(department => canViewDepartment(department.id)))
  const visibleMembers = computed(() => platform.users.filter(member => canViewDepartment(member.departmentId)))
  const myEmployeeMaintenance = computed(() => {
    const permissions = new Map<string, ReturnType<typeof employeeMaintenancePermissions>>()
    for (const employee of platform.employees) {
      const grant = employeeMaintenancePermissions(employee, platform.currentUser.id)
      if (grant.canConfigure || grant.canPublish) permissions.set(employee.id, grant)
    }
    return permissions
  })
  const targets = computed<Target[]>(() => [
    ...platform.assistants.filter(item => item.scope === 'organization').map(item => ({ kind: 'assistant' as const, item })),
    ...platform.employees.map(item => ({ kind: 'employee' as const, item })),
    ...platform.workbenches.map(item => ({ kind: 'workbench' as const, item })),
    ...platform.resources.filter(item => item.scope === 'organization').map(item => ({ kind: 'resource' as const, item })),
  ])
  const connections = computed(() => platform.organizationConnections)
  const changes = computed(() => platform.organizationChanges)

  function readyToEnable(target: Target) {
    if (!versionsOf(target).length) return false
    const connectionId = capabilityConnectionId(target.item)
    if (connectionId) return connectionIsReady(connectionId, connections.value)
    return target.kind !== 'resource' || !connectionType(target)
      || (target.item.status !== '未连接' && target.item.connectionId !== null)
  }

  const capabilities = computed<AdminCapability[]>(() => targets.value.map(target => {
    const { id, allowedUserIds, publisherIds } = target.item
    const configuration = target.kind === 'assistant' || target.kind === 'employee'
      ? activeConfiguration(target.item)
      : undefined
    return {
      id,
      name: configuration?.name ?? target.item.name,
      description: configuration?.description ?? target.item.description,
      type: targetType(target),
      enabled: isEnabled(target),
      ready: readyToEnable(target),
      memberIds: allowedUserIds ?? [],
      pairedId: pairedTarget(target)?.item.id,
      maintainerId: maintainerOf(target) || undefined,
      configuratorIds: target.kind === 'employee' ? target.item.configuratorIds ?? [] : [],
      publisherIds: publisherIds ?? [],
      connectionId: capabilityConnectionId(target.item),
      dependencyIds: configuration?.resourceIds ?? [],
      version: currentVersion(target),
      availableVersions: versionsOf(target),
      usage: sampleUsage[id],
    }
  }))

  function findTarget(id: string) {
    return targets.value.find(target => target.item.id === id)
  }

  function canViewDepartment(id?: string) {
    return isAdmin.value || (id !== undefined && managedDepartmentIds.value.has(id))
  }

  function canManageMember(member: User) {
    return isAdmin.value || (member.role === 'member' && canViewDepartment(member.departmentId))
  }

  function canAssignCapability(id: string) {
    return isAdmin.value || (managedDepartmentIds.value.size > 0 && !!platform.currentUser.assignableCapabilityIds?.includes(id))
  }

  function pairedTarget(target: Target) {
    if (target.kind === 'workbench') {
      const assistantId = target.item.pairedAssistantId
      return assistantId ? targets.value.find(item => item.kind === 'assistant' && item.item.id === assistantId) : undefined
    }
    if (target.kind === 'assistant') {
      return targets.value.find(item => item.kind === 'workbench' && item.item.pairedAssistantId === target.item.id)
    }
  }

  function canConfigureCapability(id: string) {
    const target = findTarget(id)
    if (!target) return false
    const memberId = platform.currentUser.id
    return isAdmin.value || (target.kind === 'employee'
      ? configuresEmployee(target.item, memberId)
      : maintainerOf(target) === memberId)
  }

  function canPublishCapability(id: string) {
    const target = findTarget(id)
    return !!target && (isAdmin.value || !!target.item.publisherIds?.includes(platform.currentUser.id))
  }

  function employeeResponsibles(id: string) {
    const employee = platform.employees.find(item => item.id === id)
    if (!employee) return []
    return platform.users.filter(member => member.status !== 'disabled')
      .map(member => ({
        id: member.id,
        name: member.name,
        ...employeeMaintenancePermissions(employee, member.id),
      }))
      .filter(member => member.canConfigure || member.canPublish)
  }

  function captureBaseline(target: Target) {
    if (target.kind === 'assistant' || target.kind === 'employee') {
      for (const version of versionsOf(target)) captureCapabilityVersion(target.item, version)
    }
  }

  function prepareCapabilityEdit(id: string) {
    const target = findTarget(id)
    if (!target || !canConfigureCapability(id)) return false
    captureBaseline(target)
    return true
  }

  function record(action: string, target: string, before: string, after: string) {
    const entry: AdminChange = {
      id: makeId('admin-change'), at: nowIso(), actor: platform.currentUser.name, action, target, before, after,
    }
    platform.organizationChanges.unshift(entry)
  }

  function memberLabel(ids: string[]) {
    return ids.map(id => platform.users.find(user => user.id === id)?.name ?? id).join('、') || '无'
  }

  function knownMembers(ids: string[]) {
    return ids.every(id => platform.users.some(user => user.id === id))
  }

  function updateCapabilityMembers(target: Target, next: string[]) {
    const previous = target.item.allowedUserIds ?? []
    if (!sameIds(previous, next)) {
      target.item.allowedUserIds = next
      record('分配使用权', target.item.name, memberLabel(previous), memberLabel(next))
    }
  }

  function setCapabilityMembers(id: string, memberIds: string[], includePaired = false) {
    const target = findTarget(id)
    const next = [...new Set(memberIds)]
    if (!isAdmin.value || !target || !knownMembers(next)) return false

    const counterpart = includePaired ? pairedTarget(target) : undefined
    const previous = target.item.allowedUserIds ?? []
    const added = counterpart ? next.filter(memberId => !previous.includes(memberId)) : []
    updateCapabilityMembers(target, next)
    if (counterpart && added.length) {
      updateCapabilityMembers(counterpart, [...new Set([...(counterpart.item.allowedUserIds ?? []), ...added])])
    }
    return true
  }

  function setCapabilityPair(id: string, pairedId: string) {
    const target = findTarget(id)
    if (!isAdmin.value || (target?.kind !== 'workbench' && target?.kind !== 'assistant')) return false

    const previous = pairedTarget(target)
    if (!pairedId) {
      const workbench = target.kind === 'workbench' ? target : previous
      if (workbench?.kind === 'workbench' && workbench.item.pairedAssistantId) {
        const previousLabel = previous?.item.name ?? workbench.item.pairedAssistantId
        workbench.item.pairedAssistantId = null
        record('调整配套关系', target.item.name, previousLabel, '无')
      }
      return true
    }

    if (previous?.item.id === pairedId) return true
    const next = findTarget(pairedId)
    if (!next || pairedTarget(next)) return false
    const workbench = target.kind === 'workbench' ? target : next
    const assistant = target.kind === 'assistant' ? target : next
    if (workbench.kind !== 'workbench' || assistant.kind !== 'assistant') return false

    if (target.kind === 'assistant' && previous?.kind === 'workbench') previous.item.pairedAssistantId = null
    workbench.item.pairedAssistantId = assistant.item.id
    record('调整配套关系', target.item.name, previous?.item.name ?? '无', next.item.name)
    return true
  }

  function canSetMemberCapabilities(memberId: string, capabilityIds: string[]) {
    const member = platform.users.find(user => user.id === memberId)
    if (!member || !canManageMember(member) || capabilityIds.some(id => !findTarget(id))) return false
    const requested = new Set(capabilityIds)
    return targets.value.every(({ item }) =>
      canAssignCapability(item.id) || (item.allowedUserIds?.includes(memberId) ?? false) === requested.has(item.id))
  }

  function applyMemberCapabilities(memberId: string, capabilityIds: string[]) {
    const requested = new Set(capabilityIds)
    const previous: string[] = []
    const next: string[] = []
    let changed = false
    for (const { item } of targets.value) {
      const ids = item.allowedUserIds ?? []
      const hadAccess = ids.includes(memberId)
      const hasAccess = requested.has(item.id)
      if (hadAccess) previous.push(item.name)
      if (hasAccess) next.push(item.name)
      if (hadAccess === hasAccess) continue
      item.allowedUserIds = hasAccess ? [...ids, memberId] : ids.filter(id => id !== memberId)
      changed = true
    }
    if (changed) record('分配使用权', memberLabel([memberId]), previous.join('、') || '无', next.join('、') || '无')
  }

  function setMembersCapabilities(updates: { memberId: string; capabilityIds: string[] }[]) {
    if (!updates.every(({ memberId, capabilityIds }) => canSetMemberCapabilities(memberId, capabilityIds))) return false
    for (const { memberId, capabilityIds } of updates) applyMemberCapabilities(memberId, capabilityIds)
    return true
  }

  function setCapabilityMaintainer(id: string, memberId: string) {
    const target = findTarget(id)
    if (!isAdmin.value || !target || (memberId && !knownMembers([memberId]))) return false
    const previous = maintainerOf(target) ?? ''
    if (previous === memberId) return true
    if (target.kind === 'employee') {
      target.item.ownerId = memberId
      if (target.item.configuratorIds?.includes(memberId)) {
        target.item.configuratorIds = target.item.configuratorIds.filter(id => id !== memberId)
      }
    } else target.item.maintainerId = memberId || undefined
    record('调整负责人', target.item.name, memberLabel(previous ? [previous] : []), memberLabel(memberId ? [memberId] : []))
    return true
  }

  function setEmployeeConfigurators(id: string, memberIds: string[]) {
    const target = findTarget(id)
    if (!isAdmin.value || target?.kind !== 'employee') return false
    const previous = target.item.configuratorIds ?? []
    const next = [...new Set(memberIds)].filter(memberId => memberId !== target.item.ownerId)
    const enabledMembers = new Set(platform.users.filter(member => member.status !== 'disabled').map(member => member.id))
    if (next.some(memberId => !enabledMembers.has(memberId) && !previous.includes(memberId))) return false
    if (!sameIds(previous, next)) {
      target.item.configuratorIds = next
      record('调整共同负责人', target.item.name, memberLabel(previous), memberLabel(next))
    }
    return true
  }

  function setCapabilityPublishers(id: string, memberIds: string[]) {
    const target = findTarget(id)
    const next = [...new Set(memberIds)]
    if (!isAdmin.value || !target || !knownMembers(next)) return false
    const previous = target.item.publisherIds ?? []
    if (!sameIds(previous, next)) {
      target.item.publisherIds = next
      record('调整发布权', target.item.name, memberLabel(previous), memberLabel(next))
    }
    return true
  }

  function setCapabilityEnabled(id: string, enabled: boolean) {
    const target = findTarget(id)
    if (!isAdmin.value || !target) return false
    if (isEnabled(target) === enabled) return true
    if (enabled && !readyToEnable(target)) return false
    if (enabled && !currentVersion(target)) target.item.activeVersion = versionsOf(target).at(-1)
    switch (target.kind) {
      case 'assistant': target.item.enabled = enabled; break
      case 'employee': target.item.status = enabled ? 'published' : 'paused'; break
      case 'workbench': target.item.status = enabled ? 'active' : 'disabled'; break
      case 'resource': target.item.status = enabled ? '可用' : '停用'; break
    }
    record(enabled ? '启用能力' : '停用能力', target.item.name, enabled ? '未启用' : '已启用', enabled ? '已启用' : '已停用')
    return true
  }

  function publishCapability(id: string) {
    const target = findTarget(id)
    if (!target || !canPublishCapability(id)) return false
    const versions = versionsOf(target)
    const next = versions.length ? `1.${versions.length}.0` : '1.0.0'
    captureBaseline(target)
    if (target.kind === 'assistant' || target.kind === 'employee') captureCapabilityVersion(target.item, next)
    target.item.activeVersion = currentVersion(target)
    target.item.availableVersions = [...versions, next]
    record('发布稳定版本', target.item.name, versions.at(-1) ?? '尚无稳定版本', next)
    return true
  }

  function setCapabilityVersion(id: string, version: string) {
    const target = findTarget(id)
    if (!isAdmin.value || !target || !versionsOf(target).includes(version)) return false
    const previous = currentVersion(target)
    if (version !== previous) {
      captureBaseline(target)
      target.item.activeVersion = version
      record('切换版本', target.item.name, previous ?? '未生效', version)
    }
    return true
  }

  function setCapabilityConnection(id: string, connectionId: string) {
    const target = findTarget(id)
    const selected = connections.value.find(connection => connection.id === connectionId)
    if (!isAdmin.value || !target || !connectionType(target)
      || (connectionId && (!selected || selected.type !== connectionType(target)))) return false
    const previousId = capabilityConnectionId(target.item)
    if ((previousId ?? '') === connectionId) return true
    target.item.connectionId = connectionId || null
    const previous = connections.value.find(connection => connection.id === previousId)
    record('调整接入', target.item.name, previous?.name ?? '未绑定', selected?.name ?? '未绑定')
    return true
  }

  function saveConnection(draft: ConnectionDraft, id?: string) {
    const name = draft.name.trim()
    const endpoint = draft.endpoint.trim()
    const current = connections.value.find(connection => connection.id === id)
    if (!isAdmin.value || !name || !validEndpoint(endpoint) || (id && !current)
      || !['模型', 'MCP', '业务系统'].includes(draft.type)
      || connections.value.some(connection => connection.id !== id && connection.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false
    if (current) {
      if (current.type !== draft.type && targets.value.some(({ item }) => capabilityConnectionId(item) === current.id)) return false
      if (current.name === name && current.type === draft.type && current.endpoint === endpoint) return true
      const previous = `${current.name} · ${current.type} · ${current.endpoint}`
      if (current.type !== draft.type || current.endpoint !== endpoint) {
        current.lastCheckedAt = undefined
        if (current.status !== '已停用') current.status = '待检测'
      }
      Object.assign(current, { name, type: draft.type, endpoint })
      record('更新连接', name, previous, `${name} · ${draft.type} · ${endpoint}`)
    } else {
      platform.organizationConnections.push({ id: makeId('connection'), name, type: draft.type, endpoint, status: '待检测' })
      record('新增连接', name, '无', `${draft.type} · ${endpoint}`)
    }
    return true
  }

  function testConnection(id: string) {
    const connection = connections.value.find(item => item.id === id)
    if (!isAdmin.value || !connection || connection.status === '已停用' || !validEndpoint(connection.endpoint)) return false
    const previous = connection.status
    connection.lastCheckedAt = nowIso()
    connection.status = '正常'
    if (previous !== connection.status) record('模拟检测连接', connection.name, previous, connection.status)
    return true
  }

  function setConnectionEnabled(id: string, enabled: boolean) {
    const connection = connections.value.find(item => item.id === id)
    if (!isAdmin.value || !connection) return false
    const previous = connection.status
    if (enabled === (previous !== '已停用')) return true
    connection.status = enabled ? '待检测' : '已停用'
    record(enabled ? '启用连接' : '停用连接', connection.name, previous, connection.status)
    return true
  }

  function memberSummary(member: User) {
    return [
      member.name, member.department, member.title, organizationRoleLabels[member.role],
      member.status === 'disabled' ? '已停用' : '正常',
    ].filter(Boolean).join(' · ')
  }

  function departmentSummary(department: OrganizationDepartment) {
    const parent = departments.value.find(item => item.id === department.parentId)
    return [department.name, parent?.name ?? '直属部门', memberLabel(department.leaderId ? [department.leaderId] : [])].join(' · ')
  }

  function saveDepartment(draft: DepartmentDraft, id?: string) {
    const name = draft.name.trim()
    const current = departments.value.find(department => department.id === id)
    const parent = departments.value.find(department => department.id === draft.parentId)
    if (!isAdmin.value || !name || (id && !current) || (draft.parentId && !parent)
      || departments.value.some(department => department.id !== id && department.name === name)) return false
    for (let ancestor = parent; ancestor; ancestor = departments.value.find(department => department.id === ancestor?.parentId)) {
      if (ancestor.id === id) return false
    }
    if (draft.leaderId && (!id || !platform.users.some(member =>
      member.id === draft.leaderId && member.departmentId === id && member.status !== 'disabled'))) return false
    const fields = { name, parentId: parent?.id, leaderId: draft.leaderId || undefined }
    if (current) {
      const before = departmentSummary(current)
      Object.assign(current, fields)
      for (const member of platform.users.filter(member => member.departmentId === id)) member.department = name
      const after = departmentSummary(current)
      if (before !== after) record('更新部门', name, before, after)
    } else {
      const department = { ...fields, id: makeId('department') }
      departments.value.push(department)
      record('新增部门', name, '无', departmentSummary(department))
    }
    return true
  }

  function createMember(fields: MemberDraft) {
    const name = fields.name.trim()
    const department = departments.value.find(item => item.id === fields.departmentId)
    if (!name || !department || !canViewDepartment(department.id)) return false
    const member: User = {
      id: makeId('member'), name, department: department.name, departmentId: department.id, role: 'member',
      title: fields.title.trim(), initials: Array.from(name)[0]!, status: 'active',
    }
    platform.users.push(member)
    record('新增成员', member.name, '无', memberSummary(member))
    return true
  }

  function updateMember(id: string, fields: Omit<MemberDraft, 'departmentId'>) {
    const member = platform.users.find(user => user.id === id)
    if (!member || !canManageMember(member) || (id === platform.currentUser.id && fields.status === 'disabled')) return false
    const name = fields.name.trim()
    const status = fields.status ?? 'active'
    if (!name || !['active', 'disabled'].includes(status)) return false
    const previous = memberSummary(member)
    Object.assign(member, { name, initials: Array.from(name)[0]!, title: fields.title.trim(), status })
    if (status === 'disabled') clearDepartmentLeader(member)
    const next = memberSummary(member)
    if (previous !== next) record('更新成员', member.name, previous, next)
    return true
  }

  function clearDepartmentLeader(member: User) {
    const department = departments.value.find(item => item.id === member.departmentId && item.leaderId === member.id)
    if (!department) return
    const before = departmentSummary(department)
    delete department.leaderId
    record('调整部门负责人', department.name, before, departmentSummary(department))
  }

  function updateMemberRole(id: string, draft: MemberRoleDraft) {
    const member = platform.users.find(user => user.id === id)
    if (!isAdmin.value || !member || member.id === platform.currentUser.id || member.status === 'disabled'
      || !Object.hasOwn(organizationRoleLabels, draft.role)) return false
    const scope = draft.role === 'department-admin' ? [...new Set(draft.managementDepartmentIds)] : []
    const grants = draft.role === 'department-admin' ? [...new Set(draft.assignableCapabilityIds)] : []
    if ((draft.role === 'department-admin' && !scope.length)
      || scope.some(departmentId => !departments.value.some(department => department.id === departmentId))
      || grants.some(capabilityId => !findTarget(capabilityId))) return false
    const summary = () => [
      organizationRoleLabels[member.role],
      ...(member.role === 'department-admin' ? [
        departments.value.filter(department => member.managementDepartmentIds?.includes(department.id)).map(department => department.name).join('、'),
        capabilities.value.filter(capability => member.assignableCapabilityIds?.includes(capability.id)).map(capability => capability.name).join('、') || '无可分配能力',
      ] : []),
    ].join(' · ')
    const previous = summary()
    Object.assign(member, { role: draft.role, managementDepartmentIds: scope, assignableCapabilityIds: grants })
    const next = summary()
    if (previous !== next) record('调整管理角色', member.name, previous, next)
    return true
  }

  function transferMember(id: string, draft: MemberTransfer) {
    const member = platform.users.find(user => user.id === id)
    const department = departments.value.find(item => item.id === draft.departmentId)
    if (!isAdmin.value || !member || !department || department.id === member.departmentId || member.status === 'disabled') return false
    const successor = platform.users.find(user => user.id === draft.successorId && user.id !== id && user.status !== 'disabled')
    if (draft.handoverIds.length && !successor) return false
    const granted = capabilities.value.filter(item => item.memberIds.includes(id))
    const handovers = capabilities.value.filter(item => draft.handoverIds.includes(item.id) && capabilityResponsibilities(item, id))
    if (!draft.revokeIds.every(capabilityId => granted.some(item => item.id === capabilityId))
      || !draft.handoverIds.every(capabilityId => handovers.some(item => item.id === capabilityId))) return false

    const before = memberSummary(member)
    if (successor) {
      for (const item of handovers) {
        if (item.maintainerId === id) setCapabilityMaintainer(item.id, successor.id)
        if (item.configuratorIds.includes(id)) {
          setEmployeeConfigurators(item.id, [...item.configuratorIds.filter(memberId => memberId !== id), successor.id])
        }
        if (item.publisherIds.includes(id)) {
          setCapabilityPublishers(item.id, [...item.publisherIds.filter(memberId => memberId !== id), successor.id])
        }
      }
    }
    if (draft.revokeIds.length) applyMemberCapabilities(id, granted.filter(item => !draft.revokeIds.includes(item.id)).map(item => item.id))
    clearDepartmentLeader(member)
    Object.assign(member, { departmentId: department.id, department: department.name, title: draft.title.trim() })
    const details = [memberSummary(member)]
    if (draft.revokeIds.length) details.push(`收回 ${draft.revokeIds.length} 项使用授权`)
    if (handovers.length && successor) details.push(`${handovers.length} 项职责交给 ${successor.name}`)
    record('调岗交接', member.name, before, details.join(' · '))
    return true
  }

  return {
    capabilities, connections, changes, myEmployeeMaintenance,
    canConfigureCapability, canPublishCapability, employeeResponsibles, prepareCapabilityEdit, setCapabilityPublishers, publishCapability,
    setEmployeeConfigurators,
    setCapabilityMembers, setCapabilityPair, setMembersCapabilities, setCapabilityEnabled, setCapabilityVersion, setCapabilityMaintainer,
    setCapabilityConnection, saveConnection, testConnection, setConnectionEnabled, createMember, updateMember,
    departments, visibleDepartments, visibleMembers, isAdmin, canOpenAdmin, canManageMember, canAssignCapability,
    saveDepartment, updateMemberRole, transferMember,
  }
})
