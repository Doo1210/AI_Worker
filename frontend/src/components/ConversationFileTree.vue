<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, FileSpreadsheet, FileText, Folder, FolderOpen, Image } from 'lucide-vue-next'
import { usePlatformStore } from '@/stores/platform'
import type { DirectoryFile, DirectoryFolder, ResolvedWorkspaceDirectory } from '@/workspaceDirectory'

type Entry = { kind: 'folder'; item: DirectoryFolder } | { kind: 'file'; item: DirectoryFile }
type Row = Entry & { depth: number }

const props = withDefaults(defineProps<{
  activeFileId?: string
  directory?: ResolvedWorkspaceDirectory
  fileFilter?: (file: DirectoryFile) => boolean
  hideHeading?: boolean
  emptyText?: string
}>(), { emptyText: '当前目录暂无文件' })
const emit = defineEmits<{ openFile: [id: string] }>()
const store = usePlatformStore()
const expandedFolders = ref(new Set<string>())
const nameOrder = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const files = computed(() => props.directory?.files ?? store.myFiles)
const folders = computed(() => props.directory?.folders ?? store.myFolders)

const rows = computed(() => {
  const matchingFiles = props.fileFilter ? files.value.filter(props.fileFilter) : files.value
  let shownFolders = folders.value
  if (props.fileFilter) {
    const foldersById = new Map(shownFolders.map(folder => [folder.id, folder]))
    const included = new Set<string>()
    for (const file of matchingFiles) {
      let id = file.folderId
      while (id && !included.has(id)) {
        included.add(id)
        id = foldersById.get(id)?.parentId
      }
    }
    shownFolders = shownFolders.filter(folder => included.has(folder.id))
  }
  const entries: Entry[] = [
    ...shownFolders.map(item => ({ kind: 'folder' as const, item })),
    ...matchingFiles.map(item => ({ kind: 'file' as const, item })),
  ]
  const byParent = new Map<string | undefined, Entry[]>()
  for (const entry of entries) {
    const parentId = entry.kind === 'folder' ? entry.item.parentId : entry.item.folderId
    const siblings = byParent.get(parentId)
    if (siblings) siblings.push(entry)
    else byParent.set(parentId, [entry])
  }

  const visible: Row[] = []
  function appendChildren(parentId: string | undefined, depth: number) {
    const siblings = byParent.get(parentId) ?? []
    siblings.sort((a, b) => a.kind === b.kind
      ? nameOrder.compare(a.item.name, b.item.name)
      : a.kind === 'folder' ? -1 : 1)
    for (const entry of siblings) {
      visible.push({ ...entry, depth })
      if (entry.kind === 'folder' && expandedFolders.value.has(entry.item.id)) appendChildren(entry.item.id, depth + 1)
    }
  }

  appendChildren(props.directory?.folderId, 0)
  return visible
})

function activate(entry: Entry) {
  if (entry.kind === 'file') {
    emit('openFile', entry.item.id)
    return
  }
  const id = entry.item.id
  if (expandedFolders.value.has(id)) expandedFolders.value.delete(id)
  else expandedFolders.value.add(id)
}

function entryIcon(entry: Entry) {
  if (entry.kind === 'folder') return expandedFolders.value.has(entry.item.id) ? FolderOpen : Folder
  if (entry.item.type === 'sheet') return FileSpreadsheet
  if (entry.item.type === 'image') return Image
  return FileText
}

watch([() => store.currentUser.id, () => props.directory?.spaceId, () => props.directory?.folderId], () => expandedFolders.value.clear())
watch([() => props.activeFileId, files, folders], () => {
  const foldersById = new Map(folders.value.map(folder => [folder.id, folder]))
  const file = files.value.find(item => item.id === props.activeFileId)
  const visited = new Set<string>()
  let folderId = file?.folderId
  while (folderId && !visited.has(folderId)) {
    const folder = foldersById.get(folderId)
    if (!folder) break
    visited.add(folderId)
    expandedFolders.value.add(folderId)
    folderId = folder.parentId
  }
}, { immediate: true })
</script>

<template>
  <section class="file-tree" aria-label="工作目录文件">
    <h3 v-if="!hideHeading" class="file-tree-heading" :title="directory?.path"><FolderOpen :size="15" aria-hidden="true" />{{ directory?.label ?? '工作目录' }}</h3>
    <ul v-if="rows.length" class="file-tree-list">
      <li v-for="entry in rows" :key="entry.kind + '-' + entry.item.id">
        <button
          type="button"
          class="file-tree-row"
          :style="{ paddingInlineStart: (6 + Math.min(entry.depth, 8) * 12) + 'px' }"
          :aria-expanded="entry.kind === 'folder' ? expandedFolders.has(entry.item.id) : undefined"
          :aria-current="entry.kind === 'file' && entry.item.id === activeFileId ? 'true' : undefined"
          :title="entry.item.name"
          @click="activate(entry)"
        >
          <ChevronRight v-if="entry.kind === 'folder'" class="file-tree-chevron" :size="12" aria-hidden="true" />
          <span v-else class="file-tree-spacer" aria-hidden="true"></span>
          <component :is="entryIcon(entry)" :size="15" class="file-tree-icon" aria-hidden="true" />
          <span class="file-tree-name">{{ entry.item.name }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="file-tree-empty">{{ emptyText }}</p>
  </section>
</template>

<style scoped>
.file-tree { min-width: 0; padding: 7px 9px 10px; }
.file-tree-heading { display: flex; align-items: center; gap: 7px; margin: 0; padding: 7px 5px; color: var(--text); font-size: 13px; font-weight: 650; }
.file-tree-heading svg, .file-tree-icon, .file-tree-chevron { flex: none; color: var(--muted); }
.file-tree-list { display: grid; gap: 1px; margin: 2px 0 0; padding: 0; list-style: none; }
.file-tree-row {
  display: flex; align-items: center; gap: 5px; width: 100%; min-width: 0; min-height: 29px;
  padding: 4px 7px; border: 0; border-radius: 5px; background: transparent;
  color: var(--text); text-align: left; font-size: 12px;
}
.file-tree-row:hover { background: var(--soft); }
.file-tree-row[aria-current="true"] { background: #e7edfe; color: var(--accent); }
.file-tree-row[aria-current="true"] .file-tree-icon { color: inherit; }
.file-tree-row:focus-visible { outline-offset: -2px; }
.file-tree-row[aria-expanded="true"] .file-tree-chevron { transform: rotate(90deg); }
.file-tree-spacer { flex: 0 0 12px; }
.file-tree-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-tree-empty { margin: 6px 5px; color: var(--muted); font-size: 12px; line-height: 1.55; }
</style>
