import { computed, onScopeDispose, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { workspaceFolderTree } from '@/workspaceDirectory'
import { makeId, nowIso, usePlatformStore, type WorkspaceFile, type WorkspaceFolder } from './platform'

export const etWorkspaceId = 'ET-052'
export type SharedWorkspacePermission = 'view' | 'edit'
export type SharedWorkspaceFolder = Omit<WorkspaceFolder, 'userId'>

export interface SharedWorkspaceFile extends Omit<WorkspaceFile, 'userId' | 'source'> {
  uploadedById: string
}

export interface SharedWorkspace {
  id: string
  name: string
  creatorId: string
  createdAt: string
  updatedAt: string
  members: { userId: string; permission: SharedWorkspacePermission }[]
  folders: SharedWorkspaceFolder[]
  files: SharedWorkspaceFile[]
}

type FileInput = Pick<SharedWorkspaceFile, 'name' | 'folderId' | 'type' | 'size' | 'content' | 'dataUrl'>
type WorkspaceRole = SharedWorkspacePermission | 'owner'
type EntryKind = 'file' | 'folder'
type EntryKey = { kind: EntryKind; id: string }
type EntryLocation = { name: string; folderId?: string }
type StoredWorkspaces = { version: 2; workspaces: SharedWorkspace[] }
type WorkspaceExample = Pick<SharedWorkspace, 'id' | 'name' | 'creatorId' | 'members'> & {
  daysAgo: number
  folderName: string
  documents: { name: string; content: string }[]
}

const storageKey = 'ai-worker-shared-workspaces-v1'
const fileSizeLimit = 1024 * 1024
const sharedSizeLimit = 2 * fileSizeLimit
const fileTypes = new Set<WorkspaceFile['type']>(['document', 'sheet', 'pdf', 'text', 'image'])
const etSystemFolderIds = new Set(['files', 'checklists', 'deliveries'])
const normalizedName = (value: string) => value.normalize('NFC').toLowerCase()
const allowedRoles: Record<'owner' | 'edit' | 'member', WorkspaceRole[]> = {
  owner: ['owner'],
  edit: ['owner', 'edit'],
  member: ['view', 'edit'],
}

export function isEtWorkspaceSystemFolder(spaceId: string, folderId: string) {
  return spaceId === etWorkspaceId && etSystemFolderIds.has(folderId)
}

function validEntryName(name: string) {
  return !!name && !/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) && !name.endsWith('.')
    && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)
}

function sampleWorkspace(): SharedWorkspace {
  const date = '2026-11-16T00:00:00.000Z'
  return {
    id: etWorkspaceId, name: '南区产线 · 电气图纸评审', creatorId: 'lin', createdAt: date, updatedAt: date,
    members: [{ userId: 'zhou', permission: 'edit' }],
    folders: [
      { id: 'files', name: '共享资料', updatedAt: date },
      { id: 'checklists', name: '已确认的检查清单', updatedAt: date },
      { id: 'deliveries', name: 'AI 员工任务与交付', updatedAt: date },
    ],
    files: [],
  }
}

const joinedWorkspaceExamples: WorkspaceExample[] = [
  {
    id: 'demo-customer-delivery', name: '客户交付资料', creatorId: 'zhou', daysAgo: 0, folderName: '交付准备',
    members: [{ userId: 'lin', permission: 'edit' }, { userId: 'song', permission: 'view' }],
    documents: [
      { name: '本周交付计划.md', content: '# 本周交付计划\n- 周二核对验收范围\n- 周四完成材料复核\n- 周五确认交付安排' },
      { name: '交付检查清单.csv', content: '事项,状态\n版本核对,已完成\n验收说明,待复核\n培训安排,待确认' },
      { name: '交接纪要.md', content: '# 交接纪要\n先在验收会上集中确认待补资料，再更新交付计划。' },
    ],
  },
  {
    id: 'demo-tender-research', name: '招投标研判', creatorId: 'song', daysAgo: 2, folderName: '初筛资料',
    members: [{ userId: 'lin', permission: 'view' }, { userId: 'zhou', permission: 'edit' }],
    documents: [
      { name: '机会跟踪表.csv', content: '机会,跟进状态\n园区设备改造,待核实\n厂房维保服务,已记录' },
      { name: '复核要点.md', content: '# 复核要点\n重点检查报名窗口、交付周期和资质要求。' },
    ],
  },
  {
    id: 'demo-service-library', name: '服务知识库', creatorId: 'zhou', daysAgo: 5, folderName: '服务手册',
    members: [{ userId: 'lin', permission: 'view' }],
    documents: [
      { name: '客户问题处理说明.md', content: '# 客户问题处理说明\n记录问题、影响范围和反馈期限，再按处理进度跟进。' },
      { name: '服务交接模板.md', content: '# 服务交接模板\n- 当前进度\n- 待解决事项\n- 下一次跟进时间' },
      { name: '常见问题.md', content: '# 常见问题\n交接后可从原服务记录查询进度。' },
      { name: '资料更新记录.txt', content: '本次整理了客户问题处理说明和服务交接模板。' },
    ],
  },
]

function seedJoinedWorkspaces(): SharedWorkspace[] {
  const now = new Date()
  const encoder = new TextEncoder()
  return joinedWorkspaceExamples.map(({ id, name, creatorId, daysAgo, folderName, members, documents }) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - daysAgo)
    const updatedAt = date.toISOString()
    const folderId = 'materials'
    return {
      id, name, creatorId, createdAt: updatedAt, updatedAt, members,
      folders: [{ id: folderId, name: folderName, updatedAt }],
      files: documents.map(({ name, content }, index) => ({
        id: `document-${index + 1}`, folderId, name, content,
        type: name.endsWith('.csv') ? 'sheet' : 'text',
        size: encoder.encode(content).byteLength, updatedAt, uploadedById: creatorId,
      })),
    }
  })
}

function seedWorkspaces() {
  return [sampleWorkspace(), ...seedJoinedWorkspaces()]
}

function writeWorkspaces(workspaces: SharedWorkspace[]) {
  try {
    const stored: StoredWorkspaces = { version: 2, workspaces }
    localStorage.setItem(storageKey, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

function readWorkspaces(): SharedWorkspace[] | undefined {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) {
      const seeded = seedWorkspaces()
      writeWorkspaces(seeded)
      return seeded
    }
    const stored = JSON.parse(raw) as StoredWorkspaces | SharedWorkspace[] | null
    const value = Array.isArray(stored) ? stored : stored?.version === 2 ? stored.workspaces : undefined
    if (!Array.isArray(value) || !value.every(item => item && typeof item.id === 'string'
      && typeof item.name === 'string' && typeof item.creatorId === 'string' && typeof item.updatedAt === 'string' && Array.isArray(item.members)
      && Array.isArray(item.folders) && Array.isArray(item.files))) return
    if (!Array.isArray(stored)) return value

    const additions = seedJoinedWorkspaces().filter(example => !value.some(space => space.id === example.id)
      && !workspaceNameTaken(value, example.creatorId, example.name))
    const migrated = [...value, ...additions]
    writeWorkspaces(migrated)
    return migrated
  } catch {
    return undefined
  }
}

function workspaceNameTaken(workspaces: SharedWorkspace[], creatorId: string, name: string, exceptId?: string) {
  const comparison = normalizedName(name)
  return workspaces.some(space => space.id !== exceptId && space.creatorId === creatorId
    && normalizedName(space.name) === comparison)
}

function directoryHasName(workspace: SharedWorkspace, name: string, folderId?: string, ignored?: EntryKey) {
  const comparison = normalizedName(name)
  return workspace.folders.some(folder => folder.parentId === folderId
    && (ignored?.kind !== 'folder' || folder.id !== ignored.id) && normalizedName(folder.name) === comparison)
    || workspace.files.some(file => file.folderId === folderId
      && (ignored?.kind !== 'file' || file.id !== ignored.id) && normalizedName(file.name) === comparison)
}

export const useSharedWorkspacesStore = defineStore('shared-workspaces', () => {
  const platform = usePlatformStore()
  const state = shallowRef(readWorkspaces() ?? seedWorkspaces())

  function isActive(userId: string) {
    return platform.users.some(user => user.id === userId && user.status !== 'disabled')
  }

  function canAssignMember(creatorId: string, userId: string, permission: SharedWorkspacePermission) {
    return creatorId !== userId && isActive(userId) && (permission === 'view' || permission === 'edit')
  }

  function roleFor(workspace: SharedWorkspace | undefined, userId: string): WorkspaceRole | undefined {
    if (!workspace || !isActive(userId)) return
    if (workspace.creatorId === userId) return 'owner'
    const permission = workspace.members.find(member => member.userId === userId)?.permission
    if (permission === 'view' || permission === 'edit') return permission
  }

  function canAccess(id: string, userId = platform.currentUser.id) {
    return roleFor(state.value.find(workspace => workspace.id === id), userId) !== undefined
  }

  function canEdit(id: string, userId = platform.currentUser.id) {
    const role = roleFor(state.value.find(workspace => workspace.id === id), userId)
    return role === 'owner' || role === 'edit'
  }

  function canManage(id: string, userId = platform.currentUser.id) {
    return roleFor(state.value.find(workspace => workspace.id === id), userId) === 'owner'
  }

  const workspaces = computed(() => state.value.filter(workspace => roleFor(workspace, platform.currentUser.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))

  function updateFromStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) state.value = readWorkspaces() ?? seedWorkspaces()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', updateFromStorage)
    onScopeDispose(() => window.removeEventListener('storage', updateFromStorage))
  }

  function loadLatest() {
    const stored = readWorkspaces()
    if (stored) state.value = stored
    return state.value
  }

  function commit(next: SharedWorkspace[]) {
    if (!writeWorkspaces(next)) return false
    state.value = next
    return true
  }

  function changeWorkspace(
    id: string, required: keyof typeof allowedRoles, update: (workspace: SharedWorkspace) => Partial<SharedWorkspace> | undefined,
  ) {
    const existing = loadLatest()
    const workspace = existing.find(item => item.id === id)
    const role = roleFor(workspace, platform.currentUser.id)
    if (!workspace || !role || !allowedRoles[required].includes(role)) return false
    const changes = update(workspace)
    if (!changes) return false
    const changed = { ...workspace, ...changes, updatedAt: nowIso() }
    return commit(existing.map(item => item.id === id ? changed : item))
  }

  function createWorkspace(name: string, members: SharedWorkspace['members'] = []): string | undefined {
    const userId = platform.currentUser.id
    const trimmed = name.trim()
    if (!isActive(userId) || !validEntryName(trimmed)) return
    const memberIds = new Set(members.map(member => member.userId))
    if (memberIds.size !== members.length || members.some(member => !canAssignMember(userId, member.userId, member.permission))) return
    const existing = loadLatest()
    if (workspaceNameTaken(existing, userId, trimmed)) return
    const id = makeId('shared-space')
    const date = nowIso()
    const workspace: SharedWorkspace = {
      id, name: trimmed, creatorId: userId, createdAt: date, updatedAt: date,
      members: members.map(({ userId, permission }) => ({ userId, permission })), folders: [], files: [],
    }
    if (commit([...existing, workspace])) return id
  }

  function renameWorkspace(id: string, name: string) {
    const trimmed = name.trim()
    if (!validEntryName(trimmed)) return false
    return changeWorkspace(id, 'owner', workspace => {
      if (workspaceNameTaken(state.value, workspace.creatorId, trimmed, id)) return
      return { name: trimmed }
    })
  }

  function deleteWorkspace(id: string) {
    const existing = loadLatest()
    if (!canManage(id)) return false
    return commit(existing.filter(workspace => workspace.id !== id))
  }

  function leaveWorkspace(id: string) {
    const userId = platform.currentUser.id
    return changeWorkspace(id, 'member', workspace => ({
      members: workspace.members.filter(member => member.userId !== userId),
    }))
  }

  function setMember(id: string, userId: string, permission: SharedWorkspacePermission) {
    return changeWorkspace(id, 'owner', workspace => {
      if (!canAssignMember(workspace.creatorId, userId, permission)) return
      const members = workspace.members.filter(member => member.userId !== userId)
      return { members: [...members, { userId, permission }] }
    })
  }

  function removeMember(id: string, userId: string) {
    return changeWorkspace(id, 'owner', workspace => {
      if (workspace.creatorId === userId || !workspace.members.some(member => member.userId === userId)) return
      return { members: workspace.members.filter(member => member.userId !== userId) }
    })
  }

  function createFolder(spaceId: string, name: string, parentId?: string) {
    return changeWorkspace(spaceId, 'edit', workspace => {
      const trimmed = name.trim()
      if (!validEntryName(trimmed) || directoryHasName(workspace, trimmed, parentId)
        || (parentId !== undefined && !workspace.folders.some(folder => folder.id === parentId))) return
      const folder: SharedWorkspaceFolder = { id: makeId('shared-folder'), name: trimmed, parentId, updatedAt: nowIso() }
      return { folders: [...workspace.folders, folder] }
    })
  }

  function writeFile(spaceId: string, file: FileInput, artifact?: { id: string; rootFolderId?: string }) {
    return changeWorkspace(spaceId, 'edit', workspace => {
      const name = file.name.trim()
      const existing = artifact && workspace.files.find(item => item.id === artifact.id)
      const userId = platform.currentUser.id
      if (existing && existing.uploadedById !== userId) return
      if (artifact?.rootFolderId !== undefined) {
        if (!workspace.folders.some(folder => folder.id === artifact.rootFolderId)) return
        const subtree = workspaceFolderTree(workspace.folders, artifact.rootFolderId)
        if (!subtree.has(file.folderId ?? '') || (existing && !subtree.has(existing.folderId ?? ''))) return
      }
      if (!validEntryName(name) || !fileTypes.has(file.type) || !Number.isSafeInteger(file.size)
        || file.size < 0 || file.size > fileSizeLimit
        || directoryHasName(workspace, name, file.folderId, existing ? { kind: 'file', id: existing.id } : undefined)
        || (file.folderId !== undefined && !workspace.folders.some(folder => folder.id === file.folderId))
        || state.value.reduce((sum, entry) => sum + entry.files.reduce((total, item) =>
          total + (entry.id === spaceId && item.id === existing?.id ? 0 : item.size), 0), file.size) > sharedSizeLimit) return

      const uploaded: SharedWorkspaceFile = {
        ...file, id: artifact?.id ?? makeId('shared-file'), name, updatedAt: nowIso(), uploadedById: userId,
      }
      return { files: existing ? workspace.files.map(item => item.id === uploaded.id ? uploaded : item) : [...workspace.files, uploaded] }
    })
  }

  function addFile(spaceId: string, file: FileInput) {
    return writeFile(spaceId, file)
  }

  function saveArtifact(spaceId: string, id: string, file: FileInput, rootFolderId?: string) {
    return writeFile(spaceId, file, { id, rootFolderId })
  }

  function changeEntry(
    spaceId: string, kind: EntryKind, id: string,
    update: (workspace: SharedWorkspace, current: EntryLocation) => EntryLocation | undefined,
  ) {
    return changeWorkspace(spaceId, 'edit', workspace => {
      if (kind === 'file') {
        const file = workspace.files.find(item => item.id === id)
        if (!file) return
        const next = update(workspace, { name: file.name, folderId: file.folderId })
        if (!next) return
        const changed = { ...file, ...next, updatedAt: nowIso() }
        return { files: workspace.files.map(item => item.id === id ? changed : item) }
      }
      if (kind !== 'folder' || isEtWorkspaceSystemFolder(spaceId, id)) return
      const folder = workspace.folders.find(item => item.id === id)
      if (!folder) return
      const next = update(workspace, { name: folder.name, folderId: folder.parentId })
      if (!next) return
      const changed = { ...folder, name: next.name, parentId: next.folderId, updatedAt: nowIso() }
      return { folders: workspace.folders.map(item => item.id === id ? changed : item) }
    })
  }

  function renameEntry(spaceId: string, kind: EntryKind, id: string, name: string) {
    return changeEntry(spaceId, kind, id, (workspace, current) => {
      const trimmed = name.trim()
      if (!validEntryName(trimmed) || directoryHasName(workspace, trimmed, current.folderId, { kind, id })) return
      return { ...current, name: trimmed }
    })
  }

  function moveEntry(spaceId: string, kind: EntryKind, id: string, folderId?: string) {
    return changeEntry(spaceId, kind, id, (workspace, current) => {
      if (folderId !== undefined && (!workspace.folders.some(folder => folder.id === folderId)
        || (kind === 'folder' && workspaceFolderTree(workspace.folders, id).has(folderId)))) return
      if (directoryHasName(workspace, current.name, folderId, { kind, id })) return
      return { name: current.name, folderId }
    })
  }

  function deleteEntry(spaceId: string, kind: EntryKind, id: string) {
    return changeWorkspace(spaceId, 'edit', workspace => {
      if (kind === 'file') {
        if (!workspace.files.some(file => file.id === id)) return
        return { files: workspace.files.filter(file => file.id !== id) }
      }
      if (kind !== 'folder' || isEtWorkspaceSystemFolder(spaceId, id) || !workspace.folders.some(folder => folder.id === id)) return
      const folderIds = workspaceFolderTree(workspace.folders, id)
      if ([...folderIds].some(folderId => isEtWorkspaceSystemFolder(spaceId, folderId))) return
      return {
        folders: workspace.folders.filter(folder => !folderIds.has(folder.id)),
        files: workspace.files.filter(file => file.folderId === undefined || !folderIds.has(file.folderId)),
      }
    })
  }

  return {
    workspaces, canAccess, canEdit, canManage, createWorkspace, renameWorkspace, deleteWorkspace, leaveWorkspace,
    setMember, removeMember, createFolder, addFile, saveArtifact,
    renameEntry, moveEntry, deleteEntry,
  }
})
