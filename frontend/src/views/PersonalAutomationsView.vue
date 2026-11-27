<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clock, Ellipsis, MessageSquare, Pencil, Plus, Search, X } from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  usePersonalAutomationsStore, type AutomationDraft, type AutomationFrequency,
  type AutomationStatus, type PersonalAutomation,
} from '@/stores/personalAutomations'
import { usePlatformStore } from '@/stores/platform'

const platform = usePlatformStore()
const automation = usePersonalAutomationsStore()
const route = useRoute()
const router = useRouter()
const statuses = { active: '已开启', paused: '已暂停', ended: '已结束', all: '全部' }
const filters: (AutomationStatus | 'all')[] = ['active', 'paused', 'ended', 'all']
const frequencies: Record<AutomationFrequency, string> = { once: '仅一次', daily: '每天', weekly: '每周' }
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const weekdayFormat = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' })
const query = ref('')
const filter = ref<AutomationStatus | 'all'>('active')
const selectedId = ref('')
const detailTab = ref<'rule' | 'runs'>('rule')
const searchField = ref<HTMLInputElement>()
const detailTitle = ref<HTMLHeadingElement>()
let opener: HTMLElement | undefined
const selected = computed(() => automation.tasks.find(task => task.id === selectedId.value))
const endedCount = computed(() => automation.tasks.filter(task => task.status === 'ended').length)
const rows = computed(() => {
  const term = query.value.trim().toLowerCase()
  return automation.tasks.filter(task =>
    (filter.value === 'all' || filter.value === task.status) &&
    (task.name.toLowerCase().includes(term) || task.instruction.toLowerCase().includes(term)),
  )
})
const emptyText = computed(() => query.value.trim()
  ? '未找到匹配的任务'
  : filter.value === 'all' ? '暂无自动化任务' : `暂无${statuses[filter.value]}的任务`)
const editing = ref(false)
const editId = ref('')
const draft = reactive<AutomationDraft>({ name: '', instruction: '', frequency: 'daily', startAt: '' })
const formError = ref('')

watch(() => platform.currentUser.id, () => {
  query.value = ''
  filter.value = 'active'
  selectedId.value = ''
  editing.value = false
  opener = undefined
})

watch(() => route.query.task, id => {
  if (route.name !== 'personal-automations' || id === selectedId.value) return
  const task = automation.tasks.find(item => item.id === id)
  if (!task) {
    if (selectedId.value || id !== undefined) void closeDetail()
    return
  }
  query.value = ''
  filter.value = task.status
  void openDetail(task.id)
}, { immediate: true })

function formatDate(value: string) {
  return dateFormat.format(new Date(value))
}

function scheduleSummary(task: PersonalAutomation) {
  const start = new Date(task.startAt)
  if (task.frequency === 'once') return formatDate(task.startAt)
  const repeat = task.frequency === 'weekly'
    ? `每周${weekdayFormat.format(start).slice(-1)}`
    : frequencies.daily
  return `${repeat} ${timeFormat.format(start)}`
}

async function openDetail(id: string, event?: MouseEvent) {
  opener = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
  selectedId.value = id
  detailTab.value = 'rule'
  await nextTick()
  if (!editing.value) detailTitle.value?.focus()
}

function selectTask(id: string, event?: MouseEvent) {
  void openDetail(id, event)
  if (route.query.task !== id) void router.replace({ query: { ...route.query, task: id } })
}

async function closeDetail() {
  selectedId.value = ''
  if (route.query.task !== undefined) void router.replace({ query: { ...route.query, task: undefined } })
  await nextTick()
  if (opener?.isConnected) opener.focus()
  else searchField.value?.focus()
  opener = undefined
}

function edit(task?: PersonalAutomation) {
  editId.value = task?.id ?? ''
  formError.value = ''
  draft.name = task?.name ?? ''
  draft.instruction = task?.instruction ?? ''
  draft.frequency = task?.frequency ?? 'daily'
  draft.startAt = task?.startAt ?? ''
  editing.value = true
}

function openConversation() {
  void router.push({ path: '/work/chat', query: { automation: '1' } })
}

function chooseCreation(method: 'chat' | 'manual') {
  if (method === 'chat') openConversation()
  else edit()
}

function save() {
  const result = automation.save(draft, editId.value || undefined)
  if (!result) {
    formError.value = '请填写任务名称、有效的计划时间和任务指令。'
    return
  }
  editing.value = false
  if (!editId.value) {
    query.value = ''
    filter.value = 'active'
    selectTask(result.id)
  }
  ElMessage.success(editId.value ? '已保存任务' : '已新建任务')
}

function handleTaskAction(action: 'pause' | 'run' | 'delete', task: PersonalAutomation) {
  if (action === 'delete') {
    void confirmRemoval(task)
  } else if (action === 'pause') {
    automation.setPaused(task.id, task.status === 'active')
  } else {
    automation.runNow(task.id)
    detailTab.value = 'runs'
    ElMessage.success('已添加模拟运行记录')
  }
}

async function confirmRemoval(task?: PersonalAutomation) {
  const account = platform.currentUser.id
  try {
    await ElMessageBox.confirm(
      task ? `删除「${task.name}」及其运行记录？` : `清除全部 ${endedCount.value} 项已结束的任务及其运行记录？`,
      task ? '删除任务' : '清除已结束任务',
      { confirmButtonText: task ? '删除' : '清除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  if (account !== platform.currentUser.id) return
  if (task) automation.remove(task.id)
  else automation.clearEnded()
  if (!selected.value && selectedId.value) await closeDetail()
}
</script>

<template>
  <section class="page-surface page-with-control-inset automation-page" aria-label="自动化任务">
    <div class="automation-layout" :class="{ 'has-detail': selected }">
      <div class="automation-list-pane">
        <PageHeader title="自动化任务">
          <template #actions>
            <el-dropdown v-if="endedCount && filter !== 'active'" trigger="click" placement="bottom-end" @command="confirmRemoval()">
              <button class="icon-button" type="button" aria-label="任务列表更多操作" title="任务列表更多操作"><Ellipsis :size="18" /></button>
              <template #dropdown>
                <el-dropdown-menu><el-dropdown-item>清除已结束任务</el-dropdown-item></el-dropdown-menu>
              </template>
            </el-dropdown>
            <div role="group" aria-label="新建自动化任务">
              <el-dropdown class="automation-create" split-button type="primary" :button-props="{ plain: true }"
                trigger="click" placement="bottom-end" @click="openConversation" @command="chooseCreation">
                <span class="automation-create-label"><Plus :size="15" aria-hidden="true" />新建</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="chat"><MessageSquare :size="15" aria-hidden="true" />在会话中创建</el-dropdown-item>
                    <el-dropdown-item command="manual"><Pencil :size="15" aria-hidden="true" />手动配置</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
          <div class="page-toolbar page-tab-toolbar automation-query">
            <el-select v-model="filter" class="filter-field filter-select" aria-label="任务状态" popper-class="filter-options">
              <el-option v-for="status in filters" :key="status" :value="status" :label="statuses[status] + '任务'" />
            </el-select>
            <label class="automation-search filter-search">
              <Search :size="15" aria-hidden="true" />
              <input ref="searchField" v-model="query" type="search" placeholder="搜索任务" aria-label="搜索任务" />
            </label>
          </div>
        </PageHeader>

        <ul v-if="rows.length" class="automation-rows" aria-label="任务列表">
          <li v-for="task in rows" :key="task.id">
            <button class="automation-row" type="button" :class="{ inactive: task.status !== 'active' }"
              :aria-expanded="selectedId === task.id" :aria-controls="selectedId === task.id ? 'automation-detail' : undefined"
              @click="selectTask(task.id, $event)">
              <Clock :size="19" class="row-clock" aria-hidden="true" />
              <span class="row-copy">
                <strong>{{ task.name }}</strong>
                <span class="row-meta">
                  <span v-if="task.status !== 'active'">{{ statuses[task.status] }}</span>
                  <span>{{ scheduleSummary(task) }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else class="automation-empty" role="status"><Clock :size="33" aria-hidden="true" /><p>{{ emptyText }}</p></div>
      </div>

      <aside v-if="selected" id="automation-detail" class="automation-detail" aria-labelledby="automation-detail-title"
        @keydown.esc.stop="closeDetail()">
        <header class="automation-detail-heading">
          <div>
            <h2 id="automation-detail-title" ref="detailTitle" tabindex="-1">{{ selected.name }}</h2>
            <span class="detail-status">{{ statuses[selected.status] }}</span>
          </div>
          <div class="automation-detail-actions">
            <button v-if="selected.status !== 'ended'" class="icon-button" type="button" aria-label="编辑任务" title="编辑任务"
              @click="edit(selected)"><Pencil :size="16" /></button>
            <el-dropdown trigger="click" placement="bottom-end" @command="handleTaskAction($event, selected)">
              <button class="icon-button" type="button" aria-label="任务更多操作" title="任务更多操作"><Ellipsis :size="18" /></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="selected.status !== 'ended'" command="pause">{{ selected.status === 'active' ? '暂停' : '恢复' }}</el-dropdown-item>
                  <el-dropdown-item v-if="selected.status !== 'ended'" command="run">模拟运行</el-dropdown-item>
                  <el-dropdown-item command="delete">删除任务</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <button class="icon-button" type="button" aria-label="关闭详情" title="关闭详情" @click="closeDetail"><X :size="18" /></button>
          </div>
        </header>
        <div class="page-tabs" role="group" aria-label="任务详情视图">
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'rule'" @click="detailTab = 'rule'">规则</button>
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'runs'" @click="detailTab = 'runs'">任务运行记录</button>
        </div>
        <div class="automation-detail-body">
          <template v-if="detailTab === 'rule'">
            <dl class="automation-rule">
              <div><dt>重复</dt><dd>{{ frequencies[selected.frequency] }}</dd></div>
              <div><dt>{{ selected.frequency === 'once' ? '计划时间' : '开始时间' }}</dt><dd>{{ formatDate(selected.startAt) }}</dd></div>
            </dl>
            <h3>任务指令</h3>
            <p class="task-instruction">{{ selected.instruction }}</p>
          </template>
          <ul v-else-if="selected.runs.length" class="automation-runs" aria-label="任务运行记录">
            <li v-for="run in selected.runs" :key="run.id">
              <Clock :size="16" aria-hidden="true" />
              <div><time :datetime="run.ranAt">{{ formatDate(run.ranAt) }}</time><span>模拟运行</span></div>
            </li>
          </ul>
          <p v-else class="muted">暂无运行记录</p>
        </div>
      </aside>
    </div>

    <el-dialog v-model="editing" :title="editId ? '编辑任务' : '新建自动化任务'" width="min(500px, calc(100vw - 32px))">
      <form id="automation-editor" class="automation-form" @submit.prevent="save">
        <label>任务名称<input v-model="draft.name" required maxlength="80" placeholder="例如：整理今日待办" /></label>
        <div class="editor-timing">
          <label>重复<select v-model="draft.frequency">
            <option v-for="(label, value) in frequencies" :key="value" :value="value">{{ label }}</option>
          </select></label>
          <label>计划时间<input v-model="draft.startAt" required type="datetime-local" /></label>
        </div>
        <label>任务指令<textarea v-model="draft.instruction" required maxlength="2000" rows="4"
          placeholder="描述到达计划时间时需要处理的工作" /></label>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <el-button @click="editing = false">取消</el-button>
        <el-button type="primary" native-type="submit" form="automation-editor">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.automation-page {
  container-type: inline-size; display: flex; flex-direction: column; --automation-hover: #f1f3f6;
}
.automation-layout { display: flex; flex: 1; }
.automation-list-pane { flex: 1; min-width: 0; }
.automation-query { flex-wrap: nowrap; justify-content: flex-start; gap: 10px; }
.automation-create { white-space: nowrap; }
.automation-create-label { display: inline-flex; align-items: center; gap: 5px; }
.automation-create :deep(.el-button) { padding-inline: 8px; font-size: 13px; }
.page-title-row .icon-button { width: 30px; height: 32px; }
.automation-search { flex: 0 1 220px; }
.automation-rows, .automation-runs { display: grid; gap: 2px; padding: 0; margin: 0; list-style: none; }
.automation-rows { margin: var(--page-body-start) var(--page-control-inline) 16px; }
.automation-row {
  display: flex; align-items: center; width: 100%; min-height: 58px; gap: 12px; padding: 8px 12px;
  border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left;
}
.automation-row:hover, .automation-row[aria-expanded="true"] { background: var(--automation-hover); }
.row-clock { flex: none; color: var(--muted); }
.row-copy { display: grid; gap: 4px; min-width: 0; }
.row-copy strong { font-weight: 600; overflow-wrap: anywhere; }
.row-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: 12px; }
.inactive .row-copy strong { color: var(--muted); }
.automation-empty { display: grid; justify-items: center; padding: 50px 8px; color: var(--muted); }
.automation-empty svg { color: #98a5bd; }
.automation-empty p { margin: 12px 0 0; }
.automation-detail { flex: 0 0 min(42%, 460px); min-width: 0; border-inline-start: 1px solid var(--line); }
.automation-detail-heading {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; min-width: 0; padding: var(--page-body-start) 18px 6px;
}
.automation-detail-heading h2 { margin: 0 0 5px; font-size: 18px; font-weight: 650; overflow-wrap: anywhere; }
.automation-detail-actions { display: flex; flex: none; gap: 2px; }
.automation-detail-actions .icon-button { width: 30px; height: 30px; padding: 0; }
.detail-status { color: var(--muted); font-size: 12px; }
.automation-detail > .page-tabs { --page-control-inline: 12px; }
.automation-detail-body { padding: var(--page-body-start) 18px 18px; }
.automation-detail-body h3 { margin: 17px 0 8px; font-size: 14px; font-weight: 650; }
.automation-rule { margin: 0; padding: 2px 12px; border-radius: 10px; background: #f6f7f9; }
.automation-rule div { display: flex; justify-content: space-between; gap: 10px; padding-block: 9px; }
.automation-rule div + div { border-top: 1px solid var(--line); }
.automation-rule dt { flex: none; color: var(--muted); }
.automation-rule dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
.task-instruction { margin: 0; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.automation-runs li { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; }
.automation-runs li + li { border-top: 1px solid var(--line); }
.automation-runs svg { margin-top: 2px; color: var(--muted); }
.automation-runs li div { display: grid; gap: 3px; }
.automation-runs li span { color: var(--muted); font-size: 12px; }
.automation-form { display: grid; gap: 14px; }
.automation-form label { display: grid; gap: 6px; min-width: 0; }
.editor-timing { display: flex; flex-wrap: wrap; gap: 10px; }
.editor-timing label { flex: 1 1 155px; }
.automation-form :is(input, textarea, select) {
  width: 100%; min-width: 0; min-height: 34px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--surface); color: var(--text);
}
.form-error { margin: 0; color: #b03e35; }
@container (max-width: 740px) {
  .has-detail .automation-list-pane { display: none; }
  .automation-detail { flex-basis: 100%; border-inline-start: 0; }
}
</style>
