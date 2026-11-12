<script lang="ts">
export type SidebarTab = 'guide' | 'files' | 'terminal' | 'browser' | `file:${string}` | `artifact:${string}`

export interface SidebarLayout {
  open: boolean
  tabs: SidebarTab[]
  active: SidebarTab
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Compass, FileText, FolderOpen, Globe, Maximize2, Minimize2, PanelRightClose, Plus, Terminal, X } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { usePlatformStore, type Conversation } from '@/stores/platform'
import ConversationFileTree from './ConversationFileTree.vue'
import ConversationSidebarBrowser from './ConversationSidebarBrowser.vue'
import ConversationSidebarTerminal from './ConversationSidebarTerminal.vue'

const props = defineProps<{ layout: SidebarLayout; conversation?: Conversation; expanded: boolean }>()
const emit = defineEmits<{
  'update:layout': [layout: SidebarLayout]
  close: []
  expand: []
  reference: [id: string]
}>()
const store = usePlatformStore()
const tabStrip = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()
const tools = [
  { id: 'files', label: '文件', action: '工作区文件', icon: FolderOpen },
  { id: 'terminal', label: '终端', action: '新建终端', icon: Terminal },
  { id: 'browser', label: '浏览器', action: '浏览器', icon: Globe },
] as const
const artifacts = computed(() => props.conversation?.messages.filter(message => message.artifactName) ?? [])
const filesById = computed(() => new Map(store.myFiles.map(file => [file.id, file])))
const artifactsById = computed(() => new Map(artifacts.value.map(message => [message.id, message])))
const activeFile = computed(() => props.layout.active.startsWith('file:') ? filesById.value.get(props.layout.active.slice(5)) : undefined)
const activeArtifact = computed(() => props.layout.active.startsWith('artifact:') ? artifactsById.value.get(props.layout.active.slice(9)) : undefined)

watch([() => props.layout.active, () => props.layout.open], () => {
  if (props.layout.open) {
    void nextTick(() => tabStrip.value?.querySelector('.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }
})

function tabLabel(tab: SidebarTab) {
  if (tab === 'guide') return '引导'
  if (tab.startsWith('file:')) return filesById.value.get(tab.slice(5))?.name ?? '文件'
  if (tab.startsWith('artifact:')) return artifactsById.value.get(tab.slice(9))?.artifactName ?? '产物'
  return tools.find(tool => tool.id === tab)?.label ?? ''
}

function tabIcon(tab: SidebarTab) {
  if (tab === 'guide') return Compass
  return tools.find(tool => tool.id === tab)?.icon ?? FileText
}

function select(tab: SidebarTab) {
  emit('update:layout', { ...props.layout, active: tab })
}

function openTab(tab: SidebarTab, replaceGuide = false) {
  const tabs = replaceGuide ? props.layout.tabs.filter(item => item !== 'guide') : [...props.layout.tabs]
  if (!tabs.includes(tab)) tabs.push(tab)
  emit('update:layout', { open: true, tabs, active: tab })
}

function closeTab(tab: SidebarTab) {
  const index = props.layout.tabs.indexOf(tab)
  const tabs = props.layout.tabs.filter(item => item !== tab)
  if (!tabs.length) {
    emit('update:layout', { open: false, tabs: ['guide'], active: 'guide' })
    return
  }
  const active = props.layout.active === tab ? tabs[Math.min(index, tabs.length - 1)]! : props.layout.active
  emit('update:layout', { ...props.layout, tabs, active })
}

function openFile(id: string) {
  if (filesById.value.has(id)) openTab(`file:${id}`)
}

function saveArtifact(id: string) {
  if (!props.conversation) return
  const fileId = store.saveMessageFile(props.conversation.id, id)
  if (fileId) ElMessage.success('已保存到个人工作空间')
  else ElMessage.error('暂时无法保存此产物')
}

function downloadFile() {
  const file = activeFile.value
  if (!file) return
  const url = file.dataUrl ?? URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  if (!file.dataUrl) setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function focusClose() {
  closeButton.value?.focus({ preventScroll: true })
}

defineExpose({ openFile, focusClose })
</script>

<template>
  <aside id="conversation-right-sidebar" class="right-sidebar" aria-label="会话右侧栏">
    <header class="sidebar-toolbar">
      <div ref="tabStrip" class="sidebar-tabs" role="group" aria-label="右侧栏标签">
        <div v-for="tab in layout.tabs" :key="tab" class="sidebar-tab" :class="{ selected: layout.active === tab }">
          <button type="button" :aria-pressed="layout.active === tab" :title="tabLabel(tab)" @click="select(tab)">
            <component :is="tabIcon(tab)" :size="14" aria-hidden="true" />
            <span>{{ tabLabel(tab) }}</span>
          </button>
          <button type="button" class="tab-close" :aria-label="'关闭标签 ' + tabLabel(tab)" @click="closeTab(tab)">
            <X :size="12" />
          </button>
        </div>
      </div>
      <button v-if="!layout.tabs.includes('guide')" type="button" class="toolbar-button" aria-label="新建标签" title="新建标签" @click="openTab('guide')">
        <Plus :size="16" />
      </button>
      <button
        type="button"
        class="toolbar-button expand-sidebar"
        :aria-label="expanded ? '退出全屏' : '全屏右侧栏'"
        :title="expanded ? '退出全屏' : '全屏右侧栏'"
        @click="emit('expand')"
      ><component :is="expanded ? Minimize2 : Maximize2" :size="15" /></button>
      <button
        ref="closeButton"
        type="button"
        class="toolbar-button"
        aria-label="收起右侧栏"
        title="收起右侧栏"
        aria-expanded="true"
        aria-controls="conversation-right-sidebar"
        @click="emit('close')"
      >
        <PanelRightClose :size="18" aria-hidden="true" />
      </button>
    </header>

    <div class="sidebar-body">
      <div v-if="layout.active === 'guide'" class="sidebar-guide">
        <Compass :size="36" class="guide-icon" aria-hidden="true" />
        <div class="guide-tools">
          <button v-for="tool in tools" :key="tool.id" type="button" @click="openTab(tool.id, true)">
            <component :is="tool.icon" :size="19" aria-hidden="true" />{{ tool.action }}
          </button>
        </div>
      </div>

      <div v-if="layout.tabs.includes('files')" v-show="layout.active === 'files'" class="sidebar-files">
        <ConversationFileTree :active-file-id="activeFile?.id" @open-file="openFile" />
        <div v-if="artifacts.length" class="sidebar-artifacts">
          <h3>会话产物</h3>
          <button v-for="item in artifacts" :key="item.id" type="button" @click="openTab(`artifact:${item.id}`)">
            <FileText :size="15" aria-hidden="true" /><span>{{ item.artifactName }}</span>
          </button>
        </div>
      </div>

      <ConversationSidebarTerminal v-if="layout.tabs.includes('terminal')" v-show="layout.active === 'terminal'" />
      <ConversationSidebarBrowser v-if="layout.tabs.includes('browser')" v-show="layout.active === 'browser'" />

      <div v-if="activeFile || activeArtifact" class="document-preview">
        <div class="preview-bar">
          <h2>{{ activeFile?.name ?? activeArtifact?.artifactName }}</h2>
          <div class="preview-actions">
            <template v-if="activeFile">
              <el-button text size="small" @click="downloadFile">下载</el-button>
              <el-button text size="small" @click="emit('reference', activeFile.id)">引用到会话</el-button>
            </template>
            <el-button
              v-else-if="activeArtifact"
              text
              size="small"
              :disabled="filesById.has('artifact-' + activeArtifact.id)"
              @click="saveArtifact(activeArtifact.id)"
            >{{ filesById.has('artifact-' + activeArtifact.id) ? '已保存' : '保存产物' }}</el-button>
          </div>
        </div>
        <img v-if="activeFile?.type === 'image' && activeFile.dataUrl" class="preview-image" :src="activeFile.dataUrl" :alt="activeFile.name" />
        <pre v-else-if="activeFile?.content || activeArtifact?.text" class="preview-text">{{ activeFile?.content || activeArtifact?.text }}</pre>
        <p v-else class="preview-note">可下载后查看此文件。</p>
      </div>
      <p v-else-if="layout.active.startsWith('file:') || layout.active.startsWith('artifact:')" class="preview-note">此文件已不可用。</p>
    </div>
  </aside>
</template>

<style scoped>
.right-sidebar { display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--canvas); }
.sidebar-toolbar { display: flex; flex: none; align-items: center; gap: 4px; min-width: 0; padding: 6px; border-bottom: 1px solid var(--line); }
.sidebar-tabs { display: flex; flex: 1; align-items: center; gap: 3px; min-width: 0; overflow: auto; scrollbar-width: thin; }
.sidebar-tab { display: flex; align-items: center; flex: 0 0 auto; min-width: 0; border-radius: 6px; color: var(--muted); }
.sidebar-tab.selected { color: var(--accent); background: var(--soft); }
.sidebar-tab button, .toolbar-button, .sidebar-artifacts button { display: flex; align-items: center; border: 0; background: transparent; color: inherit; }
.sidebar-tab button { gap: 5px; min-height: 30px; padding: 5px 6px; font-size: 12px; }
.sidebar-tab button span { max-width: 132px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-tab .tab-close { padding-inline: 3px 5px; }
.sidebar-tab button:focus-visible { outline-offset: -2px; }
.toolbar-button { flex: none; justify-content: center; width: 28px; height: 30px; border-radius: 6px; color: var(--muted); }
.toolbar-button:hover, .tab-close:hover { color: var(--accent); background: var(--soft); }
.sidebar-body { flex: 1; min-height: 0; overflow: auto; }
.sidebar-guide { display: grid; justify-items: center; gap: 18px; padding: 38px 15px; }
.guide-icon { color: #8597bf; }
.guide-tools { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.guide-tools button {
  display: flex; align-items: center; gap: 7px; padding: 8px 11px; border: 1px solid var(--line);
  border-radius: 10px; color: var(--text); background: var(--surface); font-size: 13px;
}
.guide-tools button:hover { color: var(--accent); background: var(--soft); }
.sidebar-artifacts { padding: 10px 12px; border-top: 1px solid var(--line); }
.sidebar-artifacts h3 { margin: 2px 0 5px; font-size: 12px; color: var(--muted); }
.sidebar-artifacts button { width: 100%; min-width: 0; gap: 7px; padding: 6px 5px; border-radius: 5px; text-align: left; }
.sidebar-artifacts button:hover { background: var(--soft); color: var(--accent); }
.sidebar-artifacts button svg { flex: none; }
.sidebar-artifacts button span { overflow-wrap: anywhere; }
.preview-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 11px 12px; border-bottom: 1px solid var(--line); }
.preview-bar h2 { margin: 0; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
.preview-actions { display: flex; }
.preview-actions .el-button { margin: 0; padding-inline: 7px; }
.preview-text, .preview-note { margin: 0; padding: 13px; }
.preview-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 13px; line-height: 1.65; }
.preview-note { color: var(--muted); }
.preview-image { display: block; width: auto; max-width: 100%; max-height: 100%; margin: 10px auto; object-fit: contain; }
@media (max-width: 900px) { .expand-sidebar { display: none; } }
</style>
