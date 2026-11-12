<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, ChevronDown, ClipboardList, MessageSquare, Plus } from 'lucide-vue-next'
import { ElDrawer, ElMessage } from 'element-plus'
import EmployeeWorkCards from '@/components/EmployeeWorkCards.vue'
import { employeeExamples } from '@/components/employeeExamples'
import { usePlatformStore, type EmployeeTaskDraft } from '@/stores/platform'

const store = usePlatformStore()
const route = useRoute()
const router = useRouter()
const directorySearch = computed(() => typeof route.query.q === 'string' ? route.query.q : undefined)
const directoryLink = computed(() => ({ name: 'employee-directory', query: { q: directorySearch.value } }))
const employee = computed(() => store.visibleEmployees.find(item => item.id === route.params.id))
const selectedThread = computed(() => {
  const threads = store.employeeThreads.filter(thread => thread.employeeId === employee.value?.id)
  return threads.find(thread => thread.id === route.query.thread) ?? threads[0]
})
const employeeTasks = computed(() => store.myTasks.filter(task => task.employeeId === employee.value?.id))
const threadTasks = computed(() => employeeTasks.value.filter(task => task.threadId === selectedThread.value?.id))
const commonWork = computed(() => employee.value ? employeeExamples(employee.value) : [])
const focusedTask = computed(() => threadTasks.value.find(task => task.id === route.query.task))
const timeline = computed(() => {
  const messages = selectedThread.value?.messages ?? []
  const latestTaskMessages = new Map<string, string>()
  const tasksById = new Map(threadTasks.value.map(task => [task.id, task]))
  for (const message of messages) {
    if (message.taskId) latestTaskMessages.set(message.taskId, message.id)
  }
  return [
    ...messages.map(message => ({
      id: message.id,
      message,
      task: message.taskId && latestTaskMessages.get(message.taskId) === message.id
        ? tasksById.get(message.taskId)
        : undefined,
    })),
    ...threadTasks.value.filter(task => !latestTaskMessages.has(task.id)).map(task => ({
      id: 'unlinked-' + task.id, message: undefined, task,
    })),
  ]
})

const draft = ref('')
const sending = ref(false)
const messageList = ref<HTMLElement>()
const composer = ref<{ focus: () => void }>()
const assignmentOpen = ref(false)
const workDrawerOpen = ref(false)
const proposalMessageId = ref<string>()
const taskDraft = reactive<EmployeeTaskDraft>({ title: '', request: '', deliverable: '' })
const supplementId = ref('')
const supplementText = ref('')
const supplementTask = computed(() => employeeTasks.value.find(task => task.id === supplementId.value && task.status === '待补充'))
const supplementOpen = computed({
  get: () => Boolean(supplementTask.value),
  set: (value) => { if (!value) supplementId.value = '' },
})
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

function focusComposer() {
  void nextTick(() => composer.value?.focus())
}

function openAssignment(draft?: Partial<EmployeeTaskDraft>, messageId?: string) {
  Object.assign(taskDraft, { title: '', request: '', deliverable: '' }, draft)
  proposalMessageId.value = messageId
  assignmentOpen.value = true
}

function showThread(employeeId: string, threadId: string) {
  if (route.params.id !== employeeId) return
  if (route.query.thread === threadId && !route.query.task) return
  void router.replace({ name: 'employee-contact', params: { id: employeeId }, query: { thread: threadId, q: directorySearch.value } })
}

async function send() {
  const employeeId = employee.value?.id
  const text = draft.value.trim()
  if (!employeeId || !text || sending.value) return
  const threadId = selectedThread.value?.id ?? store.startEmployeeThread(employeeId)
  if (!threadId) return
  sending.value = true
  draft.value = ''
  showThread(employeeId, threadId)
  try {
    if (!await store.sendEmployeeMessage(threadId, text)) throw new Error()
  } catch {
    if (employee.value?.id === employeeId && !draft.value) draft.value = text
    ElMessage.error('暂时无法发送，请重试。')
  } finally {
    sending.value = false
  }
}

function submitAssignment() {
  const employeeId = employee.value?.id
  if (!employeeId || !taskDraft.title.trim() || !taskDraft.request.trim()) return
  const threadId = selectedThread.value?.id ?? store.startEmployeeThread(employeeId)
  const task = store.assignEmployeeTask(threadId, taskDraft, proposalMessageId.value)
  if (!task) {
    ElMessage.error('暂时无法交办任务，请检查任务内容后重试。')
    return
  }
  assignmentOpen.value = false
  showThread(employeeId, threadId)
}

function openSupplement(id: string) {
  workDrawerOpen.value = false
  supplementText.value = ''
  supplementId.value = id
}

function submitSupplement() {
  const task = supplementTask.value
  const text = supplementText.value.trim()
  if (!task || !text) return
  store.supplementEmployeeTask(task.id, text)
  supplementOpen.value = false
}

watch(() => employee.value?.id, () => {
  draft.value = ''
  assignmentOpen.value = false
  workDrawerOpen.value = false
  supplementId.value = ''
})

watch([() => employee.value?.id, () => route.query.mode], ([id, mode]) => {
  if (!id || (mode !== 'chat' && mode !== 'task')) return
  if (mode === 'task') openAssignment()
  else focusComposer()
  const query = { ...route.query }
  delete query.mode
  void router.replace({ name: 'employee-contact', params: { id }, query })
}, { immediate: true })

watch([() => selectedThread.value?.id, () => selectedThread.value?.messages.length, focusedTask], async () => {
  await nextTick()
  if (focusedTask.value) {
    document.getElementById('employee-task-' + focusedTask.value.id)?.scrollIntoView({ block: 'nearest' })
  } else if (messageList.value) {
    messageList.value.scrollTop = messageList.value.scrollHeight
  }
}, { immediate: true })
</script>

<template>
  <section class="page employee-page">
    <template v-if="employee">
      <header class="panel employee-profile" aria-label="员工资料">
        <div class="employee-identity">
          <RouterLink :to="directoryLink" class="icon-button profile-back" aria-label="返回员工目录" title="返回员工目录">
            <ArrowLeft :size="16" aria-hidden="true" />
          </RouterLink>
          <span class="employee-avatar" :style="{ background: employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
          <div class="employee-name">
            <div class="employee-title">
              <h1 :title="employee.name">{{ employee.name }}</h1>
              <span class="employee-role" :title="employee.role">{{ employee.role }}</span>
            </div>
            <p v-if="employee.description" :title="employee.description">{{ employee.description }}</p>
          </div>
        </div>
        <div class="profile-actions">
          <el-button class="work-drawer-trigger" @click="workDrawerOpen = true">任务记录</el-button>
          <el-dropdown v-if="commonWork.length" trigger="click" @command="(title: string) => openAssignment({ title })">
            <el-button>常见任务 <ChevronDown :size="13" aria-hidden="true" class="work-menu-icon" /></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="example in commonWork" :key="example" :command="example">{{ example }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" :icon="Plus" @click="openAssignment()">交办任务</el-button>
        </div>
      </header>

      <div class="employee-workspace">
        <section class="panel conversation" aria-label="员工沟通">
          <header class="conversation-header">
            <h2>沟通记录</h2>
          </header>

          <div ref="messageList" class="conversation-messages" role="log" aria-label="沟通消息">
            <div v-if="!timeline.length" class="conversation-empty">
              <MessageSquare :size="24" aria-hidden="true" />
              <p>发送第一条消息，或直接交办任务。</p>
            </div>
            <div v-for="item in timeline" :key="item.id" class="timeline-item">
              <article v-if="item.message" class="message" :class="{ 'message-own': item.message.role === 'user' }">
                <div class="message-label">
                  <strong>{{ item.message.role === 'user' ? '我' : employee.name }}</strong>
                  <time :datetime="item.message.createdAt">{{ formatDate(item.message.createdAt) }}</time>
                </div>
                <div class="message-body">{{ item.message.text }}</div>
              </article>

              <section v-if="item.message?.taskProposal && !item.message.taskId" class="work-card proposal-card">
                <div class="work-card-title"><ClipboardList :size="16" aria-hidden="true" /><strong>{{ item.message.taskProposal.title }}</strong></div>
                <div class="work-card-actions">
                  <el-button size="small" type="primary" plain @click="openAssignment(item.message.taskProposal, item.message.id)">确认交办</el-button>
                </div>
              </section>

              <section
                v-if="item.task"
                :id="'employee-task-' + item.task.id"
                class="work-card"
                :class="{ 'task-focused': item.task.id === focusedTask?.id }"
              >
                <div class="work-card-title">
                  <ClipboardList :size="16" aria-hidden="true" />
                  <strong>{{ item.task.title }}</strong>
                  <el-tag size="small" :type="item.task.status === '已完成' ? 'success' : item.task.status === '待补充' ? 'warning' : 'primary'">
                    {{ item.task.status === '待补充' ? '待我补充' : item.task.status }}
                  </el-tag>
                </div>
                <p>{{ item.task.detail }}</p>
                <div class="work-card-actions">
                  <el-button v-if="item.task.status === '待补充'" size="small" @click="openSupplement(item.task.id)">补充信息</el-button>
                  <RouterLink :to="{ name: 'employee-task', params: { taskId: item.task.id } }" class="text-link">
                    {{ item.task.status === '已完成' ? '查看结果' : '查看进度' }} <ArrowRight :size="14" aria-hidden="true" />
                  </RouterLink>
                </div>
              </section>
            </div>
            <div v-if="sending" class="sending-note">员工正在回复…</div>
          </div>

          <form class="composer" @submit.prevent="send">
            <el-input ref="composer" v-model="draft" type="textarea" :rows="3" resize="none"
              placeholder="输入问题或想讨论的工作…" aria-label="沟通内容"
              @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send" />
            <div class="composer-actions">
              <span class="eyebrow">Ctrl / ⌘ + Enter 发送</span>
              <el-button type="primary" native-type="submit" :disabled="!draft.trim() || sending">发送</el-button>
            </div>
          </form>
        </section>
        <aside class="panel employee-work-panel" aria-label="我交办给这位员工的任务">
          <EmployeeWorkCards :tasks="employeeTasks" :employee-id="employee.id" @supplement="openSupplement" />
        </aside>
      </div>

      <ElDrawer v-model="workDrawerOpen" class="employee-work-drawer" title="我交办的任务" size="min(100vw, 360px)" append-to-body>
        <EmployeeWorkCards :tasks="employeeTasks" :employee-id="employee.id" hide-heading @supplement="openSupplement" />
      </ElDrawer>

      <el-dialog v-model="assignmentOpen" title="交办任务" width="min(520px, calc(100vw - 28px))">
        <el-form label-position="top" @submit.prevent="submitAssignment">
          <p class="recipient"><span class="muted">交给</span> <strong>{{ employee.name }}</strong></p>
          <el-form-item label="任务名称" required for="employee-assignment-title">
            <el-input id="employee-assignment-title" v-model="taskDraft.title" maxlength="60" placeholder="例如 整理本周售后工单" />
          </el-form-item>
          <el-form-item label="具体要求" required for="employee-assignment-request">
            <el-input id="employee-assignment-request" v-model="taskDraft.request" type="textarea" :rows="4" placeholder="说明处理范围、已有资料和需要注意的事项" />
          </el-form-item>
          <el-form-item label="期望交付" for="employee-assignment-deliverable">
            <el-input id="employee-assignment-deliverable" v-model="taskDraft.deliverable" maxlength="200" placeholder="例如 按问题类型汇总的清单（选填）" />
          </el-form-item>
          <div class="dialog-actions">
            <el-button @click="assignmentOpen = false">取消</el-button>
            <el-button type="primary" native-type="submit" :disabled="!taskDraft.title.trim() || !taskDraft.request.trim()">提交交办</el-button>
          </div>
        </el-form>
      </el-dialog>

      <el-dialog v-model="supplementOpen" title="补充信息" width="min(500px, calc(100vw - 28px))">
        <form @submit.prevent="submitSupplement">
          <p class="supplement-question">{{ supplementTask?.detail }}</p>
          <el-input v-model="supplementText" type="textarea" :rows="3" aria-label="补充内容" placeholder="输入要补充的信息" />
          <div class="dialog-actions">
            <el-button @click="supplementOpen = false">取消</el-button>
            <el-button type="primary" native-type="submit" :disabled="!supplementText.trim()">提交补充</el-button>
          </div>
        </form>
      </el-dialog>
    </template>
    <el-empty v-else class="panel" description="无法联系此员工">
      <RouterLink :to="directoryLink" class="text-link">
        <ArrowLeft :size="15" aria-hidden="true" /> 返回员工目录
      </RouterLink>
    </el-empty>
  </section>
</template>

<style scoped>
.employee-page { display: flex; flex-direction: column; gap: 12px; height: 100%; container-type: inline-size; }
.text-link { display: inline-flex; align-items: center; gap: 5px; width: fit-content; color: var(--accent); font-size: 13px; }
.text-link:hover { text-decoration: underline; }
.employee-profile { display: flex; align-items: center; justify-content: space-between; flex: none; min-height: 62px; gap: 12px; padding: 8px 12px; }
.employee-identity { display: flex; align-items: center; flex: 1; min-width: 0; gap: 9px; }
.profile-back { flex: 0 0 30px; width: 30px; height: 30px; }
.employee-avatar { display: grid; flex: 0 0 34px; height: 34px; place-items: center; color: #fff; border-radius: 8px; font-size: 15px; font-weight: 700; }
.employee-name { flex: 1; min-width: 0; }
.employee-title { display: flex; align-items: baseline; gap: 7px; }
.employee-name h1 { margin: 0; font-size: 16px; line-height: 1.4; }
.employee-role { color: var(--muted); font-size: 11px; }
.employee-name p { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
.employee-name h1, .employee-role, .employee-name p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.profile-actions .el-button, .work-card-actions .el-button { margin: 0; }
.profile-actions .el-button { padding-inline: 9px; font-size: 12px; }
.profile-actions .work-drawer-trigger { display: none; }
.work-menu-icon { margin-left: 4px; }
.employee-workspace { display: grid; flex: 1; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; min-height: 280px; }
.employee-work-panel { display: flex; min-width: 0; min-height: 0; overflow: hidden; }
.conversation { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.conversation-header { flex: none; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.conversation-header h2 { margin: 0; font-size: 14px; line-height: 20px; }
.conversation-messages { flex: 1; min-height: 0; padding: 16px; overflow: auto; scrollbar-gutter: stable; }
.conversation-empty { display: grid; min-height: 160px; align-content: center; justify-items: center; gap: 6px; color: var(--muted); text-align: center; font-size: 13px; }
.conversation-empty p { margin: 0; }
.timeline-item { display: grid; gap: 8px; margin-bottom: 14px; }
.message { display: grid; justify-items: start; min-width: 0; gap: 5px; }
.message-own { justify-items: end; }
.message-label { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; }
.message-body { max-width: 90%; padding: 9px 11px; border-radius: 9px; background: var(--canvas); font-size: 13px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.message-own .message-body { background: var(--soft); color: #243d89; }
.work-card { width: min(100%, 500px); padding: 11px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); scroll-margin: 10px; }
.proposal-card { border-color: #dce5ff; background: #f8faff; }
.task-focused { border-color: var(--accent); }
.work-card-title { display: flex; align-items: flex-start; gap: 7px; font-size: 13px; }
.work-card-title svg { flex: none; margin-top: 2px; color: var(--accent); }
.work-card-title strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.work-card p, .supplement-question { margin: 7px 0; color: var(--muted); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.work-card-actions, .dialog-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.sending-note { color: var(--muted); font-size: 12px; }
.composer { flex: none; padding: 12px 16px; border-top: 1px solid var(--line); }
.composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.recipient { margin: 0 0 13px; }
.recipient strong { margin-left: 4px; }
:global(.employee-work-drawer .el-drawer__header) { margin-bottom: 0; padding: 14px 16px 12px; }
:global(.employee-work-drawer .el-drawer__body) { display: flex; min-height: 0; padding: 0; overflow: hidden; }

@container (max-width: 710px) {
  .employee-workspace { grid-template-columns: minmax(0, 1fr); }
  .employee-work-panel { display: none; }
  .profile-actions .work-drawer-trigger { display: inline-flex; }
}
@container (max-width: 520px) {
  .employee-profile { align-items: stretch; flex-direction: column; gap: 7px; padding: 7px 9px; }
  .profile-actions { justify-content: flex-end; flex-wrap: wrap; }
  .profile-actions .el-button { height: 29px; padding-inline: 7px; }
  .conversation-messages, .conversation-header, .composer { padding-inline: 10px; }
}
</style>
