<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatDotRound, Download, Search, Upload } from '@element-plus/icons-vue'
import { ChevronRight, ClipboardCheck, Ellipsis, FileBox, FileImage, FileSpreadsheet, FileText, Folder, FolderInput, FolderOpen, FolderPlus, LayoutGrid, List, Pencil, Trash2, UsersRound, X } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import EtReviewFindings from '@/components/EtReviewFindings.vue'
import SharedWorkspaceCards from '@/components/SharedWorkspaceCards.vue'
import SharedWorkspaceMembersDialog from '@/components/SharedWorkspaceMembersDialog.vue'
import { downloadEtReviewMaterials, reviewDrawingName, type EtReviewVersion } from '@/components/etReviewDrawing'
import { useEtDrawingReviewStore } from '@/stores/etDrawingReview'
import { makeId, nowIso, usePlatformStore, type WorkspaceFile, type WorkspaceFolder } from '@/stores/platform'
import { etWorkspaceId, isEtWorkspaceSystemFolder, useSharedWorkspacesStore, type SharedWorkspace, type SharedWorkspaceFile } from '@/stores/sharedWorkspaces'
import { scenarioStatusLabels, useScenarioTaskStore } from '@/stores/scenarioTasks'

const EtSharedDrawingPreview = defineAsyncComponent(() => import('@/components/EtSharedDrawingPreview.vue'))

const platform = usePlatformStore()
const etReview = useEtDrawingReviewStore()
const scenarioTasks = useScenarioTaskStore()
const shared = useSharedWorkspacesStore()
const workspaceUserId = platform.currentUser.id
const route = useRoute()
const router = useRouter()
const workspacePath = '/work/workspace'
const sharedGroups = [
  { id: 'created', name: '我创建的' },
  { id: 'joined', name: '我加入的' },
] as const
const drawingVersions: EtReviewVersion[] = ['V1', 'V2']
const sharedScope = computed(() => route.query.scope === 'shared')
const selectedSpace = computed(() => route.query.space)
const currentSpace = computed(() => sharedScope.value
  ? shared.workspaces.find(space => space.id === selectedSpace.value) : undefined)
const isEtSpaceOpen = computed(() => currentSpace.value?.id === etWorkspaceId)
const folderQuery = computed(() => sharedScope.value ? route.query.folder ?? route.query.section : route.query.folder)
const isSharedList = computed(() => sharedScope.value && selectedSpace.value === undefined && folderQuery.value === undefined)
const requestedGroup = computed(() => sharedGroups.find(group => group.id === route.query.group)?.id)
const lastSharedGroup = ref<typeof sharedGroups[number]['id']>()
const activeSharedGroup = computed(() => requestedGroup.value ?? lastSharedGroup.value
  ?? (shared.workspaces.some(space => space.creatorId === platform.currentUser.id) ? 'created' : 'joined'))
watch([sharedScope, activeSharedGroup], ([isShared, group]) => {
  if (isShared) lastSharedGroup.value = group
}, { immediate: true })
const sharedLocation = computed(() => ({
  path: workspacePath,
  query: { scope: 'shared', group: activeSharedGroup.value },
}))
const spaceLocation = (space: string, folder?: string) => ({
  path: workspacePath,
  query: { ...sharedLocation.value.query, space, folder },
})
const unavailableSpace = computed(() => sharedScope.value
  && ((selectedSpace.value !== undefined && !currentSpace.value)
    || (folderQuery.value !== undefined && !currentFolder.value)))
const canEditDirectory = computed(() => !sharedScope.value || (!!currentSpace.value && !unavailableSpace.value && shared.canEdit(currentSpace.value.id)))
const sharedTasks = computed(() => isEtSpaceOpen.value ? scenarioTasks.tasksForObject('et-review', etWorkspaceId) : [])
type EntryIcon = WorkspaceFile['type'] | 'folder' | 'drawing' | 'task'
type EntryKind = 'file' | 'folder'
type Entry = {
  id: string
  name: string
  icon: EntryIcon
  type: string
  date?: string
  size?: number
  source?: string
  subtitle?: string
  editableKind?: EntryKind
  open: () => void
  action?: { label: string; run?: () => void }
}
type EditableEntry = Entry & { editableKind: EntryKind }
const entryActions = [
  { id: 'rename', label: '重命名', icon: Pencil },
  { id: 'move', label: '移动', icon: FolderInput },
  { id: 'delete', label: '删除', icon: Trash2 },
] as const
type EntryAction = (typeof entryActions)[number]
const entryMutation = shallowRef<{ action: EntryAction; entry: EditableEntry }>()
const entryDialogOpen = computed({
  get: () => !!entryMutation.value,
  set: (open: boolean) => { if (!open) entryMutation.value = undefined },
})
const renameName = ref('')
const destinationFolderId = ref('')
const entryError = ref('')
const viewMode = ref<'list' | 'icons'>('list')
const directorySearch = ref('')
const sharedSearch = ref({ created: '', joined: '' })
const search = computed({
  get: () => isSharedList.value ? sharedSearch.value[activeSharedGroup.value] : directorySearch.value,
  set: (keyword: string) => {
    if (isSharedList.value) sharedSearch.value[activeSharedGroup.value] = keyword
    else directorySearch.value = keyword
  },
})
const searchKeyword = computed(() => search.value.trim().toLocaleLowerCase())
const compactSearchOpen = ref(false)
const searchInput = ref<{ focus: () => void }>()
const searchToggle = ref<HTMLButtonElement>()
const fileInput = ref<HTMLInputElement>()
const address = ref<HTMLElement>()
const previewId = ref('')
const previewOpen = ref(false)
const checklistId = ref('')
const drawingPreview = ref<{ version: EtReviewVersion; indices?: number[] }>()
const checklistPreview = computed(() => isEtSpaceOpen.value ? etReview.confirmed.find(item => item.id === checklistId.value) : undefined)
const sharedPreviewOpen = computed({
  get: () => isEtSpaceOpen.value && !!(drawingPreview.value || checklistPreview.value),
  set: (open: boolean) => {
    if (open) return
    checklistId.value = ''
    drawingPreview.value = undefined
  },
})
const uploading = ref(false)
type SpaceCardAction = 'rename' | 'members' | 'delete' | 'leave'
const spaceAction = shallowRef<{ kind: 'create' } | { kind: SpaceCardAction; spaceId: string }>()
const spaceActionTitles = {
  create: '新建共享空间', rename: '重命名空间', delete: '删除空间', leave: '退出空间',
}
const actionSpace = computed(() => {
  const action = spaceAction.value
  if (action && action.kind !== 'create') return shared.workspaces.find(space => space.id === action.spaceId)
})
const spaceDialogOpen = computed({
  get: () => !!spaceAction.value,
  set: (open: boolean) => { if (!open) spaceAction.value = undefined },
})
const spaceName = ref('')
const spaceError = ref('')
const initialSpaceMembers = ref<SharedWorkspace['members']>([])
const spaceMemberOptions = computed(() => platform.users.filter(user =>
  user.id !== platform.currentUser.id && user.status !== 'disabled'))
const selectedSpaceMemberIds = computed({
  get: () => initialSpaceMembers.value.map(member => member.userId),
  set: (ids: string[]) => {
    const previous = initialSpaceMembers.value
    initialSpaceMembers.value = ids.map(userId => ({
      userId, permission: previous.find(member => member.userId === userId)?.permission ?? 'view',
    }))
    spaceError.value = ''
  },
})
const initialMemberNames = computed(() => Object.fromEntries(platform.users.map(user => [user.id, user.name])))
const folderDialog = ref(false)
const folderName = ref('')
const folderError = ref('')
const personalPreview = computed(() => !sharedScope.value ? platform.myFiles.find(file => file.id === previewId.value) : undefined)
const preview = computed(() => sharedScope.value
  ? currentSpace.value?.files.find(file => file.id === previewId.value) : personalPreview.value)
const foldersById = computed(() => new Map((sharedScope.value ? currentSpace.value?.folders ?? [] : platform.myFolders)
  .map(folder => [folder.id, folder])))
const currentFolder = computed(() => typeof folderQuery.value === 'string' ? foldersById.value.get(folderQuery.value) : undefined)
const currentFolderId = computed(() => currentFolder.value?.id)
function folderPath(folderId?: string) {
  const parents: FolderEntry[] = []
  const visited = new Set<string>()
  for (let folder = foldersById.value.get(folderId ?? ''); folder && !visited.has(folder.id); folder = foldersById.value.get(folder.parentId ?? '')) {
    parents.push(folder)
    visited.add(folder.id)
  }
  return parents.reverse()
}
const breadcrumbs = computed(() => folderPath(currentFolderId.value))
const moveDirectories = computed(() => {
  const entry = entryMutation.value?.entry
  if (entryMutation.value?.action.id !== 'move' || !entry) return []
  return [...foldersById.value.values()].flatMap(folder => {
    const path = folderPath(folder.id)
    if (entry.editableKind === 'folder' && path.some(parent => parent.id === entry.id)) return []
    return [{ id: folder.id, label: path.map(parent => parent.name).join(' / ') }]
  }).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
})
const typeLabels: Record<WorkspaceFile['type'], string> = { document: '文档', sheet: '表格', pdf: 'PDF', text: '文本', image: '图片' }
const sourceLabels: Record<WorkspaceFile['source'], string> = { assistant: '助理产物', upload: '个人上传', sample: '示例资料' }
const fileIcons = {
  document: FileText, sheet: FileSpreadsheet, pdf: FileText, text: FileText, image: FileImage,
  folder: Folder, drawing: FileBox, task: ClipboardCheck,
} satisfies Record<EntryIcon, typeof FileText>
const modifiedDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
type FolderEntry = Pick<WorkspaceFolder, 'id' | 'name' | 'parentId' | 'updatedAt'>

function folderEntries(folders: FolderEntry[]): Entry[] {
  return folders
    .filter(folder => folder.parentId === currentFolderId.value)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    .map(folder => ({
      id: folder.id, name: folder.name, icon: 'folder', type: '文件夹', date: folder.updatedAt,
      editableKind: currentSpace.value && isEtWorkspaceSystemFolder(currentSpace.value.id, folder.id) ? undefined : 'folder',
      open: () => openFolder(folder.id),
    }))
}

const personalEntries = computed<Entry[]>(() => {
  const files = platform.myFiles.filter(file => file.folderId === currentFolderId.value)
  return [
    ...folderEntries(platform.myFolders),
    ...files.map(file => ({
      id: file.id, name: file.name, icon: file.type, type: typeLabels[file.type], date: file.updatedAt,
      editableKind: 'file' as const,
      size: file.size, source: sourceLabels[file.source], open: () => showFile(file),
      action: { label: '引用', run: () => useInChat(file) },
    })),
  ]
})

const etReferenceFiles = computed<Entry[]>(() => [
  ...drawingVersions.map(version => ({
    id: version, name: reviewDrawingName(version), icon: 'drawing' as const, type: 'DXF 图纸',
    date: version === 'V2' ? etReview.release?.publishedAt : undefined,
    source: version === 'V2' ? etReview.release ? '已发布' : '待发布' : '初始版本',
    open: () => openSharedDrawing(version),
    action: { label: '打开' },
  })),
  {
    id: 'materials', name: '材料清单 V1.csv', icon: 'sheet', type: 'CSV 表格', source: '共享资料',
    open: downloadEtReviewMaterials, action: { label: '下载' },
  },
])

function sampleEntriesIn(folderId?: string): Entry[] {
  if (!isEtSpaceOpen.value) return []
  switch (folderId) {
    case 'files': return etReferenceFiles.value
    case 'checklists':
      return etReview.confirmed.map(item => ({
        id: item.id, name: '出图检查清单 · ' + item.version, icon: 'document', type: '评审清单',
        date: item.confirmedAt, source: item.authorName, subtitle: item.scope,
        open: () => { checklistId.value = item.id },
        action: { label: '预览' },
      }))
    case 'deliveries':
      return sharedTasks.value.map(task => ({
        id: task.id, name: task.title + ' · ' + task.objectVersion, icon: 'task', type: 'AI 员工任务',
        date: task.writtenAt ?? task.updatedAt, source: task.writtenAt ? '已写回' : scenarioStatusLabels[task.status],
        open: () => { void router.push({ name: 'scenario-task', params: { taskId: task.id } }) },
        action: { label: '查看' },
      }))
    default: return []
  }
}
const etSampleEntries = computed(() => sampleEntriesIn(currentFolderId.value))

const sharedEntries = computed<Entry[]>(() => {
  const space = currentSpace.value
  if (!space || unavailableSpace.value) return []
  return [
    ...folderEntries(space.folders),
    ...etSampleEntries.value,
    ...space.files.filter(file => file.folderId === currentFolderId.value).map(file => ({
      id: file.id, name: file.name, icon: file.type, type: typeLabels[file.type], date: file.updatedAt,
      editableKind: 'file' as const,
      size: file.size, source: platform.users.find(user => user.id === file.uploadedById)?.name ?? '共享上传',
      open: () => showFile(file), action: { label: '预览' },
    })),
  ]
})

const sharedCards = computed(() => {
  return shared.workspaces
    .filter(space => (space.creatorId === platform.currentUser.id) === (activeSharedGroup.value === 'created'))
    .map(space => {
      const isEt = space.id === etWorkspaceId
      const isOwner = shared.canManage(space.id)
      const updatedAt = isEt
        ? [space.updatedAt, etReview.confirmed[0]?.confirmedAt ?? '', etReview.release?.publishedAt ?? '',
          ...scenarioTasks.tasksForObject('et-review', etWorkspaceId).map(task => task.writtenAt ?? ''),
        ].sort((a, b) => b.localeCompare(a))[0]
        : space.updatedAt
      return {
        id: space.id, name: space.name, updatedAt, isOwner,
        ownerName: platform.users.find(user => user.id === space.creatorId)?.name ?? '未知成员',
        permission: isOwner ? undefined : shared.canEdit(space.id) ? '可编辑' : '可查看',
        collaboratorCount: platform.users.filter(user => shared.canAccess(space.id, user.id)).length,
        fileCount: space.files.length + (isEt ? etReferenceFiles.value.length + etReview.confirmed.length : 0),
        to: spaceLocation(space.id),
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
})

const filteredCards = computed(() => sharedCards.value.filter(card =>
  card.name.toLocaleLowerCase().includes(searchKeyword.value)
  || card.ownerName.toLocaleLowerCase().includes(searchKeyword.value)
  || (card.id === etWorkspaceId && etWorkspaceId.toLocaleLowerCase().includes(searchKeyword.value))))
const directoryEntries = computed(() => sharedScope.value ? sharedEntries.value : personalEntries.value)
const filteredEntries = computed(() => directoryEntries.value.filter(entry => entry.name.toLocaleLowerCase().includes(searchKeyword.value)))
const visibleCount = computed(() => isSharedList.value ? filteredCards.value.length : filteredEntries.value.length)
const totalCount = computed(() => isSharedList.value ? sharedCards.value.length : directoryEntries.value.length)
const emptyMessage = computed(() => {
  if (unavailableSpace.value) return '当前共享目录不可用'
  if (searchKeyword.value) return isSharedList.value ? '没有找到匹配的共享工作空间' : '没有找到匹配的项目'
  if (!sharedScope.value) return '此文件夹为空'
  if (isSharedList.value) return activeSharedGroup.value === 'created'
    ? '你还没有创建共享工作空间' : '你还没有加入共享工作空间'
  if (isEtSpaceOpen.value && currentFolderId.value === 'checklists') return '暂无已确认的检查清单'
  if (isEtSpaceOpen.value && currentFolderId.value === 'deliveries') return '暂无可查看的任务与交付结果'
  return '此文件夹为空'
})

watch([sharedScope, currentFolderId, activeSharedGroup, selectedSpace, () => currentSpace.value?.id], () => {
  directorySearch.value = ''
  compactSearchOpen.value = false
  folderDialog.value = false
  spaceAction.value = undefined
  previewOpen.value = false
  checklistId.value = ''
  drawingPreview.value = undefined
  entryMutation.value = undefined
  void nextTick(revealCurrentFolder)
}, { immediate: true })

watch(canEditDirectory, allowed => {
  if (!allowed) entryMutation.value = undefined
})

watch(address, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(revealCurrentFolder)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watch([() => route.query.file, currentFolderId, sharedScope], ([fileId, folderId, shared], [previousFileId]) => {
  if (route.path !== workspacePath || shared) return
  if (typeof fileId !== 'string') {
    if (previousFileId === previewId.value) previewOpen.value = false
    return
  }
  const file = platform.myFiles.find(item => item.id === fileId && item.folderId === folderId)
  if (file) showFile(file)
  else previewOpen.value = false
}, { immediate: true })

function revealCurrentFolder() {
  if (address.value) address.value.scrollLeft = address.value.scrollWidth
}

function openFolder(id?: string) {
  if (sharedScope.value) {
    if (currentSpace.value) void router.push(spaceLocation(currentSpace.value.id, id))
  } else {
    void router.push({ path: workspacePath, query: { folder: id } })
  }
}

function openSharedDrawing(version: EtReviewVersion, indices?: number[]) {
  if (!isEtSpaceOpen.value) return
  drawingPreview.value = { version, indices }
}

async function toggleCompactSearch() {
  compactSearchOpen.value = !compactSearchOpen.value
  if (!compactSearchOpen.value && !isSharedList.value) directorySearch.value = ''
  await nextTick()
  if (compactSearchOpen.value) searchInput.value?.focus()
  else searchToggle.value?.focus()
}

function newSpace() {
  spaceName.value = ''
  spaceError.value = ''
  initialSpaceMembers.value = []
  spaceAction.value = { kind: 'create' }
}

function openSpaceAction(kind: SpaceCardAction, spaceId: string) {
  const space = sharedCards.value.find(card => card.id === spaceId)
  if (!isSharedList.value || !space || (space.isOwner ? kind === 'leave' : kind !== 'leave')) return
  spaceName.value = space.name
  spaceError.value = ''
  spaceAction.value = { kind, spaceId }
}

function submitSpaceAction() {
  const action = spaceAction.value
  if (!isSharedList.value || !action || action.kind === 'members') return
  switch (action.kind) {
    case 'create':
      if (initialSpaceMembers.value.some(member => !spaceMemberOptions.value.some(user => user.id === member.userId))) {
        spaceError.value = '部分成员已不可用，请重新选择'
        return
      }
      if (!shared.createWorkspace(spaceName.value, initialSpaceMembers.value)) {
        spaceError.value = '无法创建空间，请检查名称是否有效或与已有空间重名'
        return
      }
      sharedSearch.value.created = ''
      void router.push({ path: workspacePath, query: { scope: 'shared', group: 'created' } })
      ElMessage.success('共享工作空间已创建')
      break
    case 'rename':
      if (!shared.renameWorkspace(action.spaceId, spaceName.value)) {
        spaceError.value = '无法重命名，请检查空间名称和权限'
        return
      }
      ElMessage.success('空间已重命名')
      break
    case 'delete':
      if (!shared.deleteWorkspace(action.spaceId)) {
        spaceError.value = '无法删除空间，请检查空间是否仍可管理'
        return
      }
      ElMessage.success('空间已删除')
      break
    case 'leave':
      if (!shared.leaveWorkspace(action.spaceId)) {
        spaceError.value = '无法退出空间，请检查成员状态'
        return
      }
      ElMessage.success('已退出空间')
      break
  }
  spaceAction.value = undefined
}

function newFolder() {
  if (!canEditDirectory.value) return
  folderName.value = ''
  folderError.value = ''
  folderDialog.value = true
}

function createFolder() {
  if (!canEditDirectory.value) return
  const name = folderName.value.trim()
  if (!name) {
    folderError.value = '请输入文件夹名称'
    return
  }
  const created = currentSpace.value
    ? !matchesSampleEntry(name, currentFolderId.value) && shared.createFolder(currentSpace.value.id, name, currentFolderId.value)
    : platform.createWorkspaceFolder(name, currentFolderId.value)
  if (!created) {
    folderError.value = '名称无效或当前目录已有同名项目'
    return
  }
  search.value = ''
  folderDialog.value = false
}

function matchesSampleEntry(name: string, folderId: string | undefined) {
  const normalized = name.normalize('NFC').toLocaleLowerCase()
  return sampleEntriesIn(folderId).some(entry => entry.name.normalize('NFC').toLocaleLowerCase() === normalized)
}

function canChangeEntry(entry: Entry): entry is EditableEntry {
  return canEditDirectory.value && !!entry.editableKind
}

function openEntryMutation(actionId: unknown, entry: Entry) {
  const action = entryActions.find(item => item.id === actionId)
  if (!action || !canChangeEntry(entry)) return
  renameName.value = entry.name
  destinationFolderId.value = currentFolderId.value ?? ''
  entryError.value = ''
  entryMutation.value = { action, entry }
}

function commitEntryMutation() {
  const mutation = entryMutation.value
  if (!mutation || !canEditDirectory.value) return
  const { action, entry } = mutation
  if (!directoryEntries.value.some(item => item.id === entry.id && item.editableKind === entry.editableKind)) {
    entryError.value = '当前目录已找不到此项目'
    return
  }

  const kind = entry.editableKind
  const spaceId = currentSpace.value?.id
  let changed: boolean
  switch (action.id) {
    case 'rename': {
      const name = renameName.value.trim()
      changed = spaceId
        ? !matchesSampleEntry(name, currentFolderId.value) && shared.renameEntry(spaceId, kind, entry.id, name)
        : platform.renameWorkspaceEntry(kind, entry.id, name)
      if (!changed) entryError.value = '名称无效或当前目录已有同名项目'
      break
    }
    case 'move': {
      const folderId = destinationFolderId.value || undefined
      changed = spaceId
        ? !matchesSampleEntry(entry.name, folderId) && shared.moveEntry(spaceId, kind, entry.id, folderId)
        : platform.moveWorkspaceEntry(kind, entry.id, folderId)
      if (!changed) entryError.value = '无法移动，请检查目标目录或同名项目'
      break
    }
    case 'delete':
      changed = spaceId ? shared.deleteEntry(spaceId, kind, entry.id) : platform.deleteWorkspaceEntry(kind, entry.id)
      if (!changed) entryError.value = '暂时无法删除该项目，请刷新后重试'
      break
  }
  if (changed) {
    entryMutation.value = undefined
    ElMessage.success('已' + action.label)
  }
}

function getType(file: File): WorkspaceFile['type'] {
  if (/\.dxf$/i.test(file.name)) return 'document'
  if (file.type.startsWith('image/')) return 'image'
  if (/\.pdf$/i.test(file.name)) return 'pdf'
  if (/\.(csv|tsv|xlsx?|ods)$/i.test(file.name)) return 'sheet'
  if (/\.(md|txt|json)$/i.test(file.name) || file.type.startsWith('text/')) return 'text'
  return 'document'
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('文件读取失败'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  input.value = ''
  if (!canEditDirectory.value) return
  const userId = platform.currentUser.id
  const spaceId = currentSpace.value?.id
  const folderId = currentFolderId.value
  const sampleNames = etSampleEntries.value.map(entry => entry.name.normalize('NFC').toLocaleLowerCase())
  let added = 0
  uploading.value = true
  try {
    for (const file of selected) {
      if (platform.currentUser.id !== userId) break
      if (file.size > 1024 * 1024 || (!spaceId && platform.files.reduce((total, item) => total + item.size, 0) + file.size > 2 * 1024 * 1024)) {
        ElMessage.warning(file.name + ' 超出原型本地存储限制')
        continue
      }
      if (sampleNames.includes(file.name.trim().normalize('NFC').toLocaleLowerCase())) {
        ElMessage.warning('当前目录已存在 ' + file.name)
        continue
      }
      const type = getType(file)
      const readable = type === 'text' || /\.(csv|tsv)$/i.test(file.name)
      try {
        const content = readable ? await file.text() : ''
        const dataUrl = readable ? undefined : await readDataUrl(file)
        if (platform.currentUser.id !== userId) break
        const data = {
          folderId,
          name: file.name,
          type,
          size: file.size,
          content,
          ...(dataUrl ? { dataUrl } : {}),
        }
        if (spaceId) {
          if (!shared.addFile(spaceId, data)) {
            ElMessage.warning('无法上传 ' + file.name + '，请检查权限、重名或存储空间')
            continue
          }
        } else {
          platform.files.push({ ...data, id: makeId('file'), userId, updatedAt: nowIso(), source: 'upload' })
        }
        added += 1
      } catch {
        ElMessage.error('无法读取 ' + file.name)
      }
    }
  } finally {
    uploading.value = false
  }
  if (added) ElMessage.success('已上传 ' + added + ' 个文件')
}

function showFile(file: WorkspaceFile | SharedWorkspaceFile) {
  previewId.value = file.id
  previewOpen.value = true
}

function clearPreviewLocation() {
  if (platform.currentUser.id === workspaceUserId && route.path === workspacePath && !sharedScope.value && route.query.file === previewId.value) {
    void router.replace({ path: route.path, query: { ...route.query, file: undefined } })
  }
}

function useInChat(file: WorkspaceFile) {
  previewOpen.value = false
  void router.push({ path: '/work/chat', query: { context: file.id } })
}

function download(file: WorkspaceFile | SharedWorkspaceFile) {
  const url = file.dataUrl ?? URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  if (!file.dataUrl) setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function displaySize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(bytes / 1024) + ' KB'
}
</script>

<template>
  <section class="page-surface workspace-page" aria-label="工作空间">
    <header class="page-controls workspace-toolbar" :class="{ 'is-searching': compactSearchOpen }">
      <nav class="page-tabs" aria-label="工作空间切换">
        <RouterLink :to="sharedScope ? workspacePath : route.fullPath" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="!sharedScope ? 'page' : undefined" @click="navigate">
            <FolderOpen :size="16" aria-hidden="true" />个人空间
          </a>
        </RouterLink>
        <RouterLink :to="sharedScope ? route.fullPath : sharedLocation" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="sharedScope ? 'page' : undefined" @click="navigate">
            <UsersRound :size="16" aria-hidden="true" />共享空间
          </a>
        </RouterLink>
      </nav>
      <div class="workspace-directory-toolbar page-tab-toolbar">
        <nav v-if="isSharedList" class="workspace-group-nav page-segments" aria-label="共享工作空间分组">
          <RouterLink v-for="group in sharedGroups" :key="group.id"
            :to="{ ...sharedLocation, query: { ...sharedLocation.query, group: group.id } }" custom v-slot="{ href, navigate }">
            <a class="page-segment" :href="href" :aria-current="activeSharedGroup === group.id ? 'page' : undefined" @click="navigate">{{ group.name }}</a>
          </RouterLink>
        </nav>
        <nav v-else ref="address" class="folder-address" aria-label="当前文件目录">
          <template v-if="sharedScope">
            <RouterLink :to="sharedLocation" class="crumb"><UsersRound :size="15" aria-hidden="true" />共享工作空间</RouterLink>
            <template v-if="currentSpace">
              <ChevronRight :size="13" class="crumb-separator" aria-hidden="true" />
              <button v-if="currentFolder" type="button" class="crumb" @click="openFolder()">{{ currentSpace.name }}</button>
              <span v-else class="crumb current-crumb" aria-current="location">{{ currentSpace.name }}</span>
              <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
                <ChevronRight :size="13" class="crumb-separator" aria-hidden="true" />
                <span v-if="index === breadcrumbs.length - 1" class="crumb current-crumb" aria-current="location">{{ folder.name }}</span>
                <button v-else type="button" class="crumb" @click="openFolder(folder.id)">{{ folder.name }}</button>
              </template>
            </template>
          </template>
          <template v-else>
            <button v-if="currentFolder" type="button" class="crumb" @click="openFolder()">
              <FolderOpen :size="15" aria-hidden="true" />个人工作空间
            </button>
            <span v-else class="crumb current-crumb" aria-current="location"><FolderOpen :size="15" aria-hidden="true" />个人工作空间</span>
            <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
              <ChevronRight :size="13" class="crumb-separator" aria-hidden="true" />
              <span v-if="index === breadcrumbs.length - 1" class="crumb current-crumb" aria-current="location">{{ folder.name }}</span>
              <button v-else type="button" class="crumb" @click="openFolder(folder.id)">{{ folder.name }}</button>
            </template>
          </template>
        </nav>
        <el-input ref="searchInput" class="directory-search filter-field" v-model="search" :prefix-icon="Search"
          :placeholder="isSharedList ? '搜索共享工作空间' : '搜索当前目录'"
          :aria-label="isSharedList ? '搜索共享工作空间' : '搜索当前目录'"
          clearable @keydown.esc="compactSearchOpen && toggleCompactSearch()" />
        <button ref="searchToggle" type="button" class="icon-button compact-search-toggle"
          :class="{ 'has-filter': searchKeyword }"
          :aria-label="compactSearchOpen ? '关闭搜索' : searchKeyword ? '打开搜索（已筛选）' : '打开搜索'"
          :title="compactSearchOpen ? '关闭搜索' : searchKeyword ? '打开搜索（已筛选）' : '打开搜索'"
          :aria-expanded="compactSearchOpen" @click="toggleCompactSearch">
          <component :is="compactSearchOpen ? X : Search" :size="16" aria-hidden="true" />
        </button>

        <div class="page-toolbar-controls workspace-controls">
          <div class="workspace-actions">
            <el-button v-if="isSharedList" class="create-shared-space" type="primary" plain :icon="FolderPlus"
              :aria-label="spaceActionTitles.create" :title="spaceActionTitles.create" @click="newSpace">{{ spaceActionTitles.create }}</el-button>
            <template v-else-if="canEditDirectory">
              <el-button :icon="FolderPlus" aria-label="新建文件夹" title="新建文件夹" @click="newFolder">新建文件夹</el-button>
              <el-button text :icon="Upload" :loading="uploading" aria-label="上传文件" title="上传文件" @click="fileInput?.click()">上传文件</el-button>
              <input ref="fileInput" type="file" multiple hidden
                accept="image/*,.md,.txt,.json,.csv,.tsv,.xlsx,.xls,.ods,.pdf,.doc,.docx,.ppt,.pptx,.dxf" @change="upload" />
            </template>
            <span v-else-if="currentSpace && !unavailableSpace" class="workspace-permission">查看权限</span>
          </div>
          <div v-if="!isSharedList" class="view-switch page-segments" role="group" aria-label="显示方式">
            <button class="page-segment" type="button" aria-label="列表" title="列表" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'">
              <List :size="16" aria-hidden="true" /><span>列表</span>
            </button>
            <button class="page-segment" type="button" aria-label="图标" title="图标" :aria-pressed="viewMode === 'icons'" @click="viewMode = 'icons'">
              <LayoutGrid :size="15" aria-hidden="true" /><span>图标</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <SharedWorkspaceCards v-if="isSharedList && filteredCards.length" :cards="filteredCards" @action="openSpaceAction" />
    <div v-else-if="!isSharedList && filteredEntries.length" :aria-label="sharedScope ? '共享目录' : '个人文件'">
      <div :class="[viewMode === 'icons' ? 'file-grid' : 'file-table', { 'shared-files': sharedScope }]">
        <div v-if="viewMode === 'list'" class="file-row file-head" aria-hidden="true">
          <span>名称</span><span class="file-date">修改日期</span><span class="file-type">类型</span>
          <span v-if="!sharedScope" class="file-size">大小</span><span class="file-source">{{ sharedScope ? '共享信息' : '来源' }}</span><span>操作</span>
        </div>
        <article v-for="entry in filteredEntries" :key="entry.icon + '-' + entry.id" class="file-row">
          <button type="button" class="file-name" :title="entry.name"
            :aria-label="entry.icon === 'folder' ? entry.name + ' 文件夹' : entry.name" @click="entry.open()">
            <span class="file-icon" :class="'type-' + entry.icon" aria-hidden="true"><component :is="fileIcons[entry.icon]" /></span>
            <span class="file-name-text">
              <span class="file-label">{{ entry.name }}</span>
              <span v-if="entry.subtitle" class="file-subtitle">{{ entry.subtitle }}</span>
            </span>
          </button>
          <template v-if="viewMode === 'list'">
            <time v-if="entry.date" class="file-date" :datetime="entry.date">{{ modifiedDate.format(new Date(entry.date)) }}</time>
            <span v-else class="file-date">—</span>
            <span class="file-type">{{ entry.type }}</span>
            <span v-if="!sharedScope" class="file-size">{{ entry.size !== undefined ? displaySize(entry.size) : '—' }}</span>
            <span class="file-source">{{ entry.source || '—' }}</span>
          </template>
          <div v-if="viewMode === 'list' || canChangeEntry(entry)" class="file-actions">
            <button v-if="viewMode === 'list' && entry.action" type="button" class="file-action"
              :aria-label="entry.action.label === '引用' ? '引用' : entry.action.label + ' ' + entry.name"
              @click="(entry.action.run ?? entry.open)()">{{ entry.action.label }}</button>
            <el-dropdown v-if="canChangeEntry(entry)" trigger="click" placement="bottom-end" @command="openEntryMutation($event, entry)">
              <button type="button" class="file-more" :aria-label="'更多操作：' + entry.name" title="更多操作">
                <Ellipsis :size="17" aria-hidden="true" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="action in entryActions" :key="action.id" :command="action.id" :icon="action.icon">
                    {{ action.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </article>
      </div>
    </div>
    <div v-else class="empty">
      <span class="empty-icon"><FolderOpen :size="24" aria-hidden="true" /></span>
      <p>{{ emptyMessage }}</p>
      <RouterLink v-if="unavailableSpace" :to="sharedLocation" class="empty-link">返回共享工作空间列表</RouterLink>
    </div>

    <footer class="workspace-status" aria-live="polite">
      {{ searchKeyword ? visibleCount + ' / ' + totalCount : totalCount }} {{ isSharedList ? '个空间' : '项' }}
    </footer>

    <template v-if="isSharedList">
      <SharedWorkspaceMembersDialog v-if="spaceAction?.kind === 'members'" v-model="spaceDialogOpen" :space-id="spaceAction.spaceId" />
      <el-dialog v-else v-model="spaceDialogOpen" :title="spaceAction ? spaceActionTitles[spaceAction.kind] : ''"
        width="min(420px, calc(100vw - 30px))">
        <el-form v-if="spaceAction" label-position="top" @submit.prevent="submitSpaceAction">
          <el-form-item v-if="spaceAction.kind === 'create' || spaceAction.kind === 'rename'"
            :label="spaceAction.kind === 'create' ? '空间名称' : undefined">
            <el-input v-model="spaceName" placeholder="请输入空间名称" aria-label="空间名称" @input="spaceError = ''" />
          </el-form-item>
          <div v-else class="entry-delete-prompt">
            <p>{{ spaceActionTitles[spaceAction.kind] }}「{{ actionSpace?.name ?? spaceName }}」？</p>
            <p v-if="spaceAction.kind === 'delete'" class="muted">空间目录和其中的文件将一并删除，所有成员将失去访问权限。</p>
            <p v-else class="muted">退出后需要创建者重新邀请才能访问。你上传的文件会留在空间内。</p>
          </div>
          <el-form-item v-if="spaceAction.kind === 'create'" label="空间成员（可选）">
            <el-select v-model="selectedSpaceMemberIds" multiple filterable clearable collapse-tags :reserve-keyword="false"
              placement="top-start" placeholder="按姓名或部门选择成员" aria-label="选择空间成员" no-data-text="暂无可选成员">
              <el-option v-for="user in spaceMemberOptions" :key="user.id" :value="user.id"
                :label="user.department ? user.name + ' · ' + user.department : user.name" />
            </el-select>
            <ul v-if="initialSpaceMembers.length" class="space-member-list" aria-label="已选成员及权限">
              <li v-for="member in initialSpaceMembers" :key="member.userId">
                <span>{{ initialMemberNames[member.userId] ?? '不可用成员' }}</span>
                <select v-model="member.permission" :aria-label="(initialMemberNames[member.userId] ?? member.userId) + '的权限'">
                  <option value="view">查看</option>
                  <option value="edit">编辑</option>
                </select>
              </li>
            </ul>
          </el-form-item>
          <p v-if="spaceError" class="entry-dialog-error" role="alert">{{ spaceError }}</p>
          <div class="folder-dialog-actions">
            <el-button @click="spaceDialogOpen = false">取消</el-button>
            <el-button native-type="submit" :type="spaceAction.kind === 'delete' || spaceAction.kind === 'leave' ? 'danger' : 'primary'"
              :disabled="((spaceAction.kind === 'create' || spaceAction.kind === 'rename') && !spaceName.trim())
                || (spaceAction.kind === 'rename' && spaceName.trim() === actionSpace?.name)">
              {{ spaceAction.kind === 'create' ? '创建' : spaceAction.kind === 'rename' ? '保存' : spaceActionTitles[spaceAction.kind] }}
            </el-button>
          </div>
        </el-form>
      </el-dialog>
    </template>

    <el-dialog v-model="entryDialogOpen"
      :title="entryMutation ? entryMutation.action.label + (entryMutation.entry.editableKind === 'folder' ? '文件夹' : '文件') : ''"
      width="min(460px, calc(100vw - 30px))">
      <el-form v-if="entryMutation" class="entry-dialog-form" @submit.prevent="commitEntryMutation">
        <el-form-item v-if="entryMutation.action.id === 'rename'">
          <el-input v-model="renameName" aria-label="新名称" placeholder="输入新名称" @input="entryError = ''" />
        </el-form-item>
        <template v-else-if="entryMutation.action.id === 'move'">
          <p class="entry-dialog-name">{{ entryMutation.entry.name }}</p>
          <label class="entry-dialog-field">
            <span>移动到</span>
            <select v-model="destinationFolderId" aria-label="目标文件夹" @change="entryError = ''">
              <option value="">{{ currentSpace?.name ?? '个人工作空间' }}（根目录）</option>
              <option v-for="directory in moveDirectories" :key="directory.id" :value="directory.id">{{ directory.label }}</option>
            </select>
          </label>
        </template>
        <div v-else class="entry-delete-prompt">
          <p>删除「{{ entryMutation.entry.name }}」？</p>
          <p v-if="entryMutation.entry.editableKind === 'folder'" class="muted">其中的文件和子文件夹也会一并删除。</p>
        </div>
        <p v-if="entryError" class="entry-dialog-error" role="alert">{{ entryError }}</p>
        <div class="folder-dialog-actions">
          <el-button @click="entryDialogOpen = false">取消</el-button>
          <el-button native-type="submit" :type="entryMutation.action.id === 'delete' ? 'danger' : 'primary'"
            :disabled="entryMutation.action.id === 'rename' ? !renameName.trim() || renameName.trim() === entryMutation.entry.name
              : entryMutation.action.id === 'move' && destinationFolderId === (currentFolderId ?? '')">
            {{ entryMutation.action.id === 'rename' ? '保存' : entryMutation.action.label }}
          </el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-if="canEditDirectory" v-model="folderDialog" title="新建文件夹" width="min(420px, calc(100vw - 30px))">
        <el-form @submit.prevent="createFolder">
          <el-form-item :error="folderError">
            <el-input v-model="folderName" placeholder="文件夹名称" aria-label="文件夹名称" @input="folderError = ''" />
          </el-form-item>
          <div class="folder-dialog-actions">
            <el-button @click="folderDialog = false">取消</el-button>
            <el-button type="primary" native-type="submit">创建</el-button>
          </div>
        </el-form>
    </el-dialog>

    <el-dialog v-model="previewOpen" :title="preview?.name ?? '文件详情'" width="min(690px, calc(100vw - 30px))" @closed="clearPreviewLocation">
        <template v-if="preview">
          <div class="preview-meta">{{ typeLabels[preview.type] }} · {{ displaySize(preview.size) }} · {{ personalPreview ? sourceLabels[personalPreview.source] : '共享文件' }}</div>
          <img v-if="preview.type === 'image' && preview.dataUrl" class="preview-image" :src="preview.dataUrl" :alt="preview.name" />
          <pre v-else-if="preview.content" class="preview-content">{{ preview.content }}</pre>
          <p v-else class="muted">此文件可下载后查看。</p>
        </template>
        <template #footer>
          <template v-if="preview">
            <el-button :icon="Download" @click="download(preview)">下载</el-button>
            <el-button v-if="personalPreview" type="primary" :icon="ChatDotRound" @click="useInChat(personalPreview)">在新会话中引用</el-button>
          </template>
        </template>
    </el-dialog>

    <el-dialog v-if="sharedScope" v-model="sharedPreviewOpen"
      :title="drawingPreview ? reviewDrawingName(drawingPreview.version) : '出图检查清单'"
      :width="drawingPreview ? 'min(940px, calc(100vw - 30px))' : 'min(620px, calc(100vw - 30px))'" destroy-on-close>
      <template v-if="drawingPreview && isEtSpaceOpen">
        <el-button v-if="checklistPreview" text type="primary" class="preview-back" @click="drawingPreview = undefined">返回检查清单</el-button>
        <EtSharedDrawingPreview :version="drawingPreview.version" :indices="drawingPreview.indices" />
      </template>
      <template v-else-if="checklistPreview">
        <p class="preview-meta">{{ checklistPreview.version }} · {{ checklistPreview.scope }} · {{ checklistPreview.authorName }}确认 · {{ modifiedDate.format(new Date(checklistPreview.confirmedAt)) }}</p>
        <EtReviewFindings :findings="checklistPreview.findings" @locate="openSharedDrawing(checklistPreview.version, $event)" />
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.workspace-page {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
}
.empty-icon {
  display: grid; flex: none; place-items: center; width: 42px; height: 42px;
  border-radius: 8px; color: var(--accent); background: var(--soft);
}
.workspace-toolbar {
  position: sticky; top: 0; z-index: 1;
}
.workspace-directory-toolbar {
  display: flex; align-items: center; gap: 6px; min-width: 0;
}
.folder-address {
  display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 32px; flex: 0 1 auto; max-width: min(380px, 48cqi);
  overflow-x: auto; border: 1px solid var(--line); border-radius: 7px; padding: 2px 5px;
  background: var(--surface); white-space: nowrap; scrollbar-width: thin;
}
.crumb { display: inline-flex; flex: none; align-items: center; gap: 5px; padding: 3px 6px; color: var(--muted); font-size: 13px; }
button.crumb, a.crumb { border: 0; border-radius: 5px; background: transparent; }
button.crumb:hover, a.crumb:hover { color: var(--accent); background: var(--soft); }
button.crumb:focus-visible, a.crumb:focus-visible { outline-offset: 0; }
.current-crumb { color: var(--text); font-weight: 600; }
.crumb-separator { flex: none; color: #8994a8; }
.directory-search { flex: 0 1 clamp(132px, 19%, 240px); min-width: 0; }
.compact-search-toggle { display: none; }
.workspace-controls { flex: none; flex-wrap: nowrap; }
.workspace-actions { display: flex; flex: none; align-items: center; gap: 3px; }
.workspace-actions:empty { display: none; }
.workspace-actions > .el-button { margin-left: 0; padding-inline: 8px; font-size: 13px; }
.workspace-permission { padding-inline: 4px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.view-switch button { padding-inline: 7px; }
.file-table { --file-columns: minmax(0, 1fr) 126px 94px 64px 104px 76px; }
.file-table.shared-files { --file-columns: minmax(0, 1fr) 126px 94px 104px 76px; }
.file-table .file-row {
  display: grid; grid-template-columns: var(--file-columns); align-items: center; gap: 10px;
  min-height: 48px; padding-inline: 16px; border-bottom: 1px solid #eef1f6; font-size: 13px;
}
.file-table .file-head { min-height: 31px; color: var(--muted); background: #fafbfe; border-color: var(--line); font-size: 12px; }
.file-table article:hover, .file-table article:focus-within { background: #f4f7ff; }
.file-date, .file-type, .file-size, .file-source {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted);
}
.file-date, .file-size { font-variant-numeric: tabular-nums; }
.file-name {
  display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 40px;
  padding: 4px 0; border: 0; border-radius: 5px; background: transparent; color: var(--text); text-align: left; font: inherit;
}
.file-name:focus-visible { outline-offset: -1px; }
.file-icon {
  display: grid; flex: none; place-items: center; width: 28px; height: 28px;
  border-radius: 7px; color: #466392; background: #edf2fa;
}
.file-icon > svg { width: 17px; height: 17px; stroke-width: 1.7; }
.type-folder { color: #9a621a; background: #fff2d6; }
.type-folder > svg { fill: #ffd776; }
.type-sheet { color: #24744c; background: #e7f5ed; }
.type-pdf { color: #ac5144; background: #fdeee9; }
.type-image { color: #7254a3; background: #f0eafb; }
.type-drawing { color: #315cbd; background: #eaf0ff; }
.type-task { color: #317674; background: #e8f4f2; }
.file-name-text { display: grid; gap: 2px; min-width: 0; }
.file-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted); }
.file-table .file-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.file-action {
  min-height: 29px; padding: 3px 7px; border: 0; border-radius: 5px;
  background: transparent; color: var(--accent); font-size: 12px; white-space: nowrap;
}
.file-action:hover { background: var(--soft); }
.file-more {
  display: grid; place-items: center; width: 28px; height: 29px; padding: 0;
  border: 0; border-radius: 5px; color: var(--muted); background: transparent;
}
.file-more:hover, .file-more[aria-expanded="true"] { color: var(--accent); background: var(--soft); }
.file-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(108px, 100%), 124px)); gap: 8px;
  padding: 14px 16px;
}
.file-grid .file-row { position: relative; min-width: 0; }
.file-grid .file-actions { position: absolute; inset: 4px 3px auto auto; }
.file-grid .file-name {
  width: 100%; min-height: 99px; flex-direction: column; justify-content: flex-start; gap: 7px;
  padding: 10px 6px; border: 1px solid transparent; border-radius: 8px; text-align: center; font-size: 13px;
}
.file-grid .file-name:hover, .file-grid .file-name:focus-visible { border-color: #d3e1fa; background: #f4f7ff; }
.file-grid .file-icon { width: 40px; height: 40px; border-radius: 9px; }
.file-grid .file-icon > svg { width: 25px; height: 25px; stroke-width: 1.5; }
.file-grid .file-name-text { width: 100%; }
.file-grid .file-label {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere; line-height: 1.3;
}
.workspace-status {
  margin-top: auto; padding: 6px 16px; border-top: 1px solid var(--line);
  background: #fafbfe; color: var(--muted); font-size: 12px;
}
.folder-dialog-actions { display: flex; justify-content: flex-end; }
.space-member-list {
  width: 100%; max-height: min(200px, 30dvh); overflow: auto; margin: 8px 0 0; padding: 0;
  list-style: none; border: 1px solid var(--line); border-radius: 7px;
}
.space-member-list li {
  display: grid; grid-template-columns: minmax(0, 1fr) 74px; align-items: center; gap: 8px; padding: 6px 10px;
}
.space-member-list li + li { border-top: 1px solid var(--line); }
.space-member-list li > span { overflow-wrap: anywhere; line-height: 1.4; }
.entry-dialog-field { display: grid; gap: 6px; margin-bottom: 15px; color: var(--text); }
.entry-dialog-field select, .space-member-list select {
  width: 100%; min-height: 34px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px;
  color: var(--text); background: var(--surface);
}
.space-member-list select { min-height: 30px; }
.entry-dialog-name, .entry-delete-prompt { margin: 0 0 14px; overflow-wrap: anywhere; }
.entry-delete-prompt p { margin: 0 0 5px; }
.entry-dialog-error { margin: 0 0 12px; color: #a5342a; }
.preview-content { max-height: 52vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 9px; background: var(--soft); padding: 15px; font: inherit; line-height: 1.65; }
.preview-meta { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.preview-back { margin: 0 0 8px; }
.preview-image { display: block; max-width: 100%; max-height: 52vh; margin: 0 auto; object-fit: contain; }
.empty { display: grid; justify-items: center; padding: 45px 16px; color: var(--muted); }
.empty p { margin: 9px 0 0; }
.empty-link { color: var(--accent); margin-top: 8px; }
@container (max-width: 760px) {
  .workspace-toolbar { --page-control-inline: 8px; }
  .workspace-actions > .el-button:not(.create-shared-space) { width: 30px; padding: 0; }
  .workspace-actions :deep(.el-button:not(.create-shared-space) > span), .view-switch button span { display: none; }
}
@container (max-width: 710px) {
  .file-table, .file-table.shared-files { --file-columns: minmax(0, 1fr) 118px 74px 85px 70px; }
  .file-size { display: none; }
}
@container (max-width: 540px) {
  .workspace-directory-toolbar { gap: 5px; }
  .directory-search { display: none; }
  .compact-search-toggle {
    display: grid; flex: 0 0 30px; width: 30px; height: 30px;
    border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
  }
  .compact-search-toggle.has-filter { color: var(--accent); background: var(--soft); }
  .workspace-toolbar.is-searching .directory-search { display: inline-flex; flex: 1; }
  .workspace-toolbar.is-searching :is(.folder-address, .workspace-group-nav, .workspace-controls) { display: none; }
  .file-table, .file-table.shared-files { --file-columns: minmax(0, 1fr) 78px 68px; }
  .file-date, .file-source { display: none; }
}
@container (max-width: 380px) {
  .workspace-actions > .create-shared-space { width: 30px; padding: 0; }
  .workspace-actions :deep(.create-shared-space > span) { display: none; }
  .file-table .file-row, .workspace-status { padding-inline: 10px; }
  .view-switch button { padding-inline: 6px; }
  .file-table, .file-table.shared-files { --file-columns: minmax(0, 1fr) 68px; }
  .file-type { display: none; }
  .file-grid { grid-template-columns: repeat(auto-fill, minmax(min(101px, 100%), 1fr)); padding: 10px; }
}
</style>
