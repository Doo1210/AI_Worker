<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Archive, ArchiveRestore, ArchiveX, ArrowDown, ArrowUp, Bot, Check, ChevronDown, ChevronsUpDown, Clock,
  Ellipsis, FolderOpen, GripVertical, List, MessagesSquare, Search, SlidersHorizontal, X,
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import SidebarRecentSection from '@/components/SidebarRecentSection.vue'
import { moveConversationInOrder, reconcileManualOrder, withDraftFirst, type InsertSide } from '@/conversationOrder'
import { usePlatformStore, type Conversation } from '@/stores/platform'
import type { WorkspaceDirectoryDisplay } from '@/workspaceDirectory'

const props = defineProps<{ compact: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const store = usePlatformStore()
const route = useRoute()

const groupOptions = [
  { value: 'directory', label: '工作目录', icon: FolderOpen },
  { value: 'assistant', label: '助理', icon: Bot },
  { value: 'flat', label: '单列表', icon: List },
] as const
const sortOptions = [
  { value: 'manual', label: '手动排序', icon: ChevronsUpDown },
  { value: 'recent', label: '最近更新', icon: Clock },
] as const
const archiveOptions = [
  { value: 'hide', label: '隐藏已归档', icon: ArchiveX },
  { value: 'all', label: '全部会话', icon: MessagesSquare },
  { value: 'archived', label: '仅显示已归档', icon: Archive },
] as const
type Preferences = {
  groupBy: (typeof groupOptions)[number]['value']
  sortBy: (typeof sortOptions)[number]['value']
  archiveFilter: (typeof archiveOptions)[number]['value']
  manualOrders: Record<string, string[]>
  collapsedGroups: string[]
}
type Setting = Preferences['groupBy'] | Preferences['sortBy'] | Preferences['archiveFilter']

const storageKey = `ai-worker-conversation-list:${store.currentUser.id}`
const defaults: Preferences = {
  groupBy: 'directory', sortBy: 'recent', archiveFilter: 'hide', manualOrders: {},
  collapsedGroups: [],
}

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as (Partial<Preferences> & { manualOrder?: string[] }) | null
    const sortBy = sortOptions.find(option => option.value === saved?.sortBy)?.value ?? defaults.sortBy
    const manualOrders = sortBy === 'manual' ? Object.fromEntries(
      Object.entries(saved?.manualOrders ?? {})
        .filter(([, ids]) => Array.isArray(ids))
        .map(([key, ids]) => [key, ids.filter(id => typeof id === 'string')] as const),
    ) : {}
    if (sortBy === 'manual' && !saved?.manualOrders && Array.isArray(saved?.manualOrder)) {
      manualOrders.legacy = saved.manualOrder.filter(id => typeof id === 'string')
    }
    return {
      groupBy: groupOptions.find(option => option.value === saved?.groupBy)?.value ?? defaults.groupBy,
      sortBy,
      archiveFilter: archiveOptions.find(option => option.value === saved?.archiveFilter)?.value ?? defaults.archiveFilter,
      manualOrders,
      collapsedGroups: Array.isArray(saved?.collapsedGroups) ? saved.collapsedGroups.filter(id => typeof id === 'string') : [],
    }
  } catch {
    return defaults
  }
}

const preferences = ref(loadPreferences())
const settings = computed(() => [
  { label: '分组方式', options: groupOptions, selected: preferences.value.groupBy },
  { label: '排序方式', options: sortOptions, selected: preferences.value.sortBy },
  { label: '筛选会话', options: archiveOptions, selected: preferences.value.archiveFilter },
])

function updatePreferences(changes: Partial<Preferences>) {
  preferences.value = { ...preferences.value, ...changes }
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences.value))
  } catch {
    // Preferences remain available until the list is unmounted.
  }
}

function pickSetting(value: Setting) {
  const group = groupOptions.find(option => option.value === value)
  if (group) return updatePreferences({ groupBy: group.value })
  const sort = sortOptions.find(option => option.value === value)
  if (sort) {
    if (sort.value === preferences.value.sortBy) return
    const manualOrders = sort.value === 'manual' ? orders.value : {}
    return updatePreferences({ sortBy: sort.value, manualOrders })
  }
  const filter = archiveOptions.find(option => option.value === value)
  if (filter) updatePreferences({ archiveFilter: filter.value })
}

const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement>()
const searchToggle = ref<HTMLButtonElement>()
const query = ref('')
const groupIdPrefix = useId()
const collapsedGroups = computed(() => new Set(preferences.value.collapsedGroups))
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const searchTerm = computed(() => normalize(query.value))

function resetSearch() {
  searchOpen.value = false
  query.value = ''
}

function toggleSearch() {
  if (searchOpen.value) {
    resetSearch()
    void nextTick(() => searchToggle.value?.focus())
  } else {
    searchOpen.value = true
    void nextTick(() => searchInput.value?.focus())
  }
}

function groupContentId(group: HistoryGroup) {
  return `${groupIdPrefix}-${encodeURIComponent(group.id)}`
}

function toggleGroup(group: HistoryGroup) {
  const next = new Set(collapsedGroups.value)
  if (next.has(group.id)) next.delete(group.id)
  else next.add(group.id)
  updatePreferences({ collapsedGroups: [...next] })
}

watch(() => props.compact, resetSearch)

function findMatch(chat: Conversation, directory: WorkspaceDirectoryDisplay | undefined, assistant: string, term: string) {
  if (normalize(chat.title).includes(term) || normalize(chat.id).includes(term)) return ''
  if (directory && (normalize(directory.label).includes(term) || normalize(directory.path).includes(term))) return directory.label
  if (normalize(assistant).includes(term)) return assistant
  for (const message of chat.messages) {
    const text = message.text.trim().replace(/\s+/g, ' ')
    const start = text.toLocaleLowerCase().indexOf(term)
    if (start < 0) continue
    const from = Math.max(0, start - 16)
    const to = Math.min(text.length, start + term.length + 32)
    return `${from ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`
  }
}

type HistoryGroup = { id: string; label?: string; path?: string; rows: { chat: Conversation; match?: string }[] }
type HistoryScope = { id: string; label?: string; path?: string; members: Conversation[] }

const history = computed(() => {
  const byDirectory = new Map<string, HistoryScope>()
  const byAssistant = new Map<string, HistoryScope>()
  const directoryLabels = new Map<string, WorkspaceDirectoryDisplay | undefined>()
  const metadata = new Map<string, { chat: Conversation; directory?: WorkspaceDirectoryDisplay; assistant?: string }>()
  const assistants = new Map(store.visibleAssistants.map(assistant => [assistant.id, assistant.name]))
  const chats = store.personalConversations

  function add(scopes: Map<string, HistoryScope>, id: string, label: string, chat: Conversation, path?: string) {
    let scope = scopes.get(id)
    if (!scope) {
      scope = { id, label, path, members: [] }
      scopes.set(id, scope)
    }
    scope.members.push(chat)
  }

  for (const chat of chats) {
    const directoryId = JSON.stringify([chat.directory?.spaceId, chat.directory?.folderId])
    if (!directoryLabels.has(directoryId)) {
      const resolved = store.resolveConversationDirectory(chat.directory)
      directoryLabels.set(directoryId, resolved && { label: resolved.label, path: resolved.path })
    }
    const directory = directoryLabels.get(directoryId)
    const assistant = assistants.get(chat.assistantId)
    metadata.set(chat.id, { chat, directory, assistant })
    add(byDirectory, `directory:${directory ? directoryId : 'directory-unavailable'}`, directory?.label ?? '工作目录不可用', chat, directory?.path)
    add(byAssistant, `assistant:${assistant ? chat.assistantId : 'assistant-unavailable'}`, assistant ?? '助理不可用', chat)
  }

  const sortGroups = (scopes: Map<string, HistoryScope>) => [...scopes.values()]
    .sort((a, b) => (a.path ?? a.label ?? '').localeCompare(b.path ?? b.label ?? '', 'zh-CN') || a.id.localeCompare(b.id))
  const scopes: Record<Preferences['groupBy'], HistoryScope[]> = {
    directory: sortGroups(byDirectory), assistant: sortGroups(byAssistant), flat: [{ id: 'flat', members: chats }],
  }
  return { metadata, scopes }
})

const currentDraftId = computed(() => {
  const id = route.params.id
  if (typeof id === 'string' && route.path.startsWith('/work/chat/') && history.value.metadata.get(id)?.chat.messages.length === 0) return id
})

const orders = computed<Record<string, string[]>>(() => {
  const { sortBy, manualOrders } = preferences.value
  return Object.fromEntries(Object.values(history.value.scopes).flat().map(scope => {
    const ids = sortBy === 'recent' ? scope.members.map(chat => chat.id)
      : reconcileManualOrder(scope.members, manualOrders[scope.id] ?? manualOrders.legacy)
    return [scope.id, withDraftFirst(ids, currentDraftId.value)] as const
  }))
})

watch([currentDraftId, () => preferences.value.sortBy], ([id, sortBy]) => {
  if (!id || sortBy !== 'manual') return
  // Keep the selected draft at the top after its first message lands.
  const changed = Object.entries(orders.value)
    .some(([groupId, ids]) => ids[0] === id && preferences.value.manualOrders[groupId]?.[0] !== id)
  if (changed) updatePreferences({ manualOrders: orders.value })
}, { flush: 'sync', immediate: true })

const groups = computed<HistoryGroup[]>(() => {
  const { groupBy, archiveFilter } = preferences.value
  const term = searchTerm.value
  const { metadata, scopes } = history.value
  const result: HistoryGroup[] = []
  for (const scope of scopes[term ? 'flat' : groupBy]) {
    const ids = term ? scope.members.map(chat => chat.id) : orders.value[scope.id] ?? []
    const rows: HistoryGroup['rows'] = []
    for (const id of ids) {
      const entry = metadata.get(id)
      if (!entry) continue
      const { chat, assistant, directory } = entry
      if (!chat.messages.length && (term || chat.id !== currentDraftId.value)) continue
      if (archiveFilter !== 'all' && !!chat.archived !== (archiveFilter === 'archived')) continue
      const match = term ? findMatch(chat, directory, assistant ?? '', term) : undefined
      if (term && match === undefined) continue
      rows.push({ chat, match })
    }
    if (rows.length) result.push({ id: scope.id, label: scope.label, path: scope.path, rows })
  }
  return result
})
const emptyMessage = computed(() => searchTerm.value ? '没有找到匹配的会话'
  : preferences.value.archiveFilter === 'archived' ? '暂无已归档会话' : '暂无会话')
const activeGroup = computed(() => groups.value.find(group => group.label && group.rows.some(
  ({ chat }) => route.path === `/work/chat/${chat.id}`,
)))

const canReorder = (chat: Conversation) => !searchTerm.value && !chat.archived && chat.messages.length > 0
const dragged = ref<{ groupId: string; chatId: string }>()
const dropTarget = ref<{ chatId: string; side: InsertSide }>()

function move(group: HistoryGroup, chat: Conversation, targetId: string, side: InsertSide) {
  const completeOrder = orders.value[group.id]
  if (!canReorder(chat) || !completeOrder) return
  const visibleOrder = group.rows.map(row => row.chat.id)
  const next = moveConversationInOrder(completeOrder, visibleOrder, chat.id, targetId, targetId === currentDraftId.value ? 'after' : side)
  if (next) updatePreferences({ sortBy: 'manual', manualOrders: { ...preferences.value.manualOrders, ...orders.value, [group.id]: next } })
}

function startDrag(event: DragEvent, group: HistoryGroup, chat: Conversation) {
  if (!canReorder(chat) || !event.dataTransfer) return event.preventDefault()
  event.dataTransfer.setData('text/plain', chat.id)
  event.dataTransfer.effectAllowed = 'move'
  dragged.value = { groupId: group.id, chatId: chat.id }
}

function dragPlacement(event: DragEvent, group: HistoryGroup, chatId: string): InsertSide | undefined {
  const source = dragged.value
  if (!source || source.groupId !== group.id || source.chatId === chatId || !(event.currentTarget instanceof HTMLElement)) return
  const rect = event.currentTarget.getBoundingClientRect()
  const side = chatId === currentDraftId.value || event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before'
  const visible = group.rows.map(row => row.chat.id)
  if (!moveConversationInOrder(orders.value[group.id] ?? [], visible, source.chatId, chatId, side)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  return side
}

function dragOver(event: DragEvent, group: HistoryGroup, chatId: string) {
  const side = dragPlacement(event, group, chatId)
  dropTarget.value = side ? { chatId, side } : undefined
}

function endDrag() {
  dragged.value = undefined
  dropTarget.value = undefined
}

function leaveDrop(event: DragEvent, chatId: string) {
  const { currentTarget, relatedTarget } = event
  if (currentTarget instanceof Node && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return
  if (dropTarget.value?.chatId === chatId) dropTarget.value = undefined
}

function dropConversation(event: DragEvent, group: HistoryGroup, chatId: string) {
  const side = dragPlacement(event, group, chatId)
  const chat = group.rows.find(row => row.chat.id === dragged.value?.chatId)?.chat
  if (side && chat) move(group, chat, chatId, side)
  endDrag()
}

function rowAction(command: 'archive' | 'up' | 'down', group: HistoryGroup, index: number) {
  const chat = group.rows[index]!.chat
  if (command === 'archive') {
    const archived = !chat.archived
    if (!store.setConversationArchived(chat.id, archived)) {
      ElMessage.warning('会话正在回复，请稍后再试')
      return
    }
    ElMessage.success(archived ? '会话已归档' : '已取消归档')
  } else {
    const up = command === 'up'
    const target = group.rows[index + (up ? -1 : 1)]
    if (target) move(group, chat, target.chat.id, up ? 'before' : 'after')
  }
}

function openConversation(event: MouseEvent, close: () => void) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  resetSearch()
  close()
  emit('navigate')
}
</script>

<template>
  <SidebarRecentSection label="会话" :compact="compact">
    <template #icon><MessagesSquare :size="18" :stroke-width="1.8" aria-hidden="true" /></template>
    <template #heading="{ appendTo }">
      <div v-if="searchOpen" class="conversation-list-search" @keydown.esc.stop.prevent="toggleSearch">
        <Search :size="14" aria-hidden="true" />
        <input ref="searchInput" v-model="query" type="text" aria-label="搜索会话" placeholder="搜索会话" />
        <button type="button" class="icon-button list-tool" aria-label="关闭会话搜索" title="关闭会话搜索" @click="toggleSearch">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
      <div v-else class="conversation-list-toolbar">
        <span class="sidebar-label">会话</span>
        <button ref="searchToggle" type="button" class="icon-button list-tool" aria-label="搜索会话" title="搜索会话"
          :aria-expanded="searchOpen" @click="toggleSearch">
          <Search :size="15" aria-hidden="true" />
        </button>
        <el-dropdown trigger="click" placement="bottom-end" :append-to="appendTo" max-height="calc(100dvh - 24px)"
          popper-class="conversation-list-settings" @command="pickSetting">
          <button type="button" class="icon-button list-tool" aria-label="会话列表展示设置" title="会话列表展示设置">
            <SlidersHorizontal :size="15" aria-hidden="true" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <li v-for="section in settings" :key="section.label" class="list-setting-group" role="group" :aria-label="section.label">
                <div class="list-setting-label" aria-hidden="true">{{ section.label }}</div>
                <ul role="presentation">
                  <el-dropdown-item v-for="option in section.options" :key="option.value" :command="option.value"
                    :aria-current="section.selected === option.value ? 'true' : undefined">
                    <component :is="option.icon" :size="15" aria-hidden="true" />{{ option.label }}
                    <Check v-if="section.selected === option.value" class="setting-check" :size="15" aria-hidden="true" />
                  </el-dropdown-item>
                </ul>
              </li>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </template>

    <template #default="{ close, appendTo }">
      <nav v-if="groups.length" class="history-nav" :aria-label="searchTerm ? '会话搜索结果' : '会话'">
        <div v-for="group in groups" :key="group.id" class="history-group" :class="{ 'has-heading': group.label }"
          :role="group.label ? 'group' : undefined" :aria-label="group.label">
          <button v-if="group.label" type="button" class="history-group-label" :title="group.path ?? group.label"
            :class="{ 'contains-active': activeGroup === group && collapsedGroups.has(group.id) }"
            :aria-expanded="!collapsedGroups.has(group.id)" :aria-controls="groupContentId(group)" @click="toggleGroup(group)">
            <component :is="preferences.groupBy === 'directory' ? FolderOpen : Bot" class="history-group-icon" aria-hidden="true" />
            <span>{{ group.label }}</span>
            <ChevronDown :size="12" class="history-disclosure" aria-hidden="true" />
          </button>
          <div v-show="!group.label || !collapsedGroups.has(group.id)" :id="group.label ? groupContentId(group) : undefined"
            class="history-group-rows">
            <div v-for="({ chat, match }, index) in group.rows" :key="chat.id" class="conversation-list-row"
              :class="{ 'is-archived': chat.archived, 'keeps-drag-handle': preferences.sortBy === 'manual' }"
              :data-drop-side="dropTarget?.chatId === chat.id ? dropTarget.side : undefined"
              @dragend="endDrag"
              @dragover="dragOver($event, group, chat.id)"
              @dragleave="leaveDrop($event, chat.id)" @drop="dropConversation($event, group, chat.id)">
              <RouterLink :to="`/work/chat/${chat.id}`" exact-active-class="active" class="history-link" draggable="false"
                :title="chat.title" @click="openConversation($event, close)">
                <span class="conversation-list-text">
                  <span>{{ chat.title }}</span>
                  <small v-if="match" :title="match">{{ match }}</small>
                </span>
                <span v-if="chat.archived" class="archived-tag">已归档</span>
                <span v-if="canReorder(chat)" class="conversation-drag-handle" draggable="true" aria-hidden="true"
                  @click.stop.prevent @dragstart="startDrag($event, group, chat)"><GripVertical :size="15" /></span>
              </RouterLink>
              <el-dropdown v-if="chat.messages.length" class="conversation-row-menu" trigger="click" placement="bottom-end" :append-to="appendTo"
                @command="rowAction($event, group, index)">
                <button type="button" class="icon-button list-tool" :aria-label="`更多操作：${chat.title}`" title="更多操作">
                  <Ellipsis :size="15" aria-hidden="true" />
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canReorder(chat)" command="up"
                      :disabled="index === 0 || (!!currentDraftId && group.rows[index - 1]?.chat.id === currentDraftId)" :icon="ArrowUp">上移</el-dropdown-item>
                    <el-dropdown-item v-if="canReorder(chat)" command="down" :disabled="index === group.rows.length - 1" :icon="ArrowDown">下移</el-dropdown-item>
                    <el-dropdown-item command="archive" :divided="canReorder(chat)" :icon="chat.archived ? ArchiveRestore : Archive">
                      {{ chat.archived ? '取消归档' : '归档' }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </nav>
      <p v-else class="history-empty conversation-list-empty" role="status">{{ emptyMessage }}</p>
    </template>
  </SidebarRecentSection>
</template>

<style scoped>
.conversation-list-toolbar, .conversation-list-search { display: flex; align-items: center; gap: 3px; margin: 0 3px 3px 0; }
.conversation-list-toolbar .sidebar-label { flex: 1; padding: 0 8px; }
.history-disclosure { flex: none; }
[aria-expanded="false"] > .history-disclosure { transform: rotate(-90deg); }
.list-tool { width: 26px; height: 26px; padding: 0; border-radius: 6px; color: var(--muted); }
.list-tool:is([aria-expanded="true"], :hover) { background: var(--soft); color: var(--accent); }
.conversation-list-search { padding-inline-start: 7px; border-radius: 6px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
.conversation-list-search:focus-within { box-shadow: inset 0 0 0 1px var(--accent); }
.conversation-list-search > svg { flex: none; color: var(--muted); }
.conversation-list-search input { flex: 1; width: 0; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 13px; }
.conversation-list-search .list-tool:hover { background: transparent; color: var(--text); }
.conversation-list-search .list-tool:focus-visible { outline-offset: -3px; }
.conversation-list-empty { margin-block: 8px; }
.history-group {
  --row-inset: 8px;
  --group-icon-size: 14px;
  --group-icon-gap: 6px;
  display: grid; gap: 1px; min-width: 0;
}
.history-group + .history-group { margin-top: 4px; }
.history-group.has-heading { --title-inset: calc(var(--row-inset) + var(--group-icon-size) + var(--group-icon-gap)); }
.history-group-label {
  display: flex; align-items: center; min-width: 0; border: 0; border-radius: 6px; background: transparent; text-align: start;
  gap: var(--group-icon-gap); min-height: 24px; padding-block: 3px; padding-inline: var(--row-inset) 10px;
  color: var(--muted); font-size: 11px; font-weight: 650;
}
.history-group-label:hover { background: var(--surface-hover); color: var(--text); }
.history-group-label:focus-visible { outline-offset: -2px; }
.history-group-label.contains-active { color: var(--accent); }
.history-group-icon { flex: none; width: var(--group-icon-size); height: var(--group-icon-size); }
.history-group-label span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-group-rows { display: grid; gap: 1px; min-width: 0; }
.conversation-list-row { position: relative; min-width: 0; border-radius: var(--radius-surface); }
.conversation-list-row .history-link { gap: 4px; min-height: 28px; padding-block: 3px; padding-inline: var(--title-inset, var(--row-inset)) 32px; }
.conversation-drag-handle { display: grid; flex: 0 0 16px; align-self: stretch; place-items: center; cursor: grab; color: var(--muted); }
.conversation-drag-handle svg { pointer-events: none; }
.conversation-list-text { display: grid; flex: 1; gap: 2px; }
.conversation-list-text small { overflow: hidden; text-overflow: ellipsis; color: var(--muted); font-size: 11px; }
.conversation-list-row.is-archived .history-link:not(.active) { color: var(--muted); }
.archived-tag { flex: none; font-size: 10px; color: var(--muted); }
.conversation-list-row[data-drop-side]::after {
  position: absolute; inset-inline: 3px; height: 2px; border-radius: 2px; background: var(--accent); content: ''; pointer-events: none;
}
.conversation-list-row[data-drop-side="before"]::after { inset-block-start: 0; }
.conversation-list-row[data-drop-side="after"]::after { inset-block-end: 0; }
.conversation-row-menu { position: absolute; inset: 50% 3px auto auto; transform: translateY(-50%); }

.list-setting-group { padding: 3px 4px; }
.list-setting-group + .list-setting-group { border-top: 1px solid var(--line); margin-top: 3px; padding-top: 6px; }
.list-setting-group ul { margin: 0; padding: 0; list-style: none; }
.list-setting-label { padding: 3px 8px; color: var(--muted); font-size: 11px; font-weight: 650; }
.list-setting-group :deep(.el-dropdown-menu__item) { min-width: 174px; min-height: 32px; gap: 8px; padding: 3px 8px; border-radius: 6px; }
.setting-check { margin-inline-start: auto; color: var(--accent); }
@media (hover: hover) and (pointer: fine) {
  .conversation-row-menu { opacity: 0; }
  .conversation-list-row:not(.keeps-drag-handle, :hover, :focus-within) .conversation-drag-handle { opacity: 0; }
  .conversation-list-row:is(:hover, :focus-within) .conversation-row-menu,
  .conversation-row-menu:has([aria-expanded="true"]) { opacity: 1; }
}
@media (pointer: coarse) {
  .conversation-list-search input { font-size: 16px; }
}
</style>
