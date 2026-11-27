import { capabilityNodes, dependencyIssues } from '@/adminDependencies'
import { useAdminUsageStore } from './adminUsage'
import { computed, reactive, shallowRef, toRefs, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  ET_DESIGN_ASSISTANT_ID, ET_DESIGN_WORKBENCH_ID,
  makeSampleEtDesignAssistant, makeSampleSharedAssistants, makeSampleState,
} from './sample'
import { COST_WORKBENCH_ID, TRADE_WORKBENCH_ID } from './workbenchScenarios'
import { TENDER_WORKBENCH_ID } from './tenderSample'
import { DESIGN_STUDIO_WORKBENCH_ID } from './designStudio'
import { PROJECT_WORKBENCH_ID } from './projectWorkbench'
import { draftOfficeDocument } from '@/officeDocument'
import { orderConversationsByActivity } from '@/conversationOrder'
import { conversationDirectoryDisplay, workspaceFolderTree, type ResolvedWorkspaceDirectory, type WorkspaceDirectory } from '@/workspaceDirectory'
import { type OrganizationRole, type RoleAssignment } from './organizationRoles'
import { etWorkspaceId, useSharedWorkspacesStore } from './sharedWorkspaces'
import {
  activeCapabilityVersion, activeConfiguration, capabilityVersions, captureCapabilityVersion,
  type AdminPlugin, type AdminChange, type AdminConnection, type OrganizationCapabilityFields, type OrganizationDepartment,
  type organizationRoleLabels,
} from './organizationAdminData'

export interface User {
  id: string
  name: string
  role: keyof typeof organizationRoleLabels
  department: string
  departmentId?: string
  managementDepartmentIds?: string[]
  assignableCapabilityIds?: string[]
  title: string
  initials: string
  status?: 'active' | 'disabled'
}

export interface Assistant extends OrganizationCapabilityFields {
  id: string
  userId: string
  scope?: 'personal' | 'organization'
  allowedUserIds?: string[]
  name: string
  description: string
  instructions: string
  resourceIds: string[]
  enabled?: boolean
}

export interface AssistantDraft {
  name: string
  description: string
  instructions: string
  resourceIds: string[]
  allowedUserIds: string[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  references?: string[]
  taskId?: string
  taskProposal?: EmployeeTaskDraft
  artifactName?: string
  artifactContent?: string
  automationTaskId?: string
  automationRequest?: string
}

type AutomationReply = Pick<Message, 'text' | 'automationTaskId' | 'automationRequest'>

export interface EtDrawingContext {
  drawingName: string
  reviewVersion?: 'V1' | 'V2'
  scope: '当前框选范围' | '整张图纸预览'
  entityCount: number
  layerCount: number
  layers: string
  types: string
  dimensions: string
}

export interface Conversation {
  id: string
  userId: string
  title: string
  readonly assistantId: string
  readonly directory?: WorkspaceDirectory
  readonly etDrawing?: EtDrawingContext
  archived?: boolean
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export interface WorkspaceFolder {
  id: string
  userId: string
  name: string
  updatedAt: string
  parentId?: string
}

export interface WorkspaceFile {
  id: string
  userId: string
  name: string
  type: 'document' | 'sheet' | 'pdf' | 'text' | 'image'
  size: number
  content: string
  updatedAt: string
  source: 'upload' | 'assistant' | 'sample'
  folderId?: string
  dataUrl?: string
}

export type WorkspaceEntryKind = 'file' | 'folder'

interface ArtifactSaveOptions {
  name: string
  content: string
  folderId?: string
}

export interface Resource extends OrganizationCapabilityFields {
  id: string
  name: string
  type: '模型' | '技能' | 'MCP' | '知识' | '工具'
  description: string
  scope: 'personal' | 'organization' | 'shared'
  ownerId: string
  allowedUserIds: string[]
  status: '可用' | '未连接' | '停用'
}

export interface Employee extends OrganizationCapabilityFields {
  id: string
  name: string
  role: string
  description: string
  instructions: string
  ownerId: string
  configuratorIds?: string[]
  status: 'draft' | 'published' | 'paused'
  allowedUserIds: string[]
  resourceIds: string[]
  color: string
  trainingNotes: string[]
}

export interface EmployeeThread {
  id: string
  userId: string
  employeeId: string
  messages: Message[]
  updatedAt: string
}

export interface Task {
  id: string
  userId: string
  employeeId: string
  threadId: string
  title: string
  request?: string
  deliverable?: string
  createdAt?: string
  status: '进行中' | '待补充' | '已完成'
  progress: number
  detail: string
  result?: string
  updatedAt: string
}

export interface EmployeeTaskDraft {
  title: string
  request: string
  deliverable?: string
}

export interface WorkbenchRecord {
  id: string
  title: string
  category: string
  status: '待处理' | '处理中' | '已完成'
  updatedAt: string
  detail: string
}

export interface Workbench extends OrganizationCapabilityFields {
  id: string
  name: string
  description: string
  status: 'active' | 'disabled'
  allowedUserIds: string[]
  pairedAssistantId?: string | null
  records: WorkbenchRecord[]
  icon: string
  color: string
}

export interface PlatformState {
  currentUserId: string
  users: User[]
  assistantSharingVersion: number
  assistants: Assistant[]
  conversations: Conversation[]
  files: WorkspaceFile[]
  workspaceFolders: WorkspaceFolder[]
  resources: Resource[]
  employees: Employee[]
  threads: EmployeeThread[]
  tasks: Task[]
  workbenches: Workbench[]
  organizationPlugins: AdminPlugin[]
  organizationConnections: AdminConnection[]
  organizationChanges: AdminChange[]
  organizationDepartments: OrganizationDepartment[]
  organizationRoles: OrganizationRole[]
  organizationRoleAssignments: RoleAssignment[]
  organizationDirectGrants: Record<string, string[]>
}

const storageKey = 'ai-worker-platform-prototype-v2'
const retiredWorkbenchIds = new Set(['workbench-service', 'workbench-procurement', 'workbench-quality'])
export const nowIso = () => new Date().toISOString()
export const generalAssistantName = '通用助理'
export const makeId = (prefix = 'item') => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

function validWorkspaceEntryName(name: string) {
  return !!name && !/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) && !name.endsWith('.')
    && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)
}

function persistState(state: PlatformState) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // The open session stays usable when storage is unavailable or quota is exhausted.
  }
}

function migrateEtDesignPair(state: PlatformState, workbench: Workbench | undefined) {
  if (!workbench) return false
  // Null is a saved choice to leave the workbench unpaired.
  const pair = workbench.pairedAssistantId
  if (pair !== undefined && pair !== ET_DESIGN_ASSISTANT_ID) return false

  const assistant = state.assistants.find(item => item.id === ET_DESIGN_ASSISTANT_ID)
  const alreadyPaired = state.workbenches.some(item => item !== workbench && item.pairedAssistantId === ET_DESIGN_ASSISTANT_ID)
  if (alreadyPaired || (assistant && assistant.scope !== 'organization')) return false
  if (pair === ET_DESIGN_ASSISTANT_ID && assistant) return false

  if (!assistant) state.assistants.push({ ...makeSampleEtDesignAssistant(), allowedUserIds: [] })
  workbench.pairedAssistantId = ET_DESIGN_ASSISTANT_ID
  return true
}

function migrateWorkbenchConfiguration(item: Workbench) {
  const snapshot = item.versionSnapshots?.[activeCapabilityVersion(item) ?? '']
  const changed = ['activeVersion', 'availableVersions', 'versionSnapshots', 'releases'].some(key => key in item)
  if (snapshot) {
    item.name = snapshot.name
    item.description = snapshot.description
    item.dependencyIds = [...snapshot.resourceIds]
  }
  delete item.activeVersion
  delete item.availableVersions
  delete item.versionSnapshots
  delete item.releases
  return changed
}

function migrateDepartmentMembership(state: PlatformState) {
  let changed = false
  for (const user of state.users) {
    let department = state.organizationDepartments.find(item => item.id === user.departmentId)
      ?? state.organizationDepartments.find(item => item.name === user.department)
    if (!department && user.department) {
      department = { id: makeId('department'), name: user.department }
      state.organizationDepartments.push(department)
    }
    if (!department || (user.departmentId === department.id && user.department === department.name)) continue
    user.departmentId = department.id
    user.department = department.name
    changed = true
  }
  for (const department of state.organizationDepartments) {
    if (department.leaderId && !state.users.some(user =>
      user.id === department.leaderId && user.departmentId === department.id && user.status !== 'disabled')) {
      delete department.leaderId
      changed = true
    }
  }
  return changed
}

function migrateSampleConversationTimes(conversations: Conversation[], examples: Conversation[]) {
  // The original sample messages all used the same timestamp.
  const oldSampleTime = '2026-11-11T09:30:00+08:00'
  let changed = false
  for (const example of examples) {
    const saved = conversations.find(chat => chat.id === example.id && chat.userId === example.userId)
    if (!saved) continue
    for (const message of example.messages) {
      if (message.createdAt === oldSampleTime) continue
      const old = saved.messages.find(item => item.id === message.id && item.createdAt === oldSampleTime)
      if (!old) continue
      old.createdAt = message.createdAt
      changed = true
    }
  }
  return changed
}

function loadState(): PlatformState {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<PlatformState>
      const seed = makeSampleState()
      if (Array.isArray(parsed.users) && parsed.users.length) {
        const state = { ...seed, ...parsed }
        state.conversations = Array.isArray(parsed.conversations) ? parsed.conversations : seed.conversations
        const migratedConversationTimes = migrateSampleConversationTimes(state.conversations, seed.conversations)
        state.organizationDepartments = Array.isArray(parsed.organizationDepartments) ? parsed.organizationDepartments : seed.organizationDepartments
        state.organizationRoles = Array.isArray(parsed.organizationRoles) ? parsed.organizationRoles : seed.organizationRoles
        state.organizationRoleAssignments = Array.isArray(parsed.organizationRoleAssignments) ? parsed.organizationRoleAssignments : []
        state.organizationDirectGrants = parsed.organizationDirectGrants && typeof parsed.organizationDirectGrants === 'object' ? parsed.organizationDirectGrants : {}
        state.organizationPlugins = Array.isArray(parsed.organizationPlugins) ? parsed.organizationPlugins : seed.organizationPlugins
        for (const role of seed.organizationRoles.filter(item => item.builtin)) {
          const existing = state.organizationRoles.find(item => item.id === role.id)
          if (existing) Object.assign(existing, { name: role.name, description: role.description })
          else state.organizationRoles.push(role)
        }
        if (state.users.find(user => user.id === 'lin')?.title === '组织管理员') state.users.find(user => user.id === 'lin')!.title = '系统管理员'
        const migratedDepartments = migrateDepartmentMembership(state)
        const userIds = new Set(state.users.map(user => user.id))
        const savedWorkbenches = Array.isArray(parsed.workbenches) ? parsed.workbenches : seed.workbenches
        const existingWorkbenches = savedWorkbenches.filter(item => !retiredWorkbenchIds.has(item.id))
        const removedWorkbenches = existingWorkbenches.length < savedWorkbenches.length
        const workbenchIds = new Set(existingWorkbenches.map(item => item.id))
        const newWorkbenches = seed.workbenches
          .filter(item => [COST_WORKBENCH_ID, TENDER_WORKBENCH_ID, TRADE_WORKBENCH_ID, DESIGN_STUDIO_WORKBENCH_ID, PROJECT_WORKBENCH_ID].includes(item.id) && !workbenchIds.has(item.id))
          .map(item => ({ ...item, allowedUserIds: item.allowedUserIds.filter(id => userIds.has(id)) }))
        state.workbenches = [...existingWorkbenches, ...newWorkbenches]
        let migratedWorkbenchConfiguration = false
        for (const item of state.workbenches) migratedWorkbenchConfiguration = migrateWorkbenchConfiguration(item) || migratedWorkbenchConfiguration
        const designWorkbench = state.workbenches.find(item => item.id === ET_DESIGN_WORKBENCH_ID)
        if (!Array.isArray(parsed.assistants)) {
          state.assistants = seed.assistants.filter(item =>
            item.scope !== 'organization' && !item.allowedUserIds?.length && userIds.has(item.userId))
        }
        const migrateAssistantSharing = typeof parsed.assistantSharingVersion !== 'number'
          || parsed.assistantSharingVersion < seed.assistantSharingVersion
        if (migrateAssistantSharing) {
          const existingIds = new Set(state.assistants.map(assistant => assistant.id))
          const examples = makeSampleSharedAssistants()
            .filter(assistant => !existingIds.has(assistant.id)
              && (assistant.scope === 'organization' || userIds.has(assistant.userId)))
            .map(assistant => ({
              ...assistant,
              allowedUserIds: assistant.allowedUserIds?.filter(id => userIds.has(id)) ?? [],
            }))
          state.assistants = [...state.assistants, ...examples]
          state.assistantSharingVersion = seed.assistantSharingVersion
        }
        if (!Array.isArray(parsed.workspaceFolders)) {
          state.workspaceFolders = seed.workspaceFolders
          state.files = (Array.isArray(parsed.files) ? parsed.files : seed.files).map(file => {
            if (file.folderId !== undefined) return file
            const example = seed.files.find(item => item.id === file.id && item.userId === file.userId && item.source === file.source)
            return example?.folderId ? { ...file, folderId: example.folderId } : file
          })
        }
        const migratedEtPair = migrateEtDesignPair(state, designWorkbench)
        if (migrateAssistantSharing || removedWorkbenches || newWorkbenches.length || migratedEtPair || migratedDepartments || migratedWorkbenchConfiguration || migratedConversationTimes) persistState(state)
        return state
      }
    }
  } catch {
    // Storage may be unavailable in a private browser session.
  }
  return makeSampleState()
}

function recentFirst<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

function newMessage(role: Message['role'], text: string, extra: Partial<Message> = {}): Message {
  return { id: makeId('message'), role, text, createdAt: nowIso(), ...extra }
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function draftEtDrawingReply(prompt: string, drawing: EtDrawingContext) {
  const version = drawing.reviewVersion ? `（${etWorkspaceId} · ${drawing.reviewVersion}）` : ''
  const overview = `《${drawing.drawingName}》${version}的${drawing.scope}包含 ${drawing.entityCount} 个可预览实体，分布于 ${drawing.layerCount} 个图层。\n\n图层：${drawing.layers}。\n实体类型：${drawing.types}。\n范围宽高：${drawing.dimensions}。`
  const checklist = /检查|交付|出图/.test(prompt)
  const text = checklist ? overview + '\n\n1. 核对所列图层的命名、可见性和打印设置。\n2. 对照原图复核关键尺寸、单位、标注及版本。\n3. 导出后重新打开文件，确认交付内容和选区一致。' : overview
  return { text, artifactName: checklist ? '图纸检查清单.md' : '图纸范围摘要.md', artifactContent: text }
}

function draftReply(prompt: string, name: string, sourceNames: string[], resourceNames: string[]) {
  const context = sourceNames.length ? `\n\n参考资料：${sourceNames.join('、')}` : ''
  const abilities = resourceNames.length ? `\n已选用的配置资源：${resourceNames.join('、')}` : ''
  if (/会议|纪要|周会/.test(prompt)) {
    return {
      text: `我整理了一份会议纪要草稿。\n\n会议结论\n• 优先处理本周交付范围内的问题，新增需求单独确认。\n• 由各负责人核对未完成事项和依赖。\n\n后续行动\n1. 更新交付清单，标记负责人和预计完成时间。\n2. 汇总待确认的风险，约定下一次同步时间。\n3. 会后补充实际参会人、具体结论和截止日期。${context}${abilities}`,
      artifactName: '会议纪要草稿.md',
    }
  }
  if (/周报|汇报|总结|分析|报告/.test(prompt)) {
    return {
      text: `我按「进展、问题、下一步」整理了一份工作报告草稿。\n\n已完成\n• 核对本期工作范围，梳理已交付事项和对应材料。\n\n需要关注\n• 补齐关键指标和业务口径，确认待处理事项的负责人。\n\n下一步\n1. 根据真实进度补充数字和完成日期。\n2. 对需要协调的事项明确处理顺序。\n3. 将确认后的版本保存为工作产物。${context}${abilities}`,
      artifactName: '工作报告草稿.md',
    }
  }
  if (/计划|拆解|安排|检查清单/.test(prompt)) {
    return {
      text: `可以按三个阶段推进这项工作。\n\n1. 明确目标：确定需要交付的结果、范围与完成时间。\n2. 准备执行：收集已有资料，把关键事项拆成可验收的步骤。\n3. 检查交付：核对结果和遗留问题，确认后续负责人。\n\n你可以补充截止日期，我再把这些步骤排成具体的时间表。${context}${abilities}`,
      artifactName: '行动计划.md',
    }
  }
  if (/邮件|回复|撰写|起草/.test(prompt)) {
    return {
      text: `这里是一份可以继续调整的初稿。\n\n您好，\n\n关于本次事项，我们已开始核对相关资料，并会在确认处理方案后同步进展。若有需要补充的信息，也欢迎直接回复。\n\n感谢配合。\n\n发送前建议补充事项名称、具体结论及预计回复时间。${context}${abilities}`,
      artifactName: '沟通初稿.md',
    }
  }
  const excerpt = prompt.replace(/\s+/g, ' ').slice(0, 55)
  return {
    text: `${name}已收到你的需求「${excerpt}${prompt.length > 55 ? '…' : ''}」。\n\n我先把这项工作拆成三步：\n1. 明确目标和需要交付的形式。\n2. 整理可用材料，列出需要核对的重点。\n3. 输出可继续修改的初稿，并标记待确认事项。\n\n你可以补充具体背景或文件，我会据此继续整理。${context}${abilities}`,
    artifactName: '工作整理.md',
  }
}

export const usePlatformStore = defineStore('platform', () => {
  const state = reactive(loadState())
  const etDrawingLaunch = shallowRef<{ id: string; userId: string; context: EtDrawingContext }>()
  const pendingConversations = new Set<string>()
  const pendingThreads = new Set<string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const currentUser = computed(() => state.users.find(user => user.id === state.currentUserId && user.status !== 'disabled')
    ?? state.users.find(user => user.status !== 'disabled') ?? state.users[0]!)
  const nodes = computed(() => capabilityNodes(state))
  const isReady = (id: string) => !dependencyIssues(id, nodes.value, state.organizationConnections, state.organizationPlugins, currentUser.value.id).length
  const myAssistants = computed(() => state.assistants.filter(item => item.scope !== 'organization' && item.userId === currentUser.value.id))
  const sharedAssistants = computed(() => state.assistants.filter(item =>
    (item.scope === 'organization' || item.userId !== currentUser.value.id)
    && (item.scope !== 'organization' || item.enabled !== false)
    && item.allowedUserIds?.includes(currentUser.value.id))
    .map(item => item.scope === 'organization' ? activeConfiguration(item) : item))
  const organizationAssistants = computed(() => state.assistants.filter(item => item.scope === 'organization'
    && (currentUser.value.role === 'admin' || item.maintainerId === currentUser.value.id)))
  const visibleAssistants = computed<Assistant[]>(() => [
    { id: 'default', userId: currentUser.value.id, name: generalAssistantName, description: '适用于日常办公和通用工作', instructions: '', resourceIds: [] },
    ...myAssistants.value,
    ...sharedAssistants.value,
  ])
  const myFiles = computed(() => recentFirst(state.files.filter(file => file.userId === currentUser.value.id)))
  const myFolders = computed(() => recentFirst(state.workspaceFolders.filter(folder => folder.userId === currentUser.value.id)))
  const visibleResources = computed(() => state.resources
    .filter(item => item.ownerId === currentUser.value.id || (item.scope !== 'personal' && item.allowedUserIds.includes(currentUser.value.id)))
    .map(item => {
      const snapshot = item.scope === 'organization' ? item.versionSnapshots?.[activeCapabilityVersion(item) ?? ''] : undefined
      const resource = snapshot ? { ...item, name: snapshot.name, description: snapshot.description } : item
      return item.scope === 'organization' && item.status === '可用' && !isReady(item.id)
        ? { ...resource, status: '未连接' as const } : resource
    }))
  const personalConversations = computed(() => orderConversationsByActivity(state.conversations.filter(item => item.userId === currentUser.value.id)))
  const visibleEmployees = computed(() => state.employees
    .filter(item => item.status === 'published'
      && item.allowedUserIds.includes(currentUser.value.id)
      && capabilityVersions(item).some(version => version === activeCapabilityVersion(item)))
    .map(activeConfiguration))
  const employeeThreads = computed(() => recentFirst(state.threads.filter(item => item.userId === currentUser.value.id && visibleEmployees.value.some(employee => employee.id === item.employeeId))))
  const myTasks = computed(() => recentFirst(state.tasks.filter(item => item.userId === currentUser.value.id && visibleEmployees.value.some(employee => employee.id === item.employeeId))))
  const visibleWorkbenches = computed(() => state.workbenches.filter(item => item.status === 'active'
    && item.allowedUserIds.includes(currentUser.value.id)
    && isReady(item.id)))

  watch(state, () => persistState(state), { deep: true })

  function setCurrentUser(id: string) {
    if (state.users.some(user => user.id === id && user.status !== 'disabled')) state.currentUserId = id
  }

  function savePersonalResource(draft: Pick<Resource, 'name' | 'description' | 'type' | 'status' | 'allowedUserIds'>, id?: string) {
    const ownerId = currentUser.value.id
    const existing = state.resources.find(item => item.id === id && item.scope !== 'organization' && item.ownerId === ownerId)
    const name = draft.name.trim()
    const allowedUserIds = [...new Set(draft.allowedUserIds)].filter(userId => userId !== ownerId)
    if (!name || (id !== undefined && !existing)
      || allowedUserIds.some(userId => !state.users.some(user => user.id === userId && user.status !== 'disabled'))) return
    const scope = allowedUserIds.length ? 'shared' : 'personal'
    const values = { name, description: draft.description.trim(), type: draft.type, status: draft.status, allowedUserIds, scope, ownerId } as const
    if (existing) return Object.assign(existing, values)
    const resource: Resource = { id: makeId('resource'), ...values }
    state.resources.push(resource)
    return resource
  }

  function assistantResourceBindings(id: string) {
    const assistant = visibleAssistants.value.find(item => item.id === id)
    if (!assistant) return []
    const visible = new Map(visibleResources.value.map(resource => [resource.id, resource]))
    const types = new Map(state.resources.map(resource => [resource.id, resource.type]))
    return assistant.resourceIds.map(resourceId => {
      const resource = visible.get(resourceId)
      const type = types.get(resourceId)
      const status = resource?.status === '可用' ? '可用' : !resource && type ? '未授权' : '已失效'
      return { resource, type, status }
    })
  }

  function copySharedAssistant(id: string) {
    const source = sharedAssistants.value.find(item => item.id === id)
    if (!source) return
    const resourceIds = assistantResourceBindings(id).flatMap(({ resource, status }) => resource && status === '可用' ? [resource.id] : [])
    return savePersonalAssistant({
      name: source.name.slice(0, 32) + '（副本）', description: source.description,
      instructions: source.instructions, resourceIds, allowedUserIds: [],
    })
  }

  function saveAssistant(draft: AssistantDraft, scope: NonNullable<Assistant['scope']>, id?: string): Assistant | undefined {
    const isOrganization = scope === 'organization'
    if (isOrganization && id === undefined && currentUser.value.role !== 'admin') return
    const editable = isOrganization ? organizationAssistants.value : myAssistants.value
    const existing = id === undefined ? undefined : editable.find(item => item.id === id)
    if (id !== undefined && !existing) return

    const name = draft.name.trim()
    const userId = isOrganization ? 'org' : currentUser.value.id
    const recipients = isOrganization ? existing?.allowedUserIds : draft.allowedUserIds
    const allowedUserIds = [...new Set(recipients)].filter(id => isOrganization || id !== userId)
    const resourceIds = [...new Set(draft.resourceIds)]
    const allowedResources = isOrganization
      ? state.resources.filter(resource => resource.scope === 'organization')
      : visibleResources.value
    if (!name
      || allowedUserIds.some(id => !state.users.some(user => user.id === id))
      || resourceIds.some(id => !allowedResources.some(resource => resource.id === id)
        && (isOrganization || !existing?.resourceIds.includes(id)))) return

    const values = {
      userId, scope, name, description: draft.description.trim(), instructions: draft.instructions.trim(),
      resourceIds, allowedUserIds,
    }
    if (existing) {
      if (isOrganization) {
        for (const version of capabilityVersions(existing)) captureCapabilityVersion(existing, version)
      }
      return Object.assign(existing, values)
    }
    const created: Assistant = { id: makeId('assistant'), ...values }
    if (isOrganization) {
      created.enabled = false
      created.availableVersions = []
      created.maintainerId = currentUser.value.id
    }
    state.assistants.push(created)
    return created
  }

  function savePersonalAssistant(draft: AssistantDraft, id?: string): Assistant | undefined {
    return saveAssistant(draft, 'personal', id)
  }

  function saveOrganizationAssistant(draft: AssistantDraft, id?: string): Assistant | undefined {
    return saveAssistant(draft, 'organization', id)
  }

  function workspaceDirectoryHasName(name: string, parentId?: string, excluded?: { kind: WorkspaceEntryKind; id: string }) {
    const normalized = name.normalize('NFC').toLowerCase()
    const sameName = (existing: string) => existing.normalize('NFC').toLowerCase() === normalized
    return myFolders.value.some(folder => folder.parentId === parentId && sameName(folder.name)
      && (excluded?.kind !== 'folder' || excluded.id !== folder.id))
      || myFiles.value.some(file => file.folderId === parentId && sameName(file.name)
        && (excluded?.kind !== 'file' || excluded.id !== file.id))
  }

  function createWorkspaceFolder(name: string, parentId?: string): WorkspaceFolder | undefined {
    const trimmed = name.trim()
    if (!validWorkspaceEntryName(trimmed) || workspaceDirectoryHasName(trimmed, parentId)) return
    if (parentId !== undefined && !myFolders.value.some(folder => folder.id === parentId)) return

    const folder: WorkspaceFolder = {
      id: makeId('folder'), userId: currentUser.value.id, name: trimmed, updatedAt: nowIso(),
      ...(parentId === undefined ? {} : { parentId }),
    }
    state.workspaceFolders.push(folder)
    return folder
  }

  function findWorkspaceEntry(kind: WorkspaceEntryKind, id: string) {
    if (kind === 'folder') {
      const item = myFolders.value.find(folder => folder.id === id)
      return item ? { kind, item, parentId: item.parentId } : undefined
    }
    const item = myFiles.value.find(file => file.id === id)
    return item ? { kind, item, parentId: item.folderId } : undefined
  }

  function renameWorkspaceEntry(kind: WorkspaceEntryKind, id: string, name: string): boolean {
    const target = findWorkspaceEntry(kind, id)
    const trimmed = name.trim()
    if (!target || !validWorkspaceEntryName(trimmed)) return false
    if (target.item.name === trimmed) return true
    if (workspaceDirectoryHasName(trimmed, target.parentId, { kind, id })) return false
    target.item.name = trimmed
    target.item.updatedAt = nowIso()
    return true
  }

  function moveWorkspaceEntry(kind: WorkspaceEntryKind, id: string, folderId?: string): boolean {
    const target = findWorkspaceEntry(kind, id)
    if (!target || (folderId !== undefined && !myFolders.value.some(folder => folder.id === folderId))) return false
    if (kind === 'folder' && folderId !== undefined && workspaceFolderTree(myFolders.value, id).has(folderId)) return false
    if (target.parentId === folderId) return true
    if (workspaceDirectoryHasName(target.item.name, folderId, { kind, id })) return false
    if (target.kind === 'folder') {
      target.item.parentId = folderId
    } else target.item.folderId = folderId
    target.item.updatedAt = nowIso()
    return true
  }

  function deleteWorkspaceEntry(kind: WorkspaceEntryKind, id: string): boolean {
    const target = findWorkspaceEntry(kind, id)
    if (!target) return false
    const userId = currentUser.value.id
    if (target.kind === 'file') {
      state.files = state.files.filter(file => file.userId !== userId || file.id !== id)
    } else {
      const folders = workspaceFolderTree(myFolders.value, id)
      state.workspaceFolders = state.workspaceFolders.filter(folder => folder.userId !== userId || !folders.has(folder.id))
      state.files = state.files.filter(file => file.userId !== userId || file.folderId === undefined || !folders.has(file.folderId))
    }
    return true
  }

  function resolveConversationDirectory(directory: WorkspaceDirectory = {}): ResolvedWorkspaceDirectory | undefined {
    const { spaceId, folderId } = directory
    const shared = spaceId === undefined ? undefined : useSharedWorkspacesStore()
    const space = shared?.workspaces.find(workspace => workspace.id === spaceId)
    if (shared && !space) return

    const folders = space?.folders ?? myFolders.value
    const files = space?.files ?? myFiles.value
    const foldersById = new Map(folders.map(folder => [folder.id, folder]))
    if (folderId !== undefined && !foldersById.has(folderId)) return
    const subtree = folderId === undefined ? undefined : workspaceFolderTree(folders, folderId)
    return {
      spaceId, folderId,
      ...conversationDirectoryDisplay(space?.name, foldersById, folderId),
      folders: subtree ? folders.filter(folder => folder.id !== folderId && subtree.has(folder.id)) : folders,
      files: subtree ? files.filter(file => file.folderId !== undefined && subtree.has(file.folderId)) : files,
      canWrite: !space || shared?.canEdit(space.id) === true,
    }
  }

  function canUseEtDrawingContext(context: EtDrawingContext) {
    return visibleWorkbenches.value.some(workbench => workbench.id === ET_DESIGN_WORKBENCH_ID)
      && (!context.reviewVersion || useSharedWorkspacesStore().canAccess(etWorkspaceId))
  }

  function prepareEtDrawingConversation(context: EtDrawingContext) {
    if (!canUseEtDrawingContext(context)) return
    const id = makeId('drawing-context')
    etDrawingLaunch.value = { id, userId: currentUser.value.id, context: { ...context } }
    return id
  }

  function getEtDrawingLaunch(id: string) {
    const launch = etDrawingLaunch.value
    if (launch?.id === id && launch.userId === currentUser.value.id && canUseEtDrawingContext(launch.context)) return launch.context
  }

  function createConversation(assistantId: string, title = '新建会话', directory: WorkspaceDirectory = {}, etDrawingLaunchId?: string) {
    const etDrawing = etDrawingLaunchId ? getEtDrawingLaunch(etDrawingLaunchId) : undefined
    const assistantAvailable = visibleAssistants.value.some(assistant => assistant.id === assistantId)
    if (!resolveConversationDirectory(directory) || (etDrawingLaunchId && (!etDrawing || !assistantAvailable))) return
    const id = makeId('chat')
    state.conversations.push({
      id, userId: currentUser.value.id, title,
      assistantId: assistantAvailable ? assistantId : 'default',
      directory: { ...directory },
      ...(etDrawing ? { etDrawing: { ...etDrawing } } : {}),
      messages: [], createdAt: nowIso(), updatedAt: nowIso(),
    })
    if (etDrawing) etDrawingLaunch.value = undefined
    return id
  }

  function setConversationArchived(id: string, archived: boolean) {
    const conversation = personalConversations.value.find(item => item.id === id)
    if (!conversation || (archived && pendingConversations.has(id))) return false
    conversation.archived = archived
    return true
  }

  async function sendConversationMessage(
    id: string, text: string, references: string[] = [], automationReply?: () => AutomationReply,
  ) {
    const conversation = personalConversations.value.find(item => item.id === id)
    const content = text.trim()
    if (!conversation || !content || pendingConversations.has(id)) return
    if (conversation.archived) throw new Error('请取消归档后继续会话。')
    if (conversation.etDrawing && !canUseEtDrawingContext(conversation.etDrawing)) throw new Error('当前账号已无法使用会话中的图纸上下文。')
    const assistant = visibleAssistants.value.find(item => item.id === conversation.assistantId)
    if (!assistant) throw new Error('当前账号已无法使用此会话的助理。')
    const directory = resolveConversationDirectory(conversation.directory)
    if (!directory) throw new Error('当前账号已无法访问此会话的工作目录。')
    if (assistant.scope === 'organization' && !isReady(assistant.id)) {
      const reason = dependencyIssues(assistant.id, nodes.value, state.organizationConnections, state.organizationPlugins, currentUser.value.id).join('；')
      useAdminUsageStore().record({ userId: conversation.userId, targetId: assistant.id, kind: 'assistant', operation: '助理请求', status: '失败', inputTokens: 0, outputTokens: 0, priced: false, source: '原型操作', note: '执行前依赖检查未通过：' + reason })
      throw new Error('助理依赖尚未就绪：' + reason)
    }
    const allowedFiles = directory.files.filter(file => references.includes(file.id))
    const resources = visibleResources.value.filter(item => item.status === '可用' && assistant.resourceIds.includes(item.id))
    const officeDocument = automationReply ? undefined : conversation.etDrawing
      ? draftEtDrawingReply(content, conversation.etDrawing) : draftOfficeDocument(content, allowedFiles)
    const reply = automationReply ? undefined
      : officeDocument ?? draftReply(content, assistant.id === 'default' ? '我' : assistant.name,
        allowedFiles.map(file => file.name), resources.map(resource => resource.name))
    pendingConversations.add(id)
    conversation.messages.push(newMessage('user', content, { references: allowedFiles.map(file => file.id) }))
    if (conversation.title === '新建会话') conversation.title = content.replace(/\s+/g, ' ').slice(0, 24)
    conversation.updatedAt = nowIso()
    try {
      await delay(550)
      if (automationReply) {
        const { text: result, ...details } = conversation.userId === currentUser.value.id
          ? automationReply() : { text: '账号已切换，请重新发送创建任务的指令。' }
        conversation.messages.push(newMessage('assistant', result, details))
      } else if (reply) {
        conversation.messages.push(newMessage('assistant', reply.text, {
          artifactName: reply.artifactName,
          ...(officeDocument ? { artifactContent: officeDocument.artifactContent, references: allowedFiles.map(file => file.id) } : {}),
        }))
      }
      conversation.updatedAt = nowIso()
      if (assistant.scope === 'organization') useAdminUsageStore().record({ userId: conversation.userId, targetId: assistant.id, kind: 'assistant', operation: '助理请求', status: '成功', modelId: resources.find(item => item.type === '模型')?.id, inputTokens: 0, outputTokens: 0, priced: false, source: '原型操作', note: '已记录模拟回复；Token 未接入真实计量。' })
    } finally {
      pendingConversations.delete(id)
    }
  }

  function saveMessageFile(conversationId: string, messageId: string, options?: ArtifactSaveOptions): string | undefined {
    const conversation = personalConversations.value.find(item => item.id === conversationId)
    const message = conversation?.messages.find(item => item.id === messageId && item.role === 'assistant')
    if (!conversation || !message) return
    const directory = resolveConversationDirectory(conversation.directory)
    if (!directory?.canWrite) return
    const id = `artifact-${message.id}`
    if (!options && directory.files.some(file => file.id === id)) return id

    const name = options?.name.trim() ?? message.artifactName ?? '助理产物.md'
    const content = options?.content ?? message.artifactContent ?? message.text
    const folderId = options ? options.folderId : directory.folderId
    const size = new Blob([content]).size
    if (!validWorkspaceEntryName(name) || !content.trim()
      || (folderId !== directory.folderId && !directory.folders.some(folder => folder.id === folderId))
      || size > 1024 * 1024) return

    if (directory.spaceId !== undefined) {
      return useSharedWorkspacesStore().saveArtifact(directory.spaceId, id,
        { name, folderId, content, size, type: 'text' }, directory.folderId) ? id : undefined
    }

    const existing = myFiles.value.find(file => file.id === id)
    if (existing && !directory.files.some(file => file.id === id)) return
    if (myFiles.value.reduce((total, file) => total + (file.id === id ? 0 : file.size), size) > 2 * 1024 * 1024) return

    if (options && workspaceDirectoryHasName(name, folderId, { kind: 'file', id })) return

    const values = { name, folderId, content, size, updatedAt: nowIso() }
    if (existing) Object.assign(existing, values)
    else state.files.push({ ...values, id, userId: currentUser.value.id, type: 'text', source: 'assistant' })
    return id
  }

  function startEmployeeThread(employeeId: string) {
    const employee = visibleEmployees.value.find(item => item.id === employeeId)
    if (!employee) return ''
    const existing = employeeThreads.value.find(item => item.employeeId === employeeId)
    if (existing) return existing.id
    const id = makeId('thread')
    state.threads.push({
      id, userId: currentUser.value.id, employeeId, updatedAt: nowIso(),
      messages: [newMessage('assistant', `你好，我是${employee.name}。${employee.description}你可以向我咨询，或交办一项具体工作。`)],
    })
    return id
  }

  function recordTaskProgress(task: Task, text: string) {
    const thread = state.threads.find(item => item.id === task.threadId && item.userId === task.userId)
    if (!thread) return
    thread.messages.push(newMessage('assistant', text, { taskId: task.id }))
    thread.updatedAt = nowIso()
    task.updatedAt = nowIso()
  }

  function runTask(task: Task) {
    const timer = timers.get(task.id)
    if (timer) clearTimeout(timer)
    timers.set(task.id, setTimeout(() => {
      timers.delete(task.id)
      if (task.status !== '进行中') return
      task.status = '待补充'
      task.progress = 65
      task.detail = '已梳理需求并形成初稿。请补充交付范围或确认采用现有资料。'
      recordTaskProgress(task, `「${task.title}」已完成初步整理。请补充相关要求，或确认按现有资料完成。`)
    }, 4500))
  }

  function assignEmployeeTask(threadId: string, draft: EmployeeTaskDraft, proposalMessageId?: string): Task | undefined {
    const thread = employeeThreads.value.find(item => item.id === threadId)
    const title = draft.title.trim()
    const request = draft.request.trim()
    if (!thread || !title || !request) return
    const proposal = proposalMessageId ? thread.messages.find(message => message.id === proposalMessageId && message.taskProposal && !message.taskId) : undefined
    if (proposalMessageId && !proposal) return

    const createdAt = nowIso()
    const task: Task = reactive({
      id: makeId('task'), userId: thread.userId, employeeId: thread.employeeId, threadId,
      title, request, deliverable: draft.deliverable?.trim(), createdAt,
      status: '进行中', progress: 20, detail: '已受理，正在梳理交付要求和已有资料。', updatedAt: createdAt,
    })
    if (proposal) proposal.taskId = task.id
    thread.messages.push(newMessage('user', request, { taskId: task.id }))
    state.tasks.push(task)
    recordTaskProgress(task, '工作已受理。我会在这里同步进展。')
    runTask(task)
    return task
  }

  async function sendEmployeeMessage(threadId: string, text: string) {
    const thread = employeeThreads.value.find(item => item.id === threadId)
    const employee = visibleEmployees.value.find(item => item.id === thread?.employeeId)
    const content = text.trim()
    if (!thread || !employee || !content || pendingThreads.has(threadId)) return false
    pendingThreads.add(threadId)
    thread.messages.push(newMessage('user', content))
    thread.updatedAt = nowIso()
    try {
      await delay(450)
      const active = state.tasks.find(task => task.threadId === thread.id && task.status !== '已完成')
      const asksProgress = /进展|进度|完成了吗|做到哪/.test(content) && active
      const wantsWork = /^(请|麻烦|帮我|把|将)/.test(content)
        && /整理|汇总|核对|检查|准备|生成|列出|统计|跟进|起草|复核/.test(content)
        && !/[？?]$|怎么|如何/.test(content)
      const proposal = !asksProgress && wantsWork
        ? { title: content.replace(/^(请|麻烦)?(帮我)?\s*/, '').replace(/\s+/g, ' ').slice(0, 32), request: content }
        : undefined
      const consultation = employee.id === 'employee-service' && /工单|归类/.test(content)
        ? '可以先按设备使用、备件更换、上门服务和账号服务归类。处理状态单独记录，方便后续筛选未关闭工单。'
        : employee.description || '你可以告诉我目前遇到的具体问题。'
      const reply = asksProgress
        ? `「${active.title}」目前${active.status}。${active.detail}`
        : proposal
          ? '我可以接手这项工作。请核对要求和交付物，确认后可以跟进处理。'
          : consultation
      thread.messages.push(newMessage('assistant', reply, { taskProposal: proposal }))
      thread.updatedAt = nowIso()
      return true
    } finally {
      pendingThreads.delete(threadId)
    }
  }

  function completeTask(task: Task, supplement?: string) {
    const timer = timers.get(task.id)
    if (timer) clearTimeout(timer)
    timers.delete(task.id)
    task.status = '已完成'
    task.progress = 100
    task.detail = '已完成整理，交付结果可查看。'
    task.result = `交付结果 · ${task.title}\n\n1. 已核对工作目标和现有材料。\n2. 已整理处理结果与后续行动项。\n3. 建议确认需要继续跟进的事项。${supplement ? `\n\n补充要求：${supplement}` : ''}`
    recordTaskProgress(task, `「${task.title}」已完成，可以查看交付结果。`)
  }

  function supplementEmployeeTask(taskId: string, text: string) {
    const task = myTasks.value.find(item => item.id === taskId)
    const thread = employeeThreads.value.find(item => item.id === task?.threadId)
    if (!task || !thread || task.status !== '待补充' || !text.trim()) return
    thread.messages.push(newMessage('user', text.trim(), { taskId }))
    completeTask(task, text.trim())
  }

  function advanceEmployeeTask(taskId: string) {
    const task = myTasks.value.find(item => item.id === taskId)
    if (task && task.status !== '已完成') completeTask(task)
  }

  // Resume work interrupted by reloading the local prototype.
  state.tasks.filter(task => task.status === '进行中').forEach(runTask)

  return {
    ...toRefs(state), currentUser, myAssistants, sharedAssistants, organizationAssistants,
    visibleAssistants, myFiles, myFolders,
    visibleResources, personalConversations, visibleEmployees, employeeThreads, myTasks, visibleWorkbenches,
    setCurrentUser, savePersonalResource, assistantResourceBindings, copySharedAssistant, savePersonalAssistant, saveOrganizationAssistant,
    createWorkspaceFolder, renameWorkspaceEntry, moveWorkspaceEntry, deleteWorkspaceEntry,
    canUseEtDrawingContext, prepareEtDrawingConversation, getEtDrawingLaunch,
    resolveConversationDirectory, createConversation, setConversationArchived, sendConversationMessage, saveMessageFile,
    startEmployeeThread, sendEmployeeMessage, assignEmployeeTask, supplementEmployeeTask, advanceEmployeeTask,
  }
})
