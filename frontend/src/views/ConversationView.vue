<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, ArrowUp, CircleCheck, DataAnalysis, Document, Files, Paperclip, Reading, Star } from '@element-plus/icons-vue'
import { PanelRight } from 'lucide-vue-next'
import { ElMessage, ElOptionGroup } from 'element-plus'
import { usePlatformStore, type Assistant } from '@/stores/platform'
import ConversationRightSidebar, { type SidebarLayout, type SidebarTab } from '@/components/ConversationRightSidebar.vue'

const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
const selectedAssistant = ref('default')
const draft = ref('')
const attachedIds = ref<string[]>([])
const pendingId = ref('')
const composer = ref<HTMLTextAreaElement>()
const threadEnd = ref<HTMLElement>()
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
const sidebarSession = computed(() => conversation.value?.id ?? 'new')
const activeAssistant = computed(() => platform.visibleAssistants.find((item) => item.id === (conversation.value?.assistantId ?? selectedAssistant.value)))
const assistantGroups = computed(() => [
  { label: '平台默认', assistants: platform.visibleAssistants.filter(assistant => assistant.id === 'default') },
  { label: '个人配置', assistants: platform.myAssistants },
  { label: '组织共享', assistants: platform.sharedAssistants.filter(assistant => assistant.scope === 'organization') },
  { label: '成员共享', assistants: platform.sharedAssistants.filter(assistant => assistant.scope !== 'organization') },
].filter(group => group.assistants.length))
const contextFile = computed(() => platform.myFiles.find(file => file.id === route.query.context))
const businessContext = computed(() => {
  const workbench = platform.visibleWorkbenches.find(item => item.id === route.query.workbench)
  const record = workbench?.records.find(item => item.id === route.query.record)
  return workbench && record ? { workbench, record } : undefined
})
const contextLabel = computed(() => contextFile.value?.name ?? businessContext.value?.record.title)
const attachedFiles = computed(() => platform.myFiles.filter((file) => attachedIds.value.includes(file.id)))

const examples = [
  { title: '整理会议纪要', text: '帮我把会议记录整理成纪要，列出决议、待办和负责人。', icon: Document },
  { title: '分析一组数据', text: '帮我分析业务数据，找出变化最明显的指标并说明可能的原因。', icon: DataAnalysis },
  { title: '起草工作汇报', text: '帮我起草一份周报，按本周成果、风险和下周计划组织。', icon: Reading },
]

function assistantLabel(assistant: Assistant) {
  if (assistant.scope === 'organization') return `${assistant.name} · 组织共享`
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

onMounted(() => sidebarBreakpoint.addEventListener('change', updateScreenSize))
onBeforeUnmount(() => sidebarBreakpoint.removeEventListener('change', updateScreenSize))

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

watch(() => platform.currentUser.id, () => {
  draft.value = ''
  attachedIds.value = []
})

watch(
  () => [conversation.value?.id, conversation.value?.messages.length, pendingId.value],
  () => nextTick(() => threadEnd.value?.scrollIntoView({ block: 'end', behavior: 'smooth' })),
)

function fillDraft(text: string) {
  draft.value = text
  nextTick(() => composer.value?.focus())
}

function toggleFile(id: string) {
  attachedIds.value = attachedIds.value.includes(id)
    ? attachedIds.value.filter((current) => current !== id)
    : [...attachedIds.value, id]
}

function removeContext() {
  const query = { ...route.query }
  delete query.context
  delete query.workbench
  delete query.record
  void router.replace({ path: route.path, query })
}

function fileLabel(fileId: string) {
  return platform.myFiles.find((file) => file.id === fileId)?.name
}

function isSaved(messageId: string) {
  return platform.myFiles.some((file) => file.id === 'artifact-' + messageId)
}

async function send() {
  const text = draft.value.trim()
  if (!text || pendingId.value) return
  if (!activeAssistant.value) {
    ElMessage.warning('当前助理已不可用，请重新选择助理')
    return
  }
  const references = attachedFiles.value.map((file) => file.id)
  if (contextFile.value && !references.includes(contextFile.value.id)) references.push(contextFile.value.id)
  const business = businessContext.value
  const message = business
    ? `引用业务记录：${business.workbench.name} / ${business.record.id} ${business.record.title}\n当前状态：${business.record.status}\n${business.record.detail}\n\n${text}`
    : text
  const id = conversation.value?.id ?? platform.createConversation(selectedAssistant.value, text.replace(/\s+/g, ' ').slice(0, 28))
  pendingId.value = id
  draft.value = ''
  attachedIds.value = []
  try {
    if (!conversation.value) {
      storeSidebarLayout(id, sidebarLayout.value)
      await router.replace('/work/chat/' + id)
    }
    await platform.sendConversationMessage(id, message, references)
  } catch {
    draft.value = text
    attachedIds.value = references
    ElMessage.error('发送失败，请重试')
  } finally {
    pendingId.value = ''
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

function saveFile(messageId: string) {
  if (!conversation.value) return
  const fileId = platform.saveMessageFile(conversation.value.id, messageId)
  if (!fileId) {
    ElMessage.error('暂时无法保存此产物')
    return
  }
  ElMessage.success('已保存到个人工作空间')
}
</script>

<template>
  <div
    class="conversation-layout"
    :class="{ 'has-sidebar': sidebarLayout.open, 'sidebar-expanded': sidebarExpanded }"
    @keydown.esc="sidebarLayout.open && toggleSidebar()"
  >
    <div class="conversation-main" :inert="sidebarOverlay">
      <div v-show="!sidebarLayout.open" class="sidebar-control">
        <button
          ref="sidebarToggle"
          class="icon-button sidebar-toggle"
          type="button"
          aria-label="展开右侧栏"
          title="展开右侧栏"
          aria-expanded="false"
          aria-controls="conversation-right-sidebar"
          @click="toggleSidebar"
        ><PanelRight :size="18" aria-hidden="true" /></button>
      </div>
      <div class="page conversation-page" :class="{ 'with-thread': conversation }">
        <section v-if="!conversation" class="welcome">
          <div class="assistant-mark" aria-hidden="true"><el-icon><Star /></el-icon></div>
          <h1>我可以帮你做什么？</h1>
          <p>整理资料、分析数据、起草文档，或直接说说你的想法。</p>
        </section>

        <template v-else>
          <header class="thread-heading">
            <span class="eyebrow">{{ activeAssistant ? assistantLabel(activeAssistant) : '助理已不可用' }}</span>
            <h1>{{ conversation.title }}</h1>
          </header>
          <section class="thread" aria-label="会话消息" aria-live="polite">
            <article v-for="message in conversation.messages" :key="message.id" class="message" :class="'is-' + message.role">
              <div v-if="message.role === 'assistant'" class="message-avatar" aria-hidden="true"><el-icon><Star /></el-icon></div>
              <div class="message-body">
                <div v-if="message.role === 'assistant'" class="message-author">{{ activeAssistant?.name ?? '助理' }}</div>
                <div class="message-text">{{ message.text }}</div>
                <div v-if="message.references?.length" class="message-references">
                  <template v-for="(reference, index) in message.references" :key="index">
                    <button v-if="fileLabel(reference)" type="button" @click="rightSidebar?.openFile(reference)">
                      <el-icon><Paperclip /></el-icon>{{ fileLabel(reference) }}
                    </button>
                    <span v-else><el-icon><Paperclip /></el-icon>引用文件</span>
                  </template>
                </div>
                <button v-if="message.artifactName" class="artifact" type="button"
                  :disabled="isSaved(message.id)" @click="saveFile(message.id)">
                  <el-icon><component :is="isSaved(message.id) ? CircleCheck : Document" /></el-icon>
                  <span>{{ message.artifactName }}</span>
                  <strong>{{ isSaved(message.id) ? '已保存' : '保存产物' }}</strong>
                </button>
              </div>
            </article>
            <div v-if="pendingId === conversation.id" class="reply-status"><span class="reply-dot"></span>{{ activeAssistant?.name ?? '助理' }}正在处理</div>
            <div ref="threadEnd" class="thread-end"></div>
          </section>
        </template>

        <section class="composer-section" aria-label="发送消息">
          <div v-if="conversation && !activeAssistant" class="assistant-unavailable">
            该助理当前不可用。<RouterLink to="/work/chat">新建会话</RouterLink>可选择其他助理继续。
          </div>
          <form v-else class="composer" @submit.prevent="send">
            <div v-if="contextLabel || attachedFiles.length" class="attachments">
              <button v-if="contextLabel" class="file-chip remove-file" type="button" aria-label="移除引用上下文" @click="removeContext">
                <el-icon><Paperclip /></el-icon>{{ contextLabel }}<span aria-hidden="true">×</span>
              </button>
              <button v-for="file in attachedFiles" :key="file.id" type="button" class="file-chip remove-file"
                :aria-label="'移除引用 ' + file.name" @click="toggleFile(file.id)">
                <el-icon><Document /></el-icon>{{ file.name }}<span aria-hidden="true">×</span>
              </button>
            </div>
            <textarea ref="composer" v-model="draft" :placeholder="conversation ? '继续补充你的要求…' : '输入你想完成的工作…'"
              aria-label="工作内容" rows="2" @keydown.enter="handleEnter"></textarea>
            <div class="composer-controls">
              <div class="composer-options">
                <el-select v-if="!conversation" v-model="selectedAssistant" aria-label="选择助理" class="assistant-select">
                  <el-option-group v-for="group in assistantGroups" :key="group.label" :label="group.label">
                    <el-option v-for="assistant in group.assistants" :key="assistant.id" :value="assistant.id" :label="assistantLabel(assistant)" />
                  </el-option-group>
                </el-select>
                <span v-else class="composer-assistant"><el-icon><Star /></el-icon>{{ activeAssistant?.name ?? '个人助理' }}</span>
                <el-popover placement="top-start" :width="260" trigger="click">
                  <template #reference>
                    <button class="attach-button" type="button"><el-icon><Paperclip /></el-icon><span>引用文件</span></button>
                  </template>
                  <div class="attach-list">
                    <strong>个人工作空间</strong>
                    <button v-for="file in platform.myFiles" :key="file.id" class="attach-item" type="button"
                      :aria-pressed="attachedIds.includes(file.id)" @click="toggleFile(file.id)">
                      <el-icon><component :is="attachedIds.includes(file.id) ? CircleCheck : Files" /></el-icon>
                      <span>{{ file.name }}</span>
                    </button>
                    <p v-if="!platform.myFiles.length" class="muted">暂无文件。<router-link to="/work/workspace">前往工作空间上传</router-link></p>
                  </div>
                </el-popover>
              </div>
              <button type="submit" class="send-button" aria-label="发送消息" :disabled="!draft.trim() || !!pendingId"><el-icon><ArrowUp /></el-icon></button>
            </div>
          </form>
        </section>

        <section v-if="!conversation" class="examples" aria-label="工作示例">
          <button v-for="example in examples" :key="example.title" type="button" @click="fillDraft(example.text)">
            <el-icon><component :is="example.icon" /></el-icon>
            {{ example.title }}
            <el-icon class="example-arrow"><ArrowRight /></el-icon>
          </button>
        </section>
      </div>
    </div>
    <ConversationRightSidebar
      v-show="sidebarLayout.open"
      :key="sidebarSession"
      ref="rightSidebar"
      class="conversation-sidebar"
      :layout="sidebarLayout"
      :conversation="conversation"
      :expanded="sidebarExpanded"
      @update:layout="updateSidebarLayout"
      @close="toggleSidebar"
      @expand="sidebarExpanded = !sidebarExpanded"
      @reference="addSidebarReference"
    />
  </div>
</template>

<style scoped>
.conversation-layout { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100%; }
.conversation-layout.has-sidebar:not(.sidebar-expanded) { grid-template-columns: minmax(0, 1fr) clamp(300px, 36%, 460px); gap: var(--content-padding-inline); }
.conversation-main { display: flex; flex-direction: column; min-width: 0; }
.sidebar-control { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; height: 0; }
.sidebar-toggle {
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--muted);
  background: var(--canvas);
  transform: translate(calc(var(--content-padding-inline) - 6px), calc(6px - var(--content-padding-top)));
}
.conversation-sidebar {
  position: sticky;
  top: calc(-1 * var(--content-padding-top));
  height: 100dvh;
  margin-block: calc(-1 * var(--content-padding-top)) calc(-1 * var(--content-padding-bottom));
  margin-inline-end: calc(-1 * var(--content-padding-inline));
  border-inline-start: 1px solid var(--line);
}
.sidebar-expanded .conversation-sidebar { position: fixed; inset: 0; z-index: 22; margin: 0; border: 0; }
.conversation-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  max-width: 860px;
  margin-inline: auto;
  color: var(--text);
}
.welcome { margin-top: auto; margin-bottom: 30px; text-align: center; }
.assistant-mark { display: grid; place-items: center; width: 50px; height: 50px; margin: 0 auto 19px; color: var(--accent); background: #edf2ff; border: 1px solid #dbe5ff; border-radius: 17px; box-shadow: 0 5px 15px #2647af0c; }
.assistant-mark .el-icon { font-size: 25px; transform: rotate(-12deg); }
.welcome h1 { margin: 0; font-size: clamp(25px, 4vw, 36px); font-weight: 650; letter-spacing: -.045em; line-height: 1.35; }
.welcome p { margin: 10px 0 0; color: var(--muted); font-size: 14px; }
.composer-section { position: relative; }
.assistant-unavailable { padding: 12px 14px; color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-radius: 9px; }
.assistant-unavailable a { color: var(--accent); }
.composer { padding: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 17px; box-shadow: 0 10px 30px #1829430a; }
.composer:focus-within { border-color: #9fb1ed; }
.composer textarea { display: block; width: 100%; border: 0; outline: none; resize: vertical; min-height: 62px; max-height: 240px; padding: 6px; color: var(--text); background: transparent; font: inherit; line-height: 1.6; }
.composer textarea::placeholder { color: var(--muted); }
.composer-controls, .composer-options, .composer-assistant, .attach-button { display: flex; align-items: center; gap: 9px; }
.composer-controls { justify-content: space-between; }
.assistant-select { width: 146px; min-width: 0; }
.composer-options { min-width: 0; }
.attach-button, .composer-assistant { border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 13px; padding: 8px; border-radius: 7px; white-space: nowrap; }
.attach-button:hover, .attach-button:focus-visible { background: var(--soft); color: var(--accent); cursor: pointer; }
.send-button { display: grid; place-items: center; flex-shrink: 0; width: 35px; height: 35px; color: #fff; background: var(--accent); border: none; border-radius: 10px; font-size: 20px; cursor: pointer; }
.send-button:disabled { opacity: .4; cursor: default; }
.attachments, .message-references { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 5px; }
.file-chip, .message-references > * { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; overflow-wrap: anywhere; padding: 4px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--soft); color: var(--muted); font-size: 12px; text-align: left; }
.message-references button:hover { color: var(--accent); border-color: #c7d5ff; }
.remove-file { cursor: pointer; }
.attach-list { max-height: 280px; overflow: auto; }
.attach-list strong { display: block; margin: 3px 4px 8px; }
.attach-item { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; padding: 7px; border-radius: 7px; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.attach-item:hover, .attach-item[aria-pressed="true"] { background: var(--soft); color: var(--accent); }
.examples { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; margin-top: 16px; margin-bottom: auto; }
.examples button { display: flex; align-items: center; gap: 8px; padding: 9px 13px; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: 9px; cursor: pointer; font: inherit; font-size: 13px; }
.examples button > .el-icon:first-child { color: var(--accent); }
.examples button:hover { border-color: #aebff1; background: #f6f8ff; }
.example-arrow { color: var(--muted); margin-left: 1px; }
.thread-heading { padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.conversation-layout:not(.has-sidebar) .thread-heading { padding-inline-end: 32px; }
.thread-heading h1 { margin: 4px 0 0; font-size: 23px; line-height: 1.35; overflow-wrap: anywhere; }
.thread { flex: 1; padding: 22px 0 12px; }
.message { display: flex; gap: 10px; margin-bottom: 19px; }
.message-body { min-width: 0; max-width: min(85%, 700px); }
.message-avatar { display: grid; place-items: center; flex: 0 0 29px; height: 29px; color: var(--accent); background: #edf2ff; border-radius: 8px; }
.message-author { margin: 1px 0 6px; font-weight: 650; font-size: 13px; }
.message-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.72; font-size: 14px; }
.is-user { justify-content: flex-end; }
.is-user .message-body { background: #eef2ff; padding: 10px 14px; border-radius: 12px 12px 3px 12px; }
.message-references { margin-top: 8px; margin-bottom: 0; }
.artifact { display: inline-flex; align-items: center; gap: 9px; padding: 9px 11px; margin-top: 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; font-size: 13px; text-align: left; }
.artifact strong { color: var(--accent); font-size: 12px; white-space: nowrap; }
.artifact:disabled { cursor: default; }
.reply-status { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; margin: 7px 0 16px; }
.reply-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: pulse 1.4s infinite; }
.thread-end { scroll-margin-bottom: 148px; }
.with-thread .composer-section { position: sticky; bottom: 16px; padding: 9px 0 5px; background: var(--canvas); }
@keyframes pulse { 50% { opacity: .35; } }
@media (max-width: 900px) {
  .conversation-layout.has-sidebar:not(.sidebar-expanded) { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .conversation-sidebar { position: fixed; inset: 0; z-index: 22; margin: 0; border: 0; }
}
@media (max-width: 560px) {
  .welcome { margin-bottom: 22px; }
  .composer { padding: 11px; }
  .assistant-select { width: 123px; }
  .composer-assistant { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .composer-assistant > .el-icon { flex-shrink: 0; }
  .attach-button { padding-inline: 4px; }
  .examples { gap: 6px; }
  .examples button { padding-inline: 9px; }
  .example-arrow { display: none; }
}
</style>
