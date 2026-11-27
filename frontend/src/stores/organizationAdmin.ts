import { capabilityNodes, dependencyIssues, pluginIssues } from '@/adminDependencies'
import { useAdminUsageStore, filterUsage } from './adminUsage'
import { computed } from 'vue'
import { defineStore } from 'pinia'
import type { OrganizationRole } from './organizationRoles'
import { makeId, nowIso, usePlatformStore, type Assistant, type Employee, type Resource, type User, type Workbench } from './platform'
import {
  activeCapabilityVersion, activeConfiguration, capabilityConnectionId, capabilityVersions, captureCapabilityVersion,
  organizationRoleLabels, type AdminPlugin, type AdminChange, type AdminConnection, type OrganizationDepartment,
} from './organizationAdminData'

export type { AdminChange, AdminConnection } from './organizationAdminData'

export interface AdminCapability {
  id: string
  name: string
  type: '组织助理' | 'AI 员工' | '工作台' | Resource['type']
  description: string
  enabled: boolean
  ready: boolean
  issues: string[]
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
  if (capability.type === '工作台') return ''
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
type ConnectionDraft = Pick<AdminConnection, 'name' | 'type' | 'endpoint'> & { credentialMode?: AdminConnection['credentialMode']; credentialValue?: string; credentialMemberId?: string }


function versionsOf(target: Target) {
  if (target.kind === 'workbench') return []
  return capabilityVersions(target.item, target.kind === 'employee' && target.item.status === 'draft')
}

function currentVersion(target: Target) {
  if (target.kind === 'workbench') return undefined
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
  if (type === '工具') return '业务 API'
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
  const canViewRuns = computed(() => isAdmin.value || platform.currentUser.role === 'operator')
  const canManagePlatform = computed(() => isAdmin.value || platform.currentUser.role === 'platform-operator')
  const canViewCapabilities = computed(() => isAdmin.value || canViewRuns.value || canManagePlatform.value)
  const plugins = computed(() => platform.organizationPlugins)
  const nodes = computed(() => capabilityNodes(platform))
  const departments = computed(() => platform.organizationDepartments)
  const managedDepartmentIds = computed(() => new Set(departments.value
    .filter(department => platform.currentUser.role === 'department-admin'
      && platform.currentUser.managementDepartmentIds?.includes(department.id))
    .map(department => department.id)))
  const canOpenAdmin = computed(() => isAdmin.value || canViewRuns.value || canManagePlatform.value || managedDepartmentIds.value.size > 0)
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
  const usage = useAdminUsageStore()
  usage.seed(platform.users, platform.assistants.filter(item => item.scope === 'organization'), platform.workbenches.filter(item => item.status === 'active'), platform.resources.find(item => item.type === '模型' && item.scope === 'organization')?.id)
  const connections = computed(() => platform.organizationConnections)
  const changes = computed(() => platform.organizationChanges)
  const roles = computed(() => platform.organizationRoles)

  for (const change of changes.value.filter(item => !item.targetId)) {
    const capability = targets.value.find(({ item }) => item.name === change.target)
    const connection = connections.value.find(item => item.name === change.target)
    if (capability) Object.assign(change, { targetId: capability.item.id, targetType: 'capability' })
    if (connection) Object.assign(change, { targetId: connection.id, targetType: 'connection' })
  }

  // Existing explicit grants become the baseline; role assignments retain their own sources.
  for (const member of platform.users) {
    platform.organizationDirectGrants[member.id] ??= targets.value
      .filter(({ item }) => item.allowedUserIds?.includes(member.id)).map(({ item }) => item.id)
  }

  function directCapabilityIds(memberId: string) {
    return platform.organizationDirectGrants[memberId] ?? []
  }

  function memberRoles(memberId: string) {
    const member = platform.users.find(user => user.id === memberId)
    const assigned = platform.organizationRoleAssignments.filter(item => item.memberId === memberId)
    const management = roles.value.find(role => role.kind === 'management' && role.systemRole === member?.role
      && assigned.some(item => item.roleId === role.id))
      ?? roles.value.find(role => role.builtin && role.systemRole === member?.role)
    return [...(management ? [management] : []), ...roles.value.filter(role => role.kind === 'business'
      && assigned.some(item => item.roleId === role.id))]
  }

  function grantSources(memberId: string, capabilityId: string) {
    return [
      ...(directCapabilityIds(memberId).includes(capabilityId) ? ['直接分配'] : []),
      ...roles.value.filter(role => role.enabled && role.kind === 'business'
        && platform.organizationRoleAssignments.some(item => item.memberId === memberId && item.roleId === role.id
          && item.capabilityIds.includes(capabilityId))).map(role => `角色 · ${role.name}`),
    ]
  }

  function previewRoleGrants(memberId: string, roleIds: string[], synchronizeIds: string[]) {
    const effective = new Set(directCapabilityIds(memberId))
    for (const role of roles.value.filter(item => roleIds.includes(item.id) && item.enabled && item.kind === 'business')) {
      const assignment = platform.organizationRoleAssignments.find(item => item.memberId === memberId && item.roleId === role.id)
      for (const id of synchronizeIds.includes(role.id) ? role.capabilityIds : assignment?.capabilityIds ?? []) effective.add(id)
    }
    const before = new Set(capabilities.value.filter(item => item.memberIds.includes(memberId)).map(item => item.id))
    const names = (ids: string[]) => capabilities.value.filter(item => ids.includes(item.id)).map(item => item.name)
    return { added: names([...effective].filter(id => !before.has(id))), removed: names([...before].filter(id => !effective.has(id))), retained: names([...effective].filter(id => before.has(id))) }
  }

  function reconcileMemberAccess(memberId: string) {
    const effective = new Set(directCapabilityIds(memberId))
    for (const assignment of platform.organizationRoleAssignments.filter(item => item.memberId === memberId)) {
      if (roles.value.some(role => role.id === assignment.roleId && role.enabled && role.kind === 'business')) {
        assignment.capabilityIds.forEach(id => effective.add(id))
      }
    }
    for (const { item } of targets.value) {
      const previous = item.allowedUserIds ?? []
      if (effective.has(item.id) !== previous.includes(memberId)) {
        item.allowedUserIds = effective.has(item.id) ? [...previous, memberId] : previous.filter(id => id !== memberId)
      }
    }
  }

  function canAssignRole(role: OrganizationRole) {
    return isAdmin.value || (role.kind === 'business' && role.capabilityIds.every(canAssignCapability))
  }

  function saveRole(draft: Pick<OrganizationRole, 'name' | 'description' | 'kind' | 'systemRole' | 'capabilityIds'>, id?: string) {
    const current = roles.value.find(role => role.id === id)
    const name = draft.name.trim()
    if (!isAdmin.value || !name || (id && !current) || current?.builtin
      || roles.value.some(role => role.id !== id && role.name === name)
      || (current && current.kind !== draft.kind)
      || (draft.kind === 'management' && !['admin', 'department-admin', 'operator', 'platform-operator'].includes(draft.systemRole ?? ''))
      || draft.capabilityIds.some(capabilityId => !findTarget(capabilityId))) return false
    const values = { name, description: draft.description.trim(), kind: draft.kind,
      systemRole: draft.kind === 'management' ? draft.systemRole : undefined,
      capabilityIds: draft.kind === 'business' ? [...new Set(draft.capabilityIds)] : [] }
    if (current) {
      const before = `${current.name} · v${current.version}`
      // Management presets cannot change while assigned to members.
      if (current.systemRole !== values.systemRole && platform.organizationRoleAssignments.some(item => item.roleId === current.id)) return false
      Object.assign(current, values, { version: current.version + 1 })
      record('更新角色', { id: current.id, name, type: 'role' }, before, `${name} · v${current.version}；已有授权待手动同步`)
    } else {
      roles.value.push({ ...values, id: makeId('role'), enabled: true, version: 1 })
      record('新建角色', { id: roles.value.at(-1)!.id, name, type: 'role' }, '无', draft.kind === 'business' ? `${values.capabilityIds.length} 项使用权限` : '管理角色')
    }
    return true
  }

  function setRoleEnabled(id: string, enabled: boolean) {
    const role = roles.value.find(item => item.id === id)
    if (!isAdmin.value || !role || role.builtin
      || (role.kind === 'management' && platform.organizationRoleAssignments.some(item => item.roleId === id))) return false
    role.enabled = enabled
    platform.users.forEach(member => reconcileMemberAccess(member.id))
    record(enabled ? '启用角色' : '停用角色', { id: role.id, name: role.name, type: 'role' }, enabled ? '已停用' : '已启用', enabled ? '已启用' : '已停用')
    return true
  }

  interface AssignRolesOptions {
    replace?: boolean
    synchronize?: boolean
    managementDepartmentIds: string[]
    assignableCapabilityIds: string[]
  }

  function assignRoles(memberIds: string[], roleIds: string[], options: AssignRolesOptions) {
    const ids = [...new Set(memberIds)]
    const selected = [...new Set(roleIds)].map(id => roles.value.find(role => role.id === id))
    if (!ids.length || selected.some(role => !role || (!canAssignRole(role)
      && !(role.kind === 'management' && ids.every(id => memberRoles(id).some(item => item.id === role.id)))))) return false
    const selectedRoles = selected as OrganizationRole[]
    const managers = selectedRoles.filter(role => role.kind === 'management')
    if (managers.length > 1) return false
    const plans = ids.map(id => {
      const member = platform.users.find(user => user.id === id)
      const current = memberRoles(id)
      const next = options.replace ? selectedRoles : [
        ...current.filter(role => !selectedRoles.some(item => item.id === role.id)
          && !(managers.length && role.kind === 'management')), ...selectedRoles,
      ]
      const management = next.find(role => role.kind === 'management')
        ?? roles.value.find(role => role.systemRole === 'member' && role.builtin)!
      return { member, current, next, management }
    })
    if (plans.some(({ member, current, next, management }) => {
      if (!member || member.status === 'disabled' || !canManageMember(member)) return true
      if (next.some(role => !role.enabled && !current.some(item => item.id === role.id))) return true
      if (current.filter(role => !next.includes(role)).some(role => !canAssignRole(role))) return true
      const existingManager = current.find(role => role.kind === 'management')
      const changeManager = existingManager?.id !== management.id || (managers.length > 0 && management.systemRole === 'department-admin'
        && (!sameIds(options.managementDepartmentIds, member.managementDepartmentIds ?? [])
          || !sameIds(options.assignableCapabilityIds, member.assignableCapabilityIds ?? [])))
      if (changeManager && (!isAdmin.value || member.id === platform.currentUser.id)) return true
      if (changeManager && management.systemRole === 'department-admin' && (!options.managementDepartmentIds.length
        || options.managementDepartmentIds.some(id => !departments.value.some(item => item.id === id))
        || options.assignableCapabilityIds.some(id => !findTarget(id)))) return true
      const effective = new Set(directCapabilityIds(member.id))
      for (const role of next.filter(role => role.enabled && role.kind === 'business')) {
        const previous = platform.organizationRoleAssignments.find(item => item.memberId === member.id && item.roleId === role.id)
        const grants = options.synchronize !== false && selectedRoles.some(item => item.id === role.id) ? role.capabilityIds : previous?.capabilityIds ?? []
        grants.forEach(id => effective.add(id))
      }
      if (capabilities.value.some(item => item.memberIds.includes(member.id) !== effective.has(item.id)
        && !canAssignCapability(item.id))) return true
      return false
    })) return false
    for (const { member, current, next, management } of plans) {
      if (!member) continue
      const existingManager = current.find(role => role.kind === 'management')
      if (existingManager?.id !== management.id || (managers.length && management.systemRole === 'department-admin'
        && (!sameIds(options.managementDepartmentIds, member.managementDepartmentIds ?? [])
          || !sameIds(options.assignableCapabilityIds, member.assignableCapabilityIds ?? [])))) {
        updateMemberRole(member.id, { role: management.systemRole!, managementDepartmentIds: options.managementDepartmentIds,
          assignableCapabilityIds: options.assignableCapabilityIds })
      }
      const before = current.map(role => role.name).join('、')
      const previous = platform.organizationRoleAssignments.filter(item => item.memberId === member.id)
      platform.organizationRoleAssignments = platform.organizationRoleAssignments.filter(item => item.memberId !== member.id)
      for (const role of next.filter(role => role.kind === 'business' || !role.builtin)) {
        const existing = previous.find(item => item.roleId === role.id)
        const synchronize = options.synchronize !== false && selectedRoles.some(item => item.id === role.id) && role.enabled
        platform.organizationRoleAssignments.push({ memberId: member.id, roleId: role.id,
          capabilityIds: synchronize ? [...role.capabilityIds] : [...(existing?.capabilityIds ?? [])],
          version: synchronize ? role.version : existing?.version ?? role.version })
      }
      reconcileMemberAccess(member.id)
      record('分配角色', { id: member.id, name: member.name, type: 'member' }, before, memberRoles(member.id).map(role => role.name).join('、'), [...new Set([...current, ...next].map(role => role.id))])
    }
    return true
  }

  function capabilityIssues(id: string, memberId?: string) {
    return dependencyIssues(id, nodes.value, connections.value, plugins.value, memberId)
  }

  function readyToEnable(target: Target) {
    return (target.kind === 'workbench' || versionsOf(target).length > 0) && capabilityIssues(target.item.id).length === 0
  }

  const capabilities = computed<AdminCapability[]>(() => targets.value.map(target => {
    const { id, allowedUserIds, publisherIds } = target.item
    const configuration = target.kind === 'assistant' || target.kind === 'employee'
      ? activeConfiguration(target.item)
      : target.kind === 'resource' ? activeConfiguration({ ...target.item, instructions: '', resourceIds: target.item.dependencyIds ?? [] }) : undefined
    const activity = filterUsage(usage.records, { period: '7d', ...(targetType(target) === '模型' ? { model: id } : { target: id }) }, platform.users)
    return {
      id,
      name: configuration?.name ?? target.item.name,
      description: configuration?.description ?? target.item.description,
      type: targetType(target),
      enabled: isEnabled(target),
      ready: readyToEnable(target),
      issues: capabilityIssues(id),
      memberIds: allowedUserIds ?? [],
      pairedId: pairedTarget(target)?.item.id,
      maintainerId: target.kind === 'workbench' ? undefined : maintainerOf(target) || undefined,
      configuratorIds: target.kind === 'employee' ? target.item.configuratorIds ?? [] : [],
      publisherIds: target.kind === 'workbench' ? [] : publisherIds ?? [],
      connectionId: capabilityConnectionId(target.item),
      dependencyIds: configuration?.resourceIds ?? target.item.dependencyIds ?? [],
      version: currentVersion(target),
      availableVersions: versionsOf(target),
      usage: activity.length ? { value: String(activity.length), label: targetType(target) === '模型' ? '模型请求' : '运行记录', detail: `${new Set(activity.map(item => item.userId)).size} 位成员 · ${activity.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0).toLocaleString('zh-CN')} Token（演示）` } : undefined,
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
    if (target.kind === 'workbench') return isAdmin.value
    const memberId = platform.currentUser.id
    return isAdmin.value || (target.kind === 'employee'
      ? configuresEmployee(target.item, memberId)
      : maintainerOf(target) === memberId)
  }

  function canPublishCapability(id: string) {
    const target = findTarget(id)
    if (target?.kind === 'workbench') return false
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
    } else if (target.kind === 'resource') {
      target.item.versionSnapshots ??= {}
      for (const version of versionsOf(target)) target.item.versionSnapshots[version] ??= { name: target.item.name, description: target.item.description, instructions: '', resourceIds: [...(target.item.dependencyIds ?? [])] }
    }
  }

  function prepareCapabilityEdit(id: string) {
    const target = findTarget(id)
    if (!target || !canConfigureCapability(id)) return false
    captureBaseline(target)
    return true
  }

  function record(action: string, target: string | { id: string; name: string; type: NonNullable<AdminChange['targetType']> }, before: string, after: string, relatedIds: string[] = []) {
    const objects = [
      ...platform.users.map(item => ({ ...item, type: 'member' as const })),
      ...roles.value.map(item => ({ ...item, type: 'role' as const })),
      ...targets.value.map(({ item }) => ({ ...item, type: 'capability' as const })),
      ...connections.value.map(item => ({ ...item, type: 'connection' as const })),
      ...plugins.value.map(item => ({ ...item, type: 'plugin' as const })),
      ...departments.value.map(item => ({ ...item, type: 'department' as const })),
    ]
    const label = typeof target === 'string' ? target : target.name
    const object = typeof target === 'string' ? objects.find(item => item.name === target) : target
    const entry: AdminChange = {
      id: makeId('admin-change'), at: nowIso(), actor: platform.currentUser.name, action, target: label, before, after, targetId: object?.id, targetType: object?.type, relatedIds,
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
    const previous = platform.users.filter(member => directCapabilityIds(member.id).includes(target.item.id)).map(member => member.id)
    if (!sameIds(previous, next)) {
      for (const member of platform.users) {
        if (previous.includes(member.id) === next.includes(member.id)) continue
        const direct = directCapabilityIds(member.id)
        platform.organizationDirectGrants[member.id] = next.includes(member.id)
          ? [...new Set([...direct, target.item.id])] : direct.filter(id => id !== target.item.id)
        reconcileMemberAccess(member.id)
      }
      record('分配使用权', { id: target.item.id, name: target.item.name, type: 'capability' }, memberLabel(previous), memberLabel(next), [...new Set([...previous, ...next])])
    }
  }

  function setCapabilityMembers(id: string, memberIds: string[], includePaired = false) {
    const target = findTarget(id)
    const next = [...new Set(memberIds)]
    if (!isAdmin.value || !target || !knownMembers(next)) return false

    const counterpart = includePaired ? pairedTarget(target) : undefined
    const previous = platform.users.filter(member => directCapabilityIds(member.id).includes(target.item.id)).map(member => member.id)
    const added = counterpart ? next.filter(memberId => !previous.includes(memberId)) : []
    updateCapabilityMembers(target, next)
    if (counterpart && added.length) {
      const pairedDirect = platform.users.filter(member => directCapabilityIds(member.id).includes(counterpart.item.id)).map(member => member.id)
      updateCapabilityMembers(counterpart, [...new Set([...pairedDirect, ...added])])
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
        record('调整配套关系', { id: target.item.id, name: target.item.name, type: 'capability' }, previousLabel, '无')
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
    record('调整配套关系', { id: target.item.id, name: target.item.name, type: 'capability' }, previous?.item.name ?? '无', next.item.name)
    return true
  }

  function canSetMemberCapabilities(memberId: string, capabilityIds: string[]) {
    const member = platform.users.find(user => user.id === memberId)
    if (!member || !canManageMember(member) || capabilityIds.some(id => !findTarget(id))) return false
    const requested = new Set(capabilityIds)
    return targets.value.every(({ item }) =>
      canAssignCapability(item.id) || directCapabilityIds(memberId).includes(item.id) === requested.has(item.id))
  }

  function applyMemberCapabilities(memberId: string, capabilityIds: string[]) {
    const previous = directCapabilityIds(memberId)
    platform.organizationDirectGrants[memberId] = [...new Set(capabilityIds)]
    reconcileMemberAccess(memberId)
    const names = (ids: string[]) => capabilities.value.filter(item => ids.includes(item.id)).map(item => item.name).join('、') || '无'
    if (!sameIds(previous, capabilityIds)) record('分配使用权', { id: memberId, name: memberLabel([memberId]), type: 'member' }, names(previous), names(capabilityIds), [...new Set([...previous, ...capabilityIds])])
  }

  function setMembersCapabilities(updates: { memberId: string; capabilityIds: string[] }[]) {
    if (!updates.every(({ memberId, capabilityIds }) => canSetMemberCapabilities(memberId, capabilityIds))) return false
    for (const { memberId, capabilityIds } of updates) applyMemberCapabilities(memberId, capabilityIds)
    return true
  }

  function setCapabilityMaintainer(id: string, memberId: string) {
    const target = findTarget(id)
    if (!isAdmin.value || !target || target.kind === 'workbench' || (memberId && !platform.users.some(member => member.id === memberId && member.status !== 'disabled'))) return false
    const previous = maintainerOf(target) ?? ''
    if (previous === memberId) return true
    if (target.kind === 'employee') {
      target.item.ownerId = memberId
      if (target.item.configuratorIds?.includes(memberId)) {
        target.item.configuratorIds = target.item.configuratorIds.filter(id => id !== memberId)
      }
    } else target.item.maintainerId = memberId || undefined
    record('调整负责人', { id: target.item.id, name: target.item.name, type: 'capability' }, memberLabel(previous ? [previous] : []), memberLabel(memberId ? [memberId] : []), [previous, memberId].filter(Boolean))
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
      record('调整共同负责人', { id: target.item.id, name: target.item.name, type: 'capability' }, memberLabel(previous), memberLabel(next), [...new Set([...previous, ...next])])
    }
    return true
  }

  function setCapabilityPublishers(id: string, memberIds: string[]) {
    const target = findTarget(id)
    const next = [...new Set(memberIds)]
    if (!isAdmin.value || !target || target.kind === 'workbench' || !knownMembers(next)) return false
    const previous = target.item.publisherIds ?? []
    if (next.some(id => !previous.includes(id) && !platform.users.some(member => member.id === id && member.status !== 'disabled'))) return false
    if (!sameIds(previous, next)) {
      target.item.publisherIds = next
      record('调整发布权', { id: target.item.id, name: target.item.name, type: 'capability' }, memberLabel(previous), memberLabel(next), [...new Set([...previous, ...next])])
    }
    return true
  }

  function setCapabilityPersonnel(id: string, draft: {
    memberIds: string[]; maintainerId: string; configuratorIds: string[]; publisherIds: string[]; includePair: boolean
  }) {
    const target = findTarget(id)
    if (!isAdmin.value || !target || !knownMembers(draft.memberIds)) return false
    if (target.kind === 'workbench' && (draft.maintainerId || draft.configuratorIds.length || draft.publisherIds.length)) return false
    const active = new Set(platform.users.filter(member => member.status !== 'disabled').map(member => member.id))
    const direct = platform.users.filter(member => directCapabilityIds(member.id).includes(id)).map(member => member.id)
    const previousOwner = target.kind === 'workbench' ? '' : maintainerOf(target) ?? ''
    const previousConfigurators = target.kind === 'employee' ? target.item.configuratorIds ?? [] : []
    const previousPublishers = target.kind === 'workbench' ? [] : target.item.publisherIds ?? []
    if (draft.memberIds.some(member => !direct.includes(member) && !active.has(member))
      || draft.maintainerId !== previousOwner && !!draft.maintainerId && !active.has(draft.maintainerId)
      || draft.configuratorIds.some(member => !previousConfigurators.includes(member) && !active.has(member))
      || draft.publisherIds.some(member => !previousPublishers.includes(member) && !active.has(member))) return false
    setCapabilityMembers(id, draft.memberIds, draft.includePair)
    if (draft.maintainerId !== previousOwner) setCapabilityMaintainer(id, draft.maintainerId)
    if (target.kind === 'employee' && !sameIds(previousConfigurators, draft.configuratorIds)) setEmployeeConfigurators(id, draft.configuratorIds)
    if (!sameIds(previousPublishers, draft.publisherIds)) setCapabilityPublishers(id, draft.publisherIds)
    return true
  }

  function setCapabilityEnabled(id: string, enabled: boolean) {
    const target = findTarget(id)
    if (!isAdmin.value || !target) return false
    if (isEnabled(target) === enabled) return true
    if (enabled && !readyToEnable(target)) return false
    if (enabled && target.kind !== 'workbench' && !currentVersion(target)) target.item.activeVersion = versionsOf(target).at(-1)
    switch (target.kind) {
      case 'assistant': target.item.enabled = enabled; break
      case 'employee': target.item.status = enabled ? 'published' : 'paused'; break
      case 'workbench': target.item.status = enabled ? 'active' : 'disabled'; break
      case 'resource': target.item.status = enabled ? '可用' : '停用'; break
    }
    record(enabled ? '启用能力' : '停用能力', { id: target.item.id, name: target.item.name, type: 'capability' }, enabled ? '未启用' : '已启用', enabled ? '已启用' : '已停用')
    return true
  }

  function publishCapability(id: string) {
    const target = findTarget(id)
    if (!target || !canPublishCapability(id)) return false
    const versions = versionsOf(target)
    const next = versions.length ? `1.${versions.length}.0` : '1.0.0'
    captureBaseline(target)
    if (target.kind === 'assistant' || target.kind === 'employee') captureCapabilityVersion(target.item, next)
    if (target.kind === 'resource') {
      target.item.versionSnapshots ??= {}
      target.item.versionSnapshots[next] = { name: target.item.name, description: target.item.description, instructions: '', resourceIds: [...(target.item.dependencyIds ?? [])] }
    }
    target.item.releases ??= []
    target.item.releases.push({ version: next, at: nowIso(), actor: platform.currentUser.name, notes: '发布已保存的配置' })
    target.item.activeVersion = currentVersion(target)
    target.item.availableVersions = [...versions, next]
    record('发布稳定版本', { id: target.item.id, name: target.item.name, type: 'capability' }, versions.at(-1) ?? '尚无稳定版本', next)
    return true
  }

  function setCapabilityVersion(id: string, version: string) {
    const target = findTarget(id)
    if (!isAdmin.value || !target || target.kind === 'workbench' || !versionsOf(target).includes(version)) return false
    const previous = currentVersion(target)
    if (version !== previous) {
      captureBaseline(target)
      const snapshot = target.item.versionSnapshots?.[version]
      if (isEnabled(target) && dependencyIssues(id, nodes.value.map(item => item.id === id && snapshot ? { ...item, dependencies: snapshot.resourceIds } : item), connections.value, plugins.value).length) return false
      target.item.activeVersion = version
      record('切换版本', { id: target.item.id, name: target.item.name, type: 'capability' }, previous ?? '未生效', version)
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
    record('调整接入', { id: target.item.id, name: target.item.name, type: 'capability' }, previous?.name ?? '未绑定', selected?.name ?? '未绑定')
    return true
  }

  function saveConnection(draft: ConnectionDraft, id?: string) {
    const name = draft.name.trim()
    const endpoint = draft.endpoint.trim()
    const current = connections.value.find(connection => connection.id === id)
    if (!canManagePlatform.value || !name || !validEndpoint(endpoint) || (id && !current)
      || !['模型', 'MCP', '业务 API', '业务系统', '企业消息'].includes(draft.type)
      || connections.value.some(connection => connection.id !== id && connection.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false
    const mode = draft.credentialMode ?? current?.credentialMode ?? 'environment'
    if (!['environment', 'organization', 'member', 'none'].includes(mode)) return false
    if (mode === 'member' && draft.credentialValue && !platform.users.some(member => member.id === draft.credentialMemberId && member.status !== 'disabled')) return false
    if (current) {
      if (current.type !== draft.type && targets.value.some(({ item }) => capabilityConnectionId(item) === current.id)) return false
      const previous = `${current.name} · ${current.type} · ${current.endpoint} · 凭据方式 ${current.credentialMode ?? 'environment'}`
      if (current.type !== draft.type || current.endpoint !== endpoint) {
        current.lastCheckedAt = undefined
        if (current.status !== '已停用') current.status = '待检测'
      }
      const credentialChanged = (current.credentialMode ?? 'environment') !== mode || !!draft.credentialValue?.trim()
      Object.assign(current, { name, type: draft.type, endpoint })
      applyCredential(current, draft, mode)
      if (credentialChanged && current.status !== '已停用') { current.status = '待检测'; current.lastError = undefined }
      record('更新连接', { id: current.id, name, type: 'connection' }, previous, `${name} · ${draft.type} · ${endpoint} · 凭据方式 ${mode}${credentialChanged ? ' · 凭据配置已更新' : ''}`)
    } else {
      const connection: AdminConnection = { id: makeId('connection'), name, type: draft.type, endpoint, status: '待检测' }
      applyCredential(connection, draft, mode)
      platform.organizationConnections.push(connection)
      record('新增连接', { id: connection.id, name, type: 'connection' }, '无', `${draft.type} · ${endpoint}`)
    }
    return true
  }

  function applyCredential(connection: AdminConnection, draft: ConnectionDraft, mode: NonNullable<AdminConnection['credentialMode']>) {
    if (connection.credentialMode !== mode) { delete connection.credentialRef; delete connection.memberCredentialRefs }
    connection.credentialMode = mode
    // Only a synthetic reference is retained. The prototype never persists the input value.
    if (draft.credentialValue?.trim() && mode === 'organization') connection.credentialRef = makeId('demo-credential')
    if (draft.credentialValue?.trim() && mode === 'member' && draft.credentialMemberId) {
      connection.memberCredentialRefs ??= {}
      connection.memberCredentialRefs[draft.credentialMemberId] = makeId('demo-member-credential')
    }
  }

  function testConnection(id: string, simulateFailure = false) {
    const connection = connections.value.find(item => item.id === id)
    if (!canManagePlatform.value || !connection || connection.status === '已停用' || !validEndpoint(connection.endpoint)) return false
    const previous = connection.status
    const missing = connection.credentialMode === 'organization' && !connection.credentialRef
    connection.lastCheckedAt = nowIso()
    connection.status = simulateFailure || missing ? '异常' : '正常'
    connection.lastError = missing ? '组织凭据缺失，请配置演示凭据后重新检测。' : simulateFailure ? '连接超时（演示），请检查地址与服务后重新检测。' : undefined
    connection.checks ??= []
    connection.checks.unshift({ at: connection.lastCheckedAt, status: connection.status, message: connection.lastError ?? (connection.credentialMode === 'member' ? '服务连通；实际调用须单独核对成员凭据。' : '模拟连通检测通过。') })
    record('模拟检测连接', { id: connection.id, name: connection.name, type: 'connection' }, previous, connection.status + (connection.lastError ? ' · ' + connection.lastError : ''))
    return true
  }

  function setConnectionEnabled(id: string, enabled: boolean) {
    const connection = connections.value.find(item => item.id === id)
    if (!canManagePlatform.value || !connection) return false
    const previous = connection.status
    if (enabled === (previous !== '已停用')) return true
    connection.status = enabled ? '待检测' : '已停用'
    record(enabled ? '启用连接' : '停用连接', { id: connection.id, name: connection.name, type: 'connection' }, previous, connection.status)
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
      if (before !== after) record('更新部门', { id: current.id, name, type: 'department' }, before, after)
    } else {
      const department = { ...fields, id: makeId('department') }
      departments.value.push(department)
      record('新增部门', { id: department.id, name, type: 'department' }, '无', departmentSummary(department))
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
    platform.organizationDirectGrants[member.id] = []
    record('新增成员', { id: member.id, name: member.name, type: 'member' }, '无', memberSummary(member))
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
    if (previous !== next) record('更新成员', { id: member.id, name: member.name, type: 'member' }, previous, next)
    return true
  }

  function clearDepartmentLeader(member: User) {
    const department = departments.value.find(item => item.id === member.departmentId && item.leaderId === member.id)
    if (!department) return
    const before = departmentSummary(department)
    delete department.leaderId
    record('调整部门负责人', { id: department.id, name: department.name, type: 'department' }, before, departmentSummary(department))
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
    if (previous !== next) record('调整管理角色', { id: member.id, name: member.name, type: 'member' }, previous, next)
    return true
  }

  function transferMember(id: string, draft: MemberTransfer) {
    const member = platform.users.find(user => user.id === id)
    const department = departments.value.find(item => item.id === draft.departmentId)
    if (!isAdmin.value || !member || !department || department.id === member.departmentId || member.status === 'disabled') return false
    const successor = platform.users.find(user => user.id === draft.successorId && user.id !== id && user.status !== 'disabled')
    if (draft.handoverIds.length && !successor) return false
    const granted = capabilities.value.filter(item => directCapabilityIds(id).includes(item.id))
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
    record('调岗交接', { id: member.id, name: member.name, type: 'member' }, before, details.join(' · '))
    return true
  }

  const adminHome = computed(() => canViewRuns.value ? '/admin/overview' : canManagePlatform.value ? '/admin/plugins' : '/admin/members')
  function canVisitAdmin(name: string) {
    if (isAdmin.value) return true
    if (['admin-overview', 'admin-activity', 'admin-usage', 'admin-scenario-runs'].includes(name)) return canViewRuns.value
    if (['admin-connections', 'admin-plugins'].includes(name)) return canManagePlatform.value
    if (name === 'admin-changes') return canViewRuns.value || canManagePlatform.value
    if (['admin-workbenches', 'admin-resources', 'admin-employees'].includes(name)) return canViewCapabilities.value
    if (['admin-members', 'admin-departments'].includes(name)) return managedDepartmentIds.value.size > 0
    return false
  }
  const visibleChanges = computed(() => changes.value.filter(change => isAdmin.value
    || (canViewRuns.value || canManagePlatform.value) && ['capability', 'connection', 'plugin'].includes(change.targetType ?? '')
    || managedDepartmentIds.value.size > 0 && change.targetType === 'member' && visibleMembers.value.some(member => member.id === change.targetId)))

  function affectedByPlugin(id: string) {
    const ids = new Set([id])
    for (const pluginId of ids) for (const item of plugins.value) if (item.dependencyIds.includes(pluginId)) ids.add(item.id)
    const capabilityIds = new Set(plugins.value.filter(item => ids.has(item.id)).flatMap(item => item.capabilityIds))
    for (const capabilityId of capabilityIds) for (const item of capabilities.value) if (item.dependencyIds.includes(capabilityId)) capabilityIds.add(item.id)
    return capabilities.value.filter(item => capabilityIds.has(item.id))
  }
  function affectedByCapability(id: string) {
    const ids = new Set([id])
    for (const dependency of ids) for (const item of capabilities.value) if (item.dependencyIds.includes(dependency)) ids.add(item.id)
    return capabilities.value.filter(item => ids.has(item.id))
  }
  function affectedByConnection(id: string) {
    const ids = new Set(capabilities.value.filter(item => item.connectionId === id).map(item => item.id))
    for (const dependency of ids) for (const item of capabilities.value) if (item.dependencyIds.includes(dependency)) ids.add(item.id)
    return capabilities.value.filter(item => ids.has(item.id))
  }
  function savePlugin(draft: Pick<AdminPlugin, 'name' | 'description' | 'version' | 'dependencyIds' | 'capabilityIds'>) {
    if (!canManagePlatform.value || !draft.name.trim() || !/^\d+\.\d+\.\d+$/.test(draft.version)
      || plugins.value.some(item => item.name === draft.name.trim())
      || draft.dependencyIds.some(id => !plugins.value.some(item => item.id === id))
      || draft.capabilityIds.some(id => !findTarget(id))) return false
    const item: AdminPlugin = { ...draft, id: makeId('plugin'), name: draft.name.trim(), enabled: false, versions: [draft.version], loadStatus: '未加载' }
    plugins.value.push(item)
    record('接入演示插件', { id: item.id, name: item.name, type: 'plugin' }, '无', item.version)
    return true
  }
  function setPluginEnabled(id: string, enabled: boolean) {
    const item = plugins.value.find(item => item.id === id)
    if (!canManagePlatform.value || !item) return false
    const issues = item.dependencyIds.flatMap(dependency => pluginIssues(dependency, plugins.value))
    if (enabled && issues.length) return false
    item.enabled = enabled
    item.loadStatus = '未加载'
    item.lastError = undefined
    record(enabled ? '启用插件' : '停用插件', { id: item.id, name: item.name, type: 'plugin' }, enabled ? '已停用' : '已启用', enabled ? '待检查加载' : '已停用')
    return true
  }
  function checkPlugin(id: string, simulateFailure = false) {
    const item = plugins.value.find(item => item.id === id)
    if (!canManagePlatform.value || !item?.enabled) return false
    const issues = item.dependencyIds.flatMap(dependency => pluginIssues(dependency, plugins.value))
    item.loadStatus = simulateFailure || issues.length ? '加载失败' : '已加载'
    item.lastError = issues.join('；') || (simulateFailure ? '插件入口加载失败（演示），请核对版本与依赖。' : undefined)
    item.checkedAt = nowIso()
    record('模拟加载插件', { id: item.id, name: item.name, type: 'plugin' }, item.version, item.loadStatus + (item.lastError ? ' · ' + item.lastError : ''))
    return true
  }
  function setPluginVersion(id: string, version: string) {
    const item = plugins.value.find(item => item.id === id)
    if (!canManagePlatform.value || !item?.versions.includes(version)) return false
    const previous = item.version
    item.version = version
    item.loadStatus = '未加载'
    item.lastError = undefined
    record('切换插件版本', { id: item.id, name: item.name, type: 'plugin' }, previous, version)
    return true
  }
  function saveWorkbenchConfiguration(id: string, draft: { name: string; description: string; dependencyIds: string[] }) {
    const item = platform.workbenches.find(item => item.id === id)
    if (!item || !canConfigureCapability(id) || !draft.name.trim()
      || draft.dependencyIds.some(dependency => !platform.resources.some(resource => resource.scope === 'organization' && resource.id === dependency))) return false
    if (item.status === 'active' && !sameIds(item.dependencyIds ?? [], draft.dependencyIds)
      && workbenchConfigurationIssues(id, draft.dependencyIds).length) return false
    const summary = (name: string, description: string, ids: string[]) => `${name}；${description}；依赖：${ids.map(id => platform.resources.find(resource => resource.id === id)?.name ?? id).join('、') || '无'}`
    const before = summary(item.name, item.description, item.dependencyIds ?? [])
    item.name = draft.name.trim()
    item.description = draft.description.trim()
    item.dependencyIds = [...new Set(draft.dependencyIds)]
    record('保存工作台配置', { id: item.id, name: item.name, type: 'capability' }, before, summary(item.name, item.description, item.dependencyIds))
    return true
  }

  function workbenchConfigurationIssues(id: string, dependencyIds: string[]) {
    return dependencyIssues(id, nodes.value.map(item => item.id === id ? { ...item, dependencies: dependencyIds } : item), connections.value, plugins.value)
  }

  return {
    adminHome, canVisitAdmin, canViewRuns, canManagePlatform, canViewCapabilities, visibleChanges, capabilityIssues, previewRoleGrants,
    plugins, affectedByPlugin, affectedByCapability, affectedByConnection, savePlugin, setPluginEnabled, checkPlugin, setPluginVersion, saveWorkbenchConfiguration, workbenchConfigurationIssues,
    capabilities, connections, changes, myEmployeeMaintenance,
    canConfigureCapability, canPublishCapability, employeeResponsibles, prepareCapabilityEdit, setCapabilityPublishers, publishCapability,
    setEmployeeConfigurators,
    setCapabilityMembers, setCapabilityPersonnel, setCapabilityPair, setMembersCapabilities, setCapabilityEnabled, setCapabilityVersion, setCapabilityMaintainer,
    setCapabilityConnection, saveConnection, testConnection, setConnectionEnabled, createMember, updateMember,
    departments, visibleDepartments, visibleMembers, isAdmin, canOpenAdmin, canManageMember, canAssignCapability,
    saveDepartment, updateMemberRole, transferMember,
    roles, memberRoles, grantSources, directCapabilityIds, canAssignRole, saveRole, setRoleEnabled, assignRoles,
  }
})
