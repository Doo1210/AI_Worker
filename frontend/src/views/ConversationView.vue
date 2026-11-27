<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, Bot, Check, Clock, Copy, FileText, FolderOpen, LoaderCircle, PanelRight, Paperclip, Plus, X } from 'lucide-vue-next'
import { ElMessage, ElOptionGroup } from 'element-plus'
import { usePlatformStore, type Assistant } from '@/stores/platform'
import { ET_DESIGN_WORKBENCH_ID } from '@/stores/sample'
import { usePersonalAutomationsStore } from '@/stores/personalAutomations'
import { etWorkspaceId, useSharedWorkspacesStore } from '@/stores/sharedWorkspaces'
import { conversationDirectoryDisplay, personalFilesName, sharedSpacesName, type DirectoryFolder } from '@/workspaceDirectory'
import { automationChatExample, isAutomationRequest, parseAutomationRequest } from '@/automationChatRequest'
import ConversationArtifactDialog from '@/components/ConversationArtifactDialog.vue'
import ConversationMarkdown from '@/components/ConversationMarkdown.vue'
import ConversationRightSidebar, { type SidebarLayout, type SidebarTab } from '@/components/ConversationRightSidebar.vue'

const platform = usePlatformStore()
const automations = usePersonalAutomationsStore()
const shared = useSharedWorkspacesStore()
const route = useRoute()
const router = useRouter()
const selectedAssistant = ref('default')
const directoryKey = (spaceId?: string, folderId?: string) => JSON.stringify([spaceId, folderId])
const selectedDirectoryKey = ref(directoryKey())
const draft = ref('')
const attachedIds = ref<string[]>([])
const pendingId = ref('')
const artifactId = ref('')
const artifactOpen = ref(false)
const composer = ref<HTMLTextAreaElement>()
const composerToolbar = ref<HTMLElement>()
const scrollport = ref<HTMLElement>()
const followingTail = ref(true)
const referenceMenuOpen = ref(false)
const referenceFilter = ref('')
const mention = ref<{ start: number; end: number }>()
const referenceIndex = ref(0)
const sidebarToggle = ref<HTMLButtonElement>()
const rightSidebar = ref<InstanceType<typeof ConversationRightSidebar>>()
const sidebarLayout = ref<SidebarLayout>({ open: false, tabs: ['guide'], active: 'guide' })
const sidebarExpanded = ref(false)
const sidebarBreakpoint = window.matchMedia('(max-width: 900px)')
const narrowScreen = ref(sidebarBreakpoint.matches)
const sidebarOverlay = computed(() => sidebarLayout.value.open && (sidebarExpanded.value || narrowScreen.value))
const sidebarCache = new Map<string, SidebarLayout>()

const requestedConversation = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const conversation = computed(() => platform.personalConversations.find((item) => item.id === requestedConversation.value))
const etDrawingLaunchId = computed(() => !requestedConversation.value && typeof route.query.etDrawing === 'string' ? route.query.etDrawing : undefined)
const drawingDraft = computed(() => etDrawingLaunchId.value ? platform.getEtDrawingLaunch(etDrawingLaunchId.value) : undefined)
const boundDrawing = computed(() => conversation.value?.etDrawing)
const drawingWorkbenchLocation = computed(() => ({ name: 'workbench', params: { id: ET_DESIGN_WORKBENCH_ID }, query: {
  review: boundDrawing.value?.reviewVersion ? etWorkspaceId : undefined,
  version: boundDrawing.value?.reviewVersion,
} }))
const automationMode = computed(() => !requestedConversation.value && route.query.automation === '1')
const automationTaskIds = computed(() => new Set(automations.tasks.map(task => task.id)))
const artifact = computed(() => conversation.value?.messages.find(message => message.id === artifactId.value && message.role === 'assistant' && message.artifactName))
const sidebarSession = computed(() => conversation.value?.id ?? 'new')
const activeAssistant = computed(() => platform.visibleAssistants.find((item) => item.id === (conversation.value?.assistantId ?? selectedAssistant.value)))
const unavailableBindings = computed(() => activeAssistant.value
  ? platform.assistantResourceBindings(activeAssistant.value.id).filter(binding => binding.status !== '可用').length : 0)
const assistantGroups = computed(() => [
  { label: '平台内置', assistants: platform.visibleAssistants.filter(assistant => assistant.id === 'default') },
  { label: '个人配置', assistants: platform.myAssistants },
  { label: '组织分配', assistants: platform.sharedAssistants.filter(assistant => assistant.scope === 'organization') },
  { label: '成员共享', assistants: platform.sharedAssistants.filter(assistant => assistant.scope !== 'organization') },
].filter(group => group.assistants.length))

function directoryOptions(name: string | undefined, folders: DirectoryFolder[], spaceId?: string) {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const subfolders = folders.map(folder => ({
    key: directoryKey(spaceId, folder.id), spaceId, folderId: folder.id,
    ...conversationDirectoryDisplay(name, byId, folder.id),
  })).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  return [{ key: directoryKey(spaceId), spaceId, folderId: undefined, ...conversationDirectoryDisplay(name, byId) }, ...subfolders]
}

const directoryGroups = computed(() => [
  { label: personalFilesName, options: directoryOptions(undefined, platform.myFolders) },
  { label: sharedSpacesName, options: shared.workspaces.flatMap(space => directoryOptions(space.name, space.folders, space.id)) },
].filter(group => group.options.length))
const selectedDirectory = computed(() => directoryGroups.value.flatMap(group => group.options)
  .find(option => option.key === selectedDirectoryKey.value))
const activeDirectory = computed(() => {
  if (conversation.value) return platform.resolveConversationDirectory(conversation.value.directory)
  if (selectedDirectory.value) return platform.resolveConversationDirectory(selectedDirectory.value)
})
const directoryFiles = computed(() => activeDirectory.value?.files ?? [])
const workspaceLocation = computed(() => ({ path: '/work/workspace', query: {
  scope: activeDirectory.value?.spaceId === undefined ? undefined : 'shared',
  space: activeDirectory.value?.spaceId, folder: activeDirectory.value?.folderId,
} }))
const bindingIssue = computed(() => {
  if (!activeAssistant.value) return '当前助理不可用。'
  if (!activeDirectory.value) return '当前工作目录不可用。'
  if (boundDrawing.value && !platform.canUseEtDrawingContext(boundDrawing.value)) return '当前图纸上下文已不可继续使用。'
  if (etDrawingLaunchId.value && !drawingDraft.value) return '图纸引用已失效，可从工作台重新发起会话。'
  return ''
})
const contextFile = computed(() => {
  const space = typeof route.query.space === 'string' ? route.query.space : undefined
  if (activeDirectory.value?.spaceId === space) return directoryFiles.value.find(file => file.id === route.query.context)
})
const businessContext = computed(() => {
  const workbench = platform.visibleWorkbenches.find(item => item.id === route.query.workbench)
  const record = workbench?.records.find(item => item.id === route.query.record)
  return workbench && record ? { workbench, record } : undefined
})
const contextLabel = computed(() => drawingDraft.value
  ? `${drawingDraft.value.drawingName} · ${drawingDraft.value.scope}` : contextFile.value?.name ?? businessContext.value?.record.title)
const attachedFiles = computed(() => directoryFiles.value.filter(file => attachedIds.value.includes(file.id)))
const matchingReferences = computed(() => directoryFiles.value.filter(file =>
  file.name.toLocaleLowerCase().includes(referenceFilter.value.trim().toLocaleLowerCase())))

const examples = [
  { title: '整理会议纪要', text: '帮我把会议记录整理成纪要，列出决议、待办和负责人。' },
  { title: '分析一组数据', text: '帮我分析业务数据，找出变化最明显的指标并说明可能的原因。' },
  { title: '起草工作汇报', text: '帮我起草一份周报，按本周成果、风险和下周计划组织。' },
]
const automationExamples = [{ title: automationChatExample, text: automationChatExample }]
const automationStartFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const messageTimeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function assistantLabel(assistant: Assistant) {
  if (assistant.scope === 'organization') return `${assistant.name} · 组织分配`
  if (assistant.userId === platform.currentUser.id) return assistant.name
  const owner = platform.users.find(user => user.id === assistant.userId)
  return `${assistant.name} · ${owner?.name ?? '成员'}共享`
}

function sidebarStorageKey(id: string) {
  return 'ai-worker-conversation-sidebar:' + platform.currentUser.id + ':' + id
}

function isSidebarTab(tab: unknown): tab is SidebarTab {
  return typeof tab === 'string' && /^(guide|files|terminal|browser|file:.+|artifact:.+)$/.test(tab)
}

function updateScreenSize(event: MediaQueryListEvent) {
  narrowScreen.value = event.matches
}

onMounted(() => {
  sidebarBreakpoint.addEventListener('change', updateScreenSize)
  document.addEventListener('pointerdown', dismissReferencesOnPointer)
})
onBeforeUnmount(() => {
  sidebarBreakpoint.removeEventListener('change', updateScreenSize)
  document.removeEventListener('pointerdown', dismissReferencesOnPointer)
})

watch([() => sidebarLayout.value.open, sidebarOverlay], ([open, overlay], [wasOpen, wasOverlay]) => {
  if (open && (!wasOpen || (overlay && !wasOverlay))) {
    void nextTick(() => rightSidebar.value?.focusClose())
  }
})

watch(sidebarSession, (id) => {
  sidebarExpanded.value = false
  sidebarLayout.value = { open: false, tabs: ['guide'], active: 'guide' }
  const key = sidebarStorageKey(id)
  const cached = sidebarCache.get(key)
  if (cached) {
    sidebarLayout.value = cached
    return
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (saved && typeof saved.open === 'boolean' && Array.isArray(saved.tabs)
      && saved.tabs.every(isSidebarTab) && saved.tabs.includes(saved.active)) {
      sidebarLayout.value = saved
    }
  } catch {
    // The sidebar still works when browser storage is unavailable.
  }
}, { immediate: true })

function storeSidebarLayout(id: string, layout: SidebarLayout) {
  const key = sidebarStorageKey(id)
  sidebarCache.set(key, layout)
  try {
    sessionStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // The current layout remains available while this conversation view is open.
  }
}

function updateSidebarLayout(layout: SidebarLayout) {
  const closed = sidebarLayout.value.open && !layout.open
  sidebarLayout.value = layout
  storeSidebarLayout(sidebarSession.value, layout)
  if (closed) {
    sidebarExpanded.value = false
    void nextTick(() => sidebarToggle.value?.focus({ preventScroll: true }))
  }
}

function toggleSidebar() {
  updateSidebarLayout({ ...sidebarLayout.value, open: !sidebarLayout.value.open })
}

function addSidebarReference(id: string) {
  if (!directoryFiles.value.some(file => file.id === id)) return
  if (contextFile.value?.id !== id && !attachedIds.value.includes(id)) attachedIds.value = [...attachedIds.value, id]
  if (sidebarOverlay.value) toggleSidebar()
  void nextTick(() => composer.value?.focus())
}

watch(
  () => [platform.currentUser.id, route.query.assistant, requestedConversation.value],
  () => {
    if (requestedConversation.value) return
    const candidate = route.query.assistant
    selectedAssistant.value = typeof candidate === 'string' && platform.visibleAssistants.some((item) => item.id === candidate)
      ? candidate : 'default'
  },
  { immediate: true },
)

watch([requestedConversation, () => route.query.space], () => {
  if (requestedConversation.value) return
  const space = route.query.space
  selectedDirectoryKey.value = typeof space === 'string' && shared.workspaces.some(workspace => workspace.id === space)
    ? directoryKey(space) : directoryKey()
}, { immediate: true })

watch(selectedDirectoryKey, () => {
  if (requestedConversation.value) return
  attachedIds.value = []
  closeReferences()
  const layout = sidebarLayout.value
  const tabs = layout.tabs.filter(tab => !tab.startsWith('file:'))
  if (tabs.length === layout.tabs.length) return
  if (!tabs.length) tabs.push('guide')
  updateSidebarLayout({ ...layout, tabs, active: tabs.includes(layout.active) ? layout.active : tabs[0]! })
})

watch(() => platform.currentUser.id, () => {
  draft.value = ''
  attachedIds.value = []
})

watch(requestedConversation, () => {
  draft.value = ''
  attachedIds.value = []
  artifactOpen.value = false
  artifactId.value = ''
  closeReferences()
})

watch(
  [requestedConversation, () => conversation.value?.messages.length, pendingId],
  ([id], [previousId]) => {
    if (id !== previousId || followingTail.value) scrollToLatest()
  },
  { flush: 'post', immediate: true },
)

function onTranscriptScroll() {
  const element = scrollport.value
  if (element) followingTail.value = element.scrollHeight - element.clientHeight - element.scrollTop < 40
}

function scrollToLatest() {
  followingTail.value = true
  const element = scrollport.value
  if (element) element.scrollTop = element.scrollHeight
}

onMounted(scrollToLatest)

function fillDraft(text: string) {
  draft.value = text
  closeReferences()
  void nextTick(() => composer.value?.focus())
}

function toggleFile(id: string) {
  attachedIds.value = attachedIds.value.includes(id)
    ? attachedIds.value.filter((current) => current !== id)
    : [...attachedIds.value, id]
}

function closeReferences() {
  referenceMenuOpen.value = false
  referenceFilter.value = ''
  mention.value = undefined
  referenceIndex.value = 0
}

function dismissReferencesOnPointer(event: PointerEvent) {
  if (referenceMenuOpen.value && event.target instanceof Node && event.target !== composer.value
    && !composerToolbar.value?.contains(event.target)) closeReferences()
}

function updateMention(event: Event) {
  if ('isComposing' in event && event.isComposing) return
  const input = composer.value
  if (!input) return
  const end = input.selectionStart
  const match = /(?:^|\s)(@([^@\s]*))$/u.exec(input.value.slice(0, end))
  if (!match) {
    if (mention.value) closeReferences()
    return
  }
  mention.value = { start: end - match[1].length, end }
  referenceFilter.value = match[2]
  referenceIndex.value = 0
  referenceMenuOpen.value = true
}

function chooseReference(id: string) {
  const range = mention.value
  if (!range) {
    toggleFile(id)
    return
  }
  if (contextFile.value?.id !== id && !attachedIds.value.includes(id)) attachedIds.value = [...attachedIds.value, id]
  draft.value = draft.value.slice(0, range.start) + draft.value.slice(range.end)
  closeReferences()
  void nextTick(() => {
    composer.value?.focus()
    composer.value?.setSelectionRange(range.start, range.start)
  })
}

function navigateReferences(event: KeyboardEvent, direction: number) {
  if (event.isComposing || !mention.value || !referenceMenuOpen.value || !matchingReferences.value.length) return
  event.preventDefault()
  const count = matchingReferences.value.length
  referenceIndex.value = (referenceIndex.value + direction + count) % count
  void nextTick(() => document.getElementById('conversation-reference-' + referenceIndex.value)?.scrollIntoView({ block: 'nearest' }))
}

function handleEscape(event: KeyboardEvent) {
  if (referenceMenuOpen.value) {
    event.stopPropagation()
    closeReferences()
  } else if (event.target === composer.value && sidebarLayout.value.open) toggleSidebar()
}

function removeContext() {
  const query = { ...route.query }
  delete query.context
  delete query.workbench
  delete query.record
  delete query.etDrawing
  void router.replace({ path: route.path, query })
}

function fileLabel(fileId: string) {
  return directoryFiles.value.find(file => file.id === fileId)?.name
}

function isSaved(messageId: string) {
  return directoryFiles.value.some(file => file.id === 'artifact-' + messageId)
}

function messageTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : messageTimeFormat.format(date)
}

async function copyMessage(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请重试')
  }
}

function replyToAutomation(text: string, previousRequest?: string) {
  if (previousRequest && /^取消(?:创建|设置)?[。！!]*$/.test(text)) return { text: '已取消创建。' }
  const request = previousRequest ? previousRequest + '\n' + text : text
  const taskDraft = parseAutomationRequest(text) ?? parseAutomationRequest(request)
  const task = taskDraft && automations.save(taskDraft)
  if (task) {
    const start = automationStartFormat.format(new Date(task.startAt))
    const repeat = { once: '仅一次', daily: '每天重复', weekly: '每周重复' }[task.frequency]
    return { text: `已创建自动化任务「${task.name}」。\n计划从 ${start} 开始，${repeat}。`, automationTaskId: task.id }
  }
  return {
    text: `请补充任务内容和具体时间。可以设置仅一次、每天或每周。比如「${automationChatExample}」`,
    automationRequest: request,
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || pendingId.value || conversation.value?.archived) return
  const directory = activeDirectory.value
  if (bindingIssue.value || !directory) {
    ElMessage.warning(bindingIssue.value)
    return
  }
  const references = attachedFiles.value.map((file) => file.id)
  if (contextFile.value && !references.includes(contextFile.value.id)) references.push(contextFile.value.id)
  const business = businessContext.value
  const message = business
    ? `引用业务记录：${business.workbench.name} / ${business.record.id} ${business.record.title}\n当前状态：${business.record.status}\n${business.record.detail}\n\n${text}`
    : text
  const previousReply = conversation.value?.messages.at(-1)
  const previousRequest = previousReply?.role === 'assistant' ? previousReply.automationRequest : undefined
  const scheduling = automationMode.value || !!previousRequest || isAutomationRequest(text)
  const id = conversation.value?.id ?? platform.createConversation(selectedAssistant.value,
    text.replace(/\s+/g, ' ').slice(0, 28), { spaceId: directory.spaceId, folderId: directory.folderId }, etDrawingLaunchId.value)
  if (!id) {
    ElMessage.warning('会话绑定已失效，请检查助理、工作目录和引用上下文')
    return
  }
  pendingId.value = id
  followingTail.value = true
  closeReferences()
  draft.value = ''
  attachedIds.value = []
  try {
    if (!conversation.value) {
      storeSidebarLayout(id, sidebarLayout.value)
      await router.replace('/work/chat/' + id)
    }
    await platform.sendConversationMessage(id, message, references,
      scheduling ? () => replyToAutomation(text, previousRequest) : undefined)
  } catch {
    if (requestedConversation.value === id) {
      draft.value = text
      attachedIds.value = references
    }
    ElMessage.error('发送失败，请重试')
  } finally {
    pendingId.value = ''
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (mention.value && referenceMenuOpen.value) {
    const file = matchingReferences.value[referenceIndex.value]
    if (file) chooseReference(file.id)
    return
  }
  void send()
}

function openArtifact(messageId: string) {
  artifactId.value = messageId
  artifactOpen.value = true
}
</script>

<template>
  <div class="page-surface conversation-layout" :class="{ 'has-sidebar': sidebarLayout.open, 'sidebar-expanded': sidebarExpanded }"
    @keydown.esc="handleEscape">
    <div class="conversation-main" :inert="sidebarOverlay">
      <header class="conversation-header" :class="{ 'is-blank': !conversation }">
        <div v-if="conversation" class="session-heading">
          <h1 :title="conversation.title">{{ conversation.title }}</h1>
          <div class="session-bindings" role="group" aria-label="会话绑定">
            <span :title="activeAssistant?.name"><Bot :size="14" aria-hidden="true" /><span>{{ activeAssistant?.name ?? '助理不可用' }}</span></span>
            <span :title="activeDirectory?.path"><FolderOpen :size="14" aria-hidden="true" /><span>{{ activeDirectory?.label ?? '工作目录不可用' }}</span></span>
          </div>
        </div>
        <button v-show="!sidebarLayout.open" ref="sidebarToggle" class="icon-button sidebar-toggle" type="button"
          aria-label="展开右侧栏" title="展开右侧栏" aria-expanded="false" aria-controls="conversation-right-sidebar" @click="toggleSidebar">
          <PanelRight :size="18" aria-hidden="true" />
        </button>
      </header>

      <div ref="scrollport" class="conversation-page" :class="{ 'with-thread': conversation, 'is-new-chat': !conversation && !automationMode }"
        @scroll.passive="onTranscriptScroll">
        <section v-if="!conversation" class="welcome">
          <Bot v-if="automationMode" :size="30" :stroke-width="1.7" aria-hidden="true" />
          <h1>{{ automationMode ? '创建自动化任务' : '新建会话' }}</h1>
        </section>

        <section v-else class="thread" :aria-label="'会话消息 · ' + conversation.title" role="log">
          <div v-if="boundDrawing && platform.canUseEtDrawingContext(boundDrawing)" class="drawing-conversation-context">
            <span><FileText :size="14" aria-hidden="true" />{{ boundDrawing.drawingName }} · {{ boundDrawing.scope }} · {{ boundDrawing.entityCount }} 个实体</span>
            <RouterLink :to="drawingWorkbenchLocation">返回 ET 设计工作台</RouterLink>
          </div>
          <article v-for="message in conversation.messages" :key="message.id" class="message" :class="'is-' + message.role">
            <div class="message-body">
              <div v-if="message.references?.length" class="message-references">
                <template v-for="(reference, index) in message.references" :key="index">
                  <button v-if="fileLabel(reference)" type="button" @click="rightSidebar?.openFile(reference)">
                    <Paperclip :size="14" aria-hidden="true" />{{ fileLabel(reference) }}
                  </button>
                  <span v-else><Paperclip :size="14" aria-hidden="true" />引用文件已不可用</span>
                </template>
              </div>
              <p v-if="message.role === 'user'" class="message-text">{{ message.text }}</p>
              <ConversationMarkdown v-else class="assistant-response" :text="message.text" />
              <div v-if="message.artifactName" class="artifact-card">
                <button type="button" class="artifact-preview" :aria-label="'预览 ' + (fileLabel('artifact-' + message.id) ?? message.artifactName)"
                  @click="rightSidebar?.openArtifact(message.id)">
                  <span class="artifact-icon"><FileText :size="20" aria-hidden="true" /></span>
                  <span class="artifact-details">
                    <strong>{{ fileLabel('artifact-' + message.id) ?? message.artifactName }}</strong>
                    <small>{{ isSaved(message.id) ? '已保存到工作目录' : '在右侧栏预览' }}</small>
                  </span>
                </button>
                <button v-if="activeDirectory?.canWrite" class="artifact-edit" type="button" @click="openArtifact(message.id)">{{ isSaved(message.id) ? '编辑' : '编辑与保存' }}</button>
              </div>
              <RouterLink v-if="message.automationTaskId && automationTaskIds.has(message.automationTaskId)"
                class="automation-link" :to="{ name: 'personal-automations', query: { task: message.automationTaskId } }">
                <Clock :size="15" aria-hidden="true" />查看自动化任务
              </RouterLink>
            </div>
            <div class="message-actions">
              <button type="button" :aria-label="message.role === 'user' ? '复制消息' : '复制回复'" title="复制" @click="copyMessage(message.text)">
                <Copy :size="15" aria-hidden="true" />
              </button>
              <time :datetime="message.createdAt">{{ messageTime(message.createdAt) }}</time>
            </div>
          </article>
          <div v-if="pendingId === conversation.id" class="reply-status" role="status">
            <LoaderCircle :size="15" aria-hidden="true" />{{ activeAssistant?.name ?? '助理' }}正在处理
          </div>
        </section>

        <section class="composer-section" aria-label="发送消息">
          <button v-if="conversation && !followingTail" class="latest-button icon-button" aria-label="回到最新消息" title="回到最新消息" @click="scrollToLatest">
            <ArrowDown :size="17" aria-hidden="true" />
          </button>
          <div v-if="!conversation" class="composer-bindings" role="group" aria-label="会话绑定">
            <el-select v-model="selectedDirectoryKey" aria-label="选择工作目录" placeholder="选择工作目录" class="directory-select"
              :title="activeDirectory?.path" popper-class="conversation-binding-options" filterable>
              <template #prefix><FolderOpen :size="15" aria-hidden="true" /></template>
              <template #label>{{ selectedDirectory?.label }}</template>
              <el-option-group v-for="group in directoryGroups" :key="group.label" :label="group.label">
                <el-option v-for="option in group.options" :key="option.key" :value="option.key"
                  :label="option.folderId ? option.path : option.label" :title="option.path">{{ option.label }}</el-option>
              </el-option-group>
            </el-select>
            <el-select v-model="selectedAssistant" aria-label="选择助理" placeholder="选择助理" class="assistant-select"
              popper-class="conversation-binding-options">
              <template #prefix><Bot :size="15" aria-hidden="true" /></template>
              <el-option-group v-for="group in assistantGroups" :key="group.label" :label="group.label">
                <el-option v-for="assistant in group.assistants" :key="assistant.id" :value="assistant.id" :label="assistantLabel(assistant)" />
              </el-option-group>
            </el-select>
          </div>
          <div v-if="conversation?.archived" class="binding-issue archived-conversation">
            <span>此会话已归档</span>
            <button type="button" @click="platform.setConversationArchived(conversation.id, false)">取消归档</button>
          </div>
          <div v-else-if="conversation && bindingIssue" class="binding-issue">
            {{ bindingIssue }}<RouterLink to="/work/chat">新建会话</RouterLink>后可继续工作。
          </div>
          <form v-else class="composer" @submit.prevent="send">
            <div v-if="contextLabel || attachedFiles.length" class="attachments">
              <button v-if="contextLabel" class="file-chip" type="button" aria-label="移除引用上下文" @click="removeContext">
                <Paperclip :size="14" aria-hidden="true" />{{ contextLabel }}<X :size="13" aria-hidden="true" />
              </button>
              <button v-for="file in attachedFiles" :key="file.id" type="button" class="file-chip"
                :aria-label="'移除引用 ' + file.name" @click="toggleFile(file.id)">
                <FileText :size="14" aria-hidden="true" />{{ file.name }}<X :size="13" aria-hidden="true" />
              </button>
            </div>
            <textarea ref="composer" v-model="draft" rows="1" aria-label="工作内容"
              :placeholder="automationMode ? '输入执行时间和任务内容…' : '给助理发消息，输入 @ 引用文件'"
              @input="updateMention" @compositionend="updateMention" @keydown.enter="handleEnter"
              @keydown.down="navigateReferences($event, 1)" @keydown.up="navigateReferences($event, -1)"></textarea>
            <p v-if="bindingIssue" class="binding-issue" role="status">
              {{ bindingIssue }}
              <button v-if="etDrawingLaunchId && !drawingDraft" type="button" @click="removeContext">移除图纸引用</button>
            </p>
            <p v-if="activeAssistant && unavailableBindings" class="binding-issue" role="status">
              当前助理有 {{ unavailableBindings }} 项资源未授权或已失效。<RouterLink :to="{ name: 'personal-assistant-configuration', params: { id: activeAssistant.id }, query: { scope: activeAssistant.scope === 'organization' || activeAssistant.userId !== platform.currentUser.id ? 'shared' : 'own' } }">查看助理配置</RouterLink>
            </p>
            <div ref="composerToolbar" class="composer-toolbar">
              <el-popover :visible="referenceMenuOpen" placement="top-start" :width="310" :teleported="false">
                <template #reference>
                  <button class="attach-button" type="button" aria-label="引用文件和工作示例" :aria-expanded="referenceMenuOpen"
                    title="引用文件和工作示例"
                    @click="referenceMenuOpen ? closeReferences() : referenceMenuOpen = true">
                    <Plus :size="18" aria-hidden="true" />
                  </button>
                </template>
                <div class="attach-list">
                  <el-input v-if="!mention" v-model="referenceFilter" aria-label="搜索工作目录文件" placeholder="搜索工作目录文件" clearable />
                  <strong v-if="matchingReferences.length">{{ activeDirectory?.label }}</strong>
                  <button v-for="(file, index) in matchingReferences" :id="'conversation-reference-' + index"
                    :key="file.id" class="attach-item" :class="{ 'keyboard-current': mention && index === referenceIndex }" type="button"
                    :aria-pressed="attachedIds.includes(file.id)" @click="chooseReference(file.id)">
                    <component :is="attachedIds.includes(file.id) ? Check : FileText" :size="15" aria-hidden="true" />
                    <span>{{ file.name }}</span>
                  </button>
                  <p v-if="activeDirectory && !directoryFiles.length" class="muted">暂无文件。<RouterLink :to="workspaceLocation">打开工作目录</RouterLink></p>
                  <p v-else-if="!matchingReferences.length" class="muted">没有匹配的文件</p>
                  <template v-if="!mention && !conversation && !referenceFilter">
                    <strong>工作示例</strong>
                    <button v-for="example in automationMode ? automationExamples : examples" :key="example.title" class="attach-item"
                      type="button" @click="fillDraft(example.text)">{{ example.title }}</button>
                  </template>
                </div>
              </el-popover>
              <button type="submit" class="send-button" aria-label="发送消息" :aria-busy="!!pendingId"
                :disabled="!draft.trim() || !!pendingId || !!bindingIssue">
                <component :is="pendingId ? LoaderCircle : ArrowUp" :size="18" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
    <ConversationRightSidebar v-show="sidebarLayout.open" :key="sidebarSession" ref="rightSidebar" class="conversation-sidebar"
      :layout="sidebarLayout" :conversation="conversation" :directory="activeDirectory" :expanded="sidebarExpanded"
      @update:layout="updateSidebarLayout" @close="toggleSidebar" @expand="sidebarExpanded = !sidebarExpanded"
      @reference="addSidebarReference" @edit-artifact="openArtifact" />
    <ConversationArtifactDialog v-if="conversation" v-model="artifactOpen" :conversation-id="conversation.id" :message="artifact" :directory="activeDirectory" />
  </div>
</template>

<style scoped>
.conversation-layout { height: 100%; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.conversation-layout.has-sidebar:not(.sidebar-expanded) { grid-template-columns: minmax(0, 1fr) clamp(300px, 36%, 460px); }
.conversation-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; container-type: inline-size; }
.conversation-sidebar { min-height: 0; border-inline-start: 1px solid var(--line); }
.sidebar-expanded .conversation-sidebar { position: fixed; inset: 0; z-index: 22; border: 0; }
.conversation-header {
  display: flex; align-items: center; flex: none; gap: 10px; justify-content: space-between;
  min-height: 44px; padding: 5px 16px; border-bottom: 1px solid var(--line);
}
.conversation-header.is-blank { justify-content: flex-end; border-bottom: 0; }
.session-heading { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; }
.session-heading h1 {
  min-width: 0; max-width: 50%; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 15px; line-height: 20px; font-weight: 650;
}
.session-bindings { display: flex; align-items: center; gap: 12px; min-width: 0; color: var(--muted); font-size: 12px; }
.session-bindings > span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.session-bindings svg { flex: none; }
.session-bindings > span > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-toggle { display: grid; flex: none; place-items: center; width: 32px; height: 32px; color: var(--muted); }

.conversation-page {
  --reply-width: clamp(680px, 64cqi, 920px);
  --composer-width: calc(var(--reply-width) + 32px);
  --composer-gutter: 16px;
  display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0;
  overflow: auto; color: var(--text); scrollbar-gutter: stable both-edges; overscroll-behavior: contain;
}
.conversation-page:not(.with-thread) { padding-block: 16px 48px; }
.welcome { display: flex; align-items: center; justify-content: center; gap: 10px; margin: auto 12px 16px; color: var(--text); }
.welcome svg { flex: none; color: var(--text-secondary); }
.welcome h1 { margin: 0; font-size: clamp(26px, 4vw, 32px); font-weight: 550; line-height: 1.3; }
.conversation-page:not(.with-thread) .composer-section { margin-bottom: auto; }
.conversation-page.is-new-chat { --composer-width: 760px; padding-block: clamp(32px, 11dvh, 104px) 24px; }
.is-new-chat .welcome {
  flex: none; justify-content: flex-start;
  width: min(var(--composer-width), calc(100% - 2 * var(--composer-gutter)));
  margin: 0 auto 18px;
}
.is-new-chat .welcome h1 { font-size: clamp(28px, 4.2cqi, 36px); line-height: 1.2; }

.thread { flex: 1 0 auto; width: min(var(--reply-width), calc(100% - 2 * var(--composer-gutter) - 32px)); margin-inline: auto; padding: 20px 0 12px; }
.message { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-bottom: 22px; }
.message-body { min-width: 0; max-width: 100%; }
.is-user { align-items: flex-end; }
.is-user .message-body { max-width: 75%; padding: 9px 13px; border-radius: 12px; background: var(--surface-muted); }
.message-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; font-size: 15px; }
.assistant-response { font-size: 15px; }
.message-actions { display: flex; align-items: center; gap: 7px; min-height: 28px; color: var(--muted); font-size: 11px; }
.message-actions button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: inherit; }
.message-actions button:hover { background: var(--surface-hover); color: var(--text); }
@media (hover: hover) {
  .message:not(:last-child) .message-actions { opacity: 0; }
  .message:is(:hover, :focus-within) .message-actions { opacity: 1; }
}
.artifact-card {
  display: flex; align-items: center; gap: 6px; width: min(100%, 370px); min-width: min(280px, 100%); margin-top: 12px;
  padding: 4px; border: 1px solid var(--line); border-radius: var(--radius-surface); background: var(--surface);
}
.artifact-preview, .artifact-edit {
  border: 0; border-radius: 8px; background: transparent; color: var(--text); text-align: start;
}
.artifact-preview { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; padding: 5px; }
.artifact-preview:hover, .artifact-edit:hover { background: var(--surface-hover); }
.artifact-icon { display: grid; flex: none; width: 36px; height: 36px; place-items: center; border-radius: var(--radius-surface); background: var(--surface-muted); color: var(--text-secondary); }
.artifact-details { display: grid; gap: 3px; min-width: 0; }
.artifact-details > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-details strong { font-size: 13px; font-weight: 600; }
.artifact-details small, .artifact-edit { color: var(--muted); font-size: 12px; }
.artifact-edit { flex: none; padding: 7px 5px; }
.automation-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; color: var(--accent); font-size: 13px; }
.reply-status { display: flex; align-items: center; gap: 7px; min-height: 28px; color: var(--muted); font-size: 13px; }
.reply-status svg, .send-button[aria-busy='true'] svg { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer-section { position: relative; flex: none; min-width: 0; padding-inline: var(--composer-gutter); }
.with-thread .composer-section {
  position: sticky; z-index: 3; bottom: 0; padding-block: 22px 12px;
  background: linear-gradient(transparent, var(--canvas) 32px);
}
.composer, .composer-bindings, .composer-section > .binding-issue { width: min(100%, var(--composer-width)); margin-inline: auto; }
.composer-bindings { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.composer-bindings :deep(.el-select__wrapper) {
  min-height: 29px; padding-inline: 8px; border-radius: var(--radius-pill); box-shadow: none; background: var(--surface-muted); font-size: 12px;
}
.composer-bindings :deep(.el-select__wrapper.is-hovering) { box-shadow: 0 0 0 1px var(--line-strong) inset; }
.composer-bindings :deep(.el-select__wrapper.is-focused) { box-shadow: 0 0 0 1px var(--accent) inset; }
.assistant-select { flex: 0 1 140px; min-width: 0; }
.directory-select { flex: 0 1 220px; min-width: 0; }
:global(.conversation-binding-options .el-select-dropdown__item) { max-width: min(460px, calc(100vw - 24px)); }
.composer {
  position: relative; padding: 8px 8px 6px; border: 1px solid var(--line-strong); border-radius: 12px;
  background: var(--surface);
}
.composer:focus-within { border-color: var(--accent); }
.composer textarea {
  display: block; field-sizing: content; width: 100%; min-height: 38px; max-height: min(34dvh, 336px); padding: 5px 7px;
  border: 0; outline: none; resize: none; background: transparent; color: var(--text); font: inherit; font-size: 14px; line-height: 24px;
}
.conversation-page:not(.with-thread) textarea { min-height: 57px; }
.composer textarea::placeholder { color: var(--muted); }
.composer-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 9px; }
.attach-button, .send-button, .latest-button { display: grid; flex: none; place-items: center; border: 0; border-radius: 50%; }
.attach-button { width: 30px; height: 30px; background: var(--surface-muted); color: var(--text); }
.attach-button:is(:hover, [aria-expanded='true']) { background: var(--surface-hover); }
.send-button { width: 34px; height: 34px; background: var(--accent); color: var(--on-accent); }
.send-button:enabled:hover { background: var(--accent-hover); }
.send-button:disabled { background: var(--surface-hover); color: var(--muted); }
.latest-button {
  position: absolute; z-index: 1; inset: -11px auto auto 50%; translate: -50% 0; width: 30px; height: 30px;
  border: 1px solid var(--line); background: var(--surface); color: var(--text-secondary);
}
.binding-issue { padding: 10px; color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 9px; }
.binding-issue a { color: var(--accent); margin-inline: 4px; }
.drawing-conversation-context { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; margin-bottom: 12px; padding: 8px 10px; background: var(--surface-muted); border-radius: 8px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.drawing-conversation-context span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.drawing-conversation-context svg { flex: none; }
.drawing-conversation-context a { color: var(--accent); }
.composer .binding-issue button { padding: 0; border: 0; background: none; color: var(--accent); cursor: pointer; }
.archived-conversation { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; }
.archived-conversation button { padding: 2px 4px; border: 0; background: transparent; color: var(--accent); }
.composer .binding-issue { margin: 0 0 5px; padding: 3px 7px; border: 0; font-size: 12px; }

.attachments, .message-references { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 5px; }
.file-chip, .message-references > * {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; overflow-wrap: anywhere;
  padding: 5px 7px; border: 1px solid var(--line); border-radius: var(--radius-surface); background: var(--surface-muted); color: var(--muted); font-size: 12px; text-align: start;
}
.file-chip svg, .message-references svg { flex: none; }
.file-chip:hover, .message-references button:hover { color: var(--accent); }
.attach-list { max-height: min(40dvh, 310px); overflow: auto; }
.composer-toolbar :deep(.el-popover.el-popper) { max-width: min(310px, calc(100vw - 26px)); }
.attach-list strong { display: block; margin: 8px 3px 4px; color: var(--muted); font-size: 12px; font-weight: 600; }
.attach-list p { margin: 8px 3px; font-size: 12px; }
.attach-list a { color: var(--accent); }
.attach-item {
  width: 100%; display: flex; align-items: center; gap: 7px; padding: 7px 5px;
  border: 0; border-radius: 6px; background: transparent; color: var(--text); text-align: start; font-size: 13px;
}
.attach-item svg { flex: none; }
.attach-item span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-item:is(:hover, :focus-visible, .keyboard-current, [aria-pressed='true']) { background: var(--soft); color: var(--accent); }

@media (max-width: 900px) {
  .conversation-layout.has-sidebar:not(.sidebar-expanded) { grid-template-columns: minmax(0, 1fr); }
  .conversation-sidebar { position: fixed; inset: 0; z-index: 22; border: 0; }
}
@container (max-width: 560px) {
  .conversation-header { padding-inline: 10px; }
  .session-heading, .session-bindings { gap: 8px; }
  .session-heading h1 { max-width: 42%; }
  .conversation-page { --composer-gutter: 7px; }
  .conversation-page.is-new-chat { --composer-gutter: 12px; padding-block-start: clamp(32px, 7dvh, 64px); }
  .thread { width: calc(100% - 24px); padding-top: 12px; }
  .is-user .message-body { max-width: 88%; }
}
@media (pointer: coarse) { .composer textarea { font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { .reply-status svg, .send-button svg { animation: none; } }
</style>
