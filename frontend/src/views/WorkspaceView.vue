<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatDotRound, Download, Search, Upload } from '@element-plus/icons-vue'
import { ArrowUp, ChevronRight, FileImage, FileSpreadsheet, FileText, Folder, FolderOpen, FolderPlus, LayoutGrid, List } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { makeId, nowIso, usePlatformStore, type WorkspaceFile, type WorkspaceFolder } from '@/stores/platform'

const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
type Entry = { kind: 'folder'; item: WorkspaceFolder } | { kind: 'file'; item: WorkspaceFile }
const viewMode = ref<'list' | 'icons'>('list')
const search = ref('')
const fileInput = ref<HTMLInputElement>()
const address = ref<HTMLElement>()
const previewId = ref('')
const previewOpen = ref(false)
const uploading = ref(false)
const folderDialog = ref(false)
const folderName = ref('')
const folderError = ref('')
const preview = computed(() => platform.myFiles.find((file) => file.id === previewId.value))
const foldersById = computed(() => new Map(platform.myFolders.map(folder => [folder.id, folder])))
const currentFolder = computed(() => typeof route.query.folder === 'string' ? foldersById.value.get(route.query.folder) : undefined)
const currentFolderId = computed(() => currentFolder.value?.id)
const breadcrumbs = computed(() => {
  const parents: WorkspaceFolder[] = []
  const visited = new Set<string>()
  for (let folder = currentFolder.value; folder && !visited.has(folder.id); folder = foldersById.value.get(folder.parentId ?? '')) {
    parents.push(folder)
    visited.add(folder.id)
  }
  return parents.reverse()
})
const entries = computed<Entry[]>(() => {
  const query = search.value.trim().toLowerCase()
  const matches = (name: string) => name.toLowerCase().includes(query)
  const folders = platform.myFolders
    .filter(folder => folder.parentId === currentFolderId.value && matches(folder.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const files = platform.myFiles.filter(file => file.folderId === currentFolderId.value && matches(file.name))
  return [
    ...folders.map(item => ({ kind: 'folder' as const, item })),
    ...files.map(item => ({ kind: 'file' as const, item })),
  ]
})

const typeLabels: Record<WorkspaceFile['type'], string> = { document: '文档', sheet: '表格', pdf: 'PDF', text: '文本', image: '图片' }
const sourceLabels: Record<WorkspaceFile['source'], string> = { assistant: '助理产物', upload: '个人上传', sample: '示例资料' }
const fileIcons = { document: FileText, sheet: FileSpreadsheet, pdf: FileText, text: FileText, image: FileImage }
const modifiedDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

watch(currentFolderId, () => {
  search.value = ''
  folderDialog.value = false
  previewOpen.value = false
  void nextTick(revealCurrentFolder)
}, { immediate: true })

watch(address, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(revealCurrentFolder)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watch([() => route.path, () => route.query.folder, currentFolder], ([path, folderId, folder]) => {
  if (path === '/work/workspace' && folderId !== undefined && !folder) {
    void router.replace({ path: '/work/workspace' })
  }
}, { immediate: true })

function revealCurrentFolder() {
  if (address.value) address.value.scrollLeft = address.value.scrollWidth
}

function openFolder(id?: string) {
  void router.push({ path: '/work/workspace', query: id ? { folder: id } : {} })
}

function openEntry(entry: Entry) {
  if (entry.kind === 'folder') openFolder(entry.item.id)
  else showFile(entry.item)
}

function newFolder() {
  folderName.value = ''
  folderError.value = ''
  folderDialog.value = true
}

function createFolder() {
  const name = folderName.value.trim()
  if (!name) {
    folderError.value = '请输入文件夹名称'
    return
  }
  if (!platform.createWorkspaceFolder(name, currentFolderId.value)) {
    folderError.value = '名称无效或当前目录已有同名项目'
    return
  }
  search.value = ''
  folderDialog.value = false
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
  const userId = platform.currentUser.id
  const folderId = currentFolderId.value
  let added = 0
  uploading.value = true
  try {
    for (const file of selected) {
      if (platform.currentUser.id !== userId) break
      if (file.size > 1024 * 1024 || platform.files.reduce((total, item) => total + item.size, 0) + file.size > 2 * 1024 * 1024) {
        ElMessage.warning(file.name + ' 超出原型本地存储限制')
        continue
      }
      const type = getType(file)
      const readable = type === 'text' || /\.(csv|tsv)$/i.test(file.name)
      try {
        const content = readable ? await file.text() : ''
        const dataUrl = readable ? undefined : await readDataUrl(file)
        if (platform.currentUser.id !== userId) break
        platform.files.push({
          id: makeId('file'),
          userId,
          folderId,
          name: file.name,
          type,
          size: file.size,
          content,
          updatedAt: nowIso(),
          source: 'upload',
          ...(dataUrl ? { dataUrl } : {}),
        })
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

function showFile(file: WorkspaceFile) {
  previewId.value = file.id
  previewOpen.value = true
}

function useInChat(file: WorkspaceFile) {
  previewOpen.value = false
  void router.push({ path: '/work/chat', query: { context: file.id } })
}

function download(file: WorkspaceFile) {
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
  <section class="workspace-page" aria-label="工作空间">
    <header class="workspace-toolbar">
      <div class="address-row">
        <button
          type="button"
          class="icon-button up-folder"
          aria-label="返回上一级"
          title="返回上一级"
          :disabled="!currentFolder"
          @click="openFolder(currentFolder?.parentId)"
        ><ArrowUp :size="17" /></button>
        <nav ref="address" class="folder-address" aria-label="当前文件目录">
          <button v-if="currentFolder" type="button" class="crumb" @click="openFolder()">
            <FolderOpen :size="16" aria-hidden="true" />工作空间
          </button>
          <span v-else class="crumb current-crumb" aria-current="location"><FolderOpen :size="16" aria-hidden="true" />工作空间</span>
          <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
            <ChevronRight :size="14" class="crumb-separator" aria-hidden="true" />
            <span v-if="index === breadcrumbs.length - 1" class="crumb current-crumb" aria-current="location">{{ folder.name }}</span>
            <button v-else type="button" class="crumb" @click="openFolder(folder.id)">{{ folder.name }}</button>
          </template>
        </nav>
        <el-input class="directory-search" v-model="search" :prefix-icon="Search" placeholder="搜索当前目录" aria-label="搜索当前目录" clearable />
      </div>

      <div class="command-row">
        <div class="workspace-actions">
          <el-button text :icon="FolderPlus" @click="newFolder">新建文件夹</el-button>
          <el-button text :icon="Upload" :loading="uploading" @click="fileInput?.click()">上传文件</el-button>
        </div>
        <div class="view-switch" role="group" aria-label="显示方式">
          <button type="button" aria-label="列表" title="列表" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'">
            <List :size="16" /><span>列表</span>
          </button>
          <button type="button" aria-label="图标" title="图标" :aria-pressed="viewMode === 'icons'" @click="viewMode = 'icons'">
            <LayoutGrid :size="15" /><span>图标</span>
          </button>
        </div>
      </div>
      <input ref="fileInput" type="file" multiple hidden
        accept="image/*,.md,.txt,.json,.csv,.tsv,.xlsx,.xls,.ods,.pdf,.doc,.docx,.ppt,.pptx,.dxf" @change="upload" />
    </header>

    <div class="file-panel" aria-label="个人文件">
      <div v-if="entries.length" :class="viewMode === 'icons' ? 'file-grid' : 'file-table'">
        <div v-if="viewMode === 'list'" class="file-row file-head" aria-hidden="true">
          <span>名称</span><span class="file-date">修改日期</span><span class="file-type">类型</span>
          <span class="file-size">大小</span><span class="file-source">来源</span><span>操作</span>
        </div>
        <article v-for="entry in entries" :key="entry.kind + '-' + entry.item.id" class="file-row">
          <button
            class="file-name"
            type="button"
            :title="entry.item.name"
            :aria-label="entry.kind === 'folder' ? entry.item.name + ' 文件夹' : entry.item.name"
            @click="openEntry(entry)"
          >
            <span class="file-icon" :class="entry.kind === 'folder' ? 'type-folder' : 'type-' + entry.item.type" aria-hidden="true">
              <component :is="entry.kind === 'folder' ? Folder : fileIcons[entry.item.type]" />
            </span>
            <span class="file-label">{{ entry.item.name }}</span>
          </button>
          <template v-if="viewMode === 'list'">
            <time class="file-date" :datetime="entry.item.updatedAt">{{ modifiedDate.format(new Date(entry.item.updatedAt)) }}</time>
            <span class="file-type">{{ entry.kind === 'folder' ? '文件夹' : typeLabels[entry.item.type] }}</span>
            <span class="file-size">{{ entry.kind === 'file' ? displaySize(entry.item.size) : '' }}</span>
            <span class="file-source">{{ entry.kind === 'file' ? sourceLabels[entry.item.source] : '' }}</span>
            <div class="file-actions">
              <el-button v-if="entry.kind === 'file'" text :icon="ChatDotRound" @click="useInChat(entry.item)">引用</el-button>
            </div>
          </template>
        </article>
      </div>
      <div v-else class="empty">
        <FolderOpen :size="27" aria-hidden="true" />
        <p>{{ search ? '没有匹配的文件或文件夹' : '此目录为空' }}</p>
        <el-button v-if="search" @click="search = ''">清除搜索</el-button>
        <el-button v-else :icon="Upload" @click="fileInput?.click()">上传文件</el-button>
      </div>
    </div>
    <footer class="workspace-status" role="status">{{ entries.length }} 个项目</footer>

    <el-dialog v-model="folderDialog" title="新建文件夹" width="min(420px, calc(100vw - 30px))">
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

    <el-dialog v-model="previewOpen" :title="preview?.name ?? '文件详情'" width="min(690px, calc(100vw - 30px))">
      <template v-if="preview">
        <div class="preview-meta">{{ typeLabels[preview.type] }} · {{ displaySize(preview.size) }} · {{ sourceLabels[preview.source] }}</div>
        <img v-if="preview.type === 'image' && preview.dataUrl" class="preview-image" :src="preview.dataUrl" :alt="preview.name" />
        <pre v-else-if="preview.content" class="preview-content">{{ preview.content }}</pre>
        <p v-else class="muted">此文件可下载后查看。</p>
      </template>
      <template #footer>
        <template v-if="preview">
          <el-button :icon="Download" @click="download(preview)">下载</el-button>
          <el-button type="primary" :icon="ChatDotRound" @click="useInChat(preview)">在新会话中引用</el-button>
        </template>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.workspace-page {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: clip;
  background: var(--surface);
}
.workspace-toolbar { position: sticky; top: 0; z-index: 1; background: var(--surface); }
.address-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-bottom: 1px solid var(--line); background: #f5f7fa;
}
.up-folder { flex: 0 0 30px; height: 30px; border-radius: 4px; }
.up-folder:disabled { color: #a2acbd; background: transparent; }
.folder-address {
  display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 32px; flex: 1;
  overflow-x: auto; border: 1px solid var(--line); border-radius: 5px; padding: 2px 5px;
  background: var(--surface); white-space: nowrap; scrollbar-width: thin;
}
.crumb { display: inline-flex; flex: none; align-items: center; gap: 6px; padding: 3px 6px; color: var(--muted); font-size: 13px; }
button.crumb { border: 0; border-radius: 4px; background: transparent; }
button.crumb:hover { color: var(--accent); background: var(--soft); }
button.crumb:focus-visible { outline-offset: 0; }
.current-crumb { color: var(--text); }
.crumb-separator { flex: none; color: var(--muted); }
.directory-search { flex: 0 0 clamp(148px, 24%, 280px); --el-border-radius-base: 5px; }
.command-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 4px 10px; border-bottom: 1px solid var(--line);
}
.workspace-actions { display: flex; gap: 3px; }
.workspace-actions > .el-button { margin-left: 0; padding-inline: 8px; height: 30px; font-size: 13px; }
.view-switch { display: flex; flex: none; gap: 2px; }
.view-switch button {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px;
  min-height: 29px; border: 0; border-radius: 4px; color: var(--muted); background: transparent; font-size: 13px;
}
.view-switch button:hover, .view-switch button[aria-pressed="true"] { color: var(--accent); background: var(--soft); }
.file-table { --file-columns: minmax(0, 1fr) 132px 76px 76px 90px 66px; }
.file-table .file-row {
  display: grid; grid-template-columns: var(--file-columns); align-items: center; gap: 8px;
  min-height: 34px; padding-inline: 12px; border-bottom: 1px solid #f0f2f5; font-size: 13px;
}
.file-table .file-head {
  min-height: 31px; color: var(--muted); background: #fafbfc; border-color: var(--line); font-size: 12px;
}
.file-head > :not(:first-child) { border-left: 1px solid var(--line); }
.file-table article:hover, .file-table article:focus-within { background: #edf3ff; }
.file-date, .file-type, .file-size, .file-source, .file-head > :last-child { padding-left: 8px; color: var(--muted); }
.file-date, .file-size { font-variant-numeric: tabular-nums; white-space: nowrap; }
.file-name {
  display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 30px;
  padding: 2px 0; border: 0; background: transparent; color: var(--text); text-align: left; font: inherit;
}
.file-name:focus-visible { outline-offset: -1px; }
.file-icon { display: grid; flex: none; place-items: center; width: 20px; height: 20px; color: #4f6f9c; }
.file-icon > svg { width: 18px; height: 18px; stroke-width: 1.6; }
.type-folder { color: #9a621a; }
.type-folder > svg { fill: #ffd776; }
.type-sheet { color: #24744c; }
.type-pdf { color: #ac5144; }
.type-image { color: #7254a3; }
.file-table .file-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-actions .el-button { height: 27px; padding-inline: 5px; color: var(--accent); }
.file-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(96px, 100%), 108px)); gap: 6px;
  padding: 10px 12px;
}
.file-grid .file-row { min-width: 0; }
.file-grid .file-name {
  width: 100%; min-height: 89px; flex-direction: column; gap: 5px;
  padding: 8px 5px; border: 1px solid transparent; border-radius: 4px; text-align: center; font-size: 13px;
}
.file-grid .file-name:hover, .file-grid .file-name:focus-visible { border-color: #d3e1fa; background: #edf3ff; }
.file-grid .file-icon { width: 44px; height: 44px; }
.file-grid .file-icon > svg { width: 41px; height: 41px; stroke-width: 1.2; }
.file-grid .file-label {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere; line-height: 1.25;
}
.workspace-status {
  margin-top: auto; padding: 5px 12px; border-top: 1px solid var(--line);
  background: #fafbfc; color: var(--muted); font-size: 12px;
}
.folder-dialog-actions { display: flex; justify-content: flex-end; }
.preview-content { max-height: 52vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 9px; background: var(--soft); padding: 15px; font: inherit; line-height: 1.65; }
.preview-meta { color: var(--muted); font-size: 13px; margin-bottom: 12px; }
.preview-image { display: block; max-width: 100%; max-height: 52vh; margin: 0 auto; object-fit: contain; }
.empty { display: grid; justify-items: center; padding: 35px 16px; color: var(--muted); }
@container (max-width: 660px) {
  .file-table { --file-columns: minmax(0, 1fr) 132px 64px 60px 60px; }
  .file-source { display: none; }
}
@container (max-width: 500px) {
  .file-table { --file-columns: minmax(0, 1fr) 60px; }
  .file-date, .file-type, .file-size { display: none; }
}
@container (max-width: 420px) {
  .address-row { flex-wrap: wrap; padding-inline: 11px; }
  .folder-address { flex-basis: calc(100% - 38px); }
  .directory-search { flex-basis: 100%; }
  .command-row { flex-wrap: wrap; gap: 4px; padding-inline: 6px; }
  .workspace-actions > .el-button { padding-inline: 5px; }
  .view-switch { margin-left: auto; }
  .view-switch button { padding-inline: 6px; }
  .view-switch button span { display: none; }
  .file-grid { grid-template-columns: repeat(auto-fill, minmax(min(94px, 100%), 1fr)); }
}
</style>
