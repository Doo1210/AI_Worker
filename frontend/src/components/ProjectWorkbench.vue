<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowDownRight, Check, ChevronLeft, ChevronRight, Flag, Lightbulb, ListChecks, Plus, Search, Sparkles } from 'lucide-vue-next'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import { useWorkbenchAssistant } from '@/workbenchAssistant'
import { makeId, usePlatformStore } from '@/stores/platform'
import {
  ideaStatuses, isOverdue, isProjectDate, projectStatuses, projectStatusChange, projectTimeline,
  projectToday, projectTodayGroups, projectWeek, sampleProjects, shiftProjectDay, sortProjectTasks,
  type IdeaStatus, type ManagedProject, type Priority, type ProjectIdea, type ProjectStatus, type ProjectTask,
} from '@/stores/projectWorkbench'
import ProjectTaskRow from './ProjectTaskRow.vue'

const props = defineProps<{ userId: string }>()
const store = usePlatformStore()
const { assistant } = useWorkbenchAssistant()
const assistantFallback = '项目助理'
const storageKey = `ai-worker-project-workbench:${props.userId}`
const today = ref(projectToday())
const saved = readProjects()
const projects = ref(saved?.projects ?? sampleProjects(today.value))
const projectId = ref(saved?.projectId ?? projects.value[0].id)
const project = computed(() => projects.value.find(item => item.id === projectId.value) ?? projects.value[0])
const tabs = [
  { id: 'today', name: '今日' },
  { id: 'week', name: '本周' },
  { id: 'tasks', name: '任务' },
  { id: 'ideas', name: '想法' },
] as const
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const priorityLabels: Record<Priority, string> = { high: '高优先', normal: '普通', low: '低优先' }
const tab = ref<typeof tabs[number]['id']>('today')
const weekAnchor = ref(today.value)
const days = computed(() => projectWeek(weekAnchor.value))
const todayGroups = computed(() => projectTodayGroups(project.value.tasks, today.value))
const timeline = computed(() => projectTimeline(project.value.tasks, days.value))
const milestone = computed(() => project.value.tasks.filter(task => task.milestone && task.status !== 'done')
  .sort((a, b) => a.due.localeCompare(b.due))[0])
const search = ref('')
const priority = ref<Priority | ''>('')
const ideaFilter = ref<IdeaStatus | ''>('')
const filteredTasks = computed(() => sortProjectTasks(project.value.tasks.filter(task =>
  (!priority.value || task.priority === priority.value)
  && [task.title, task.note, ownerName(task.ownerId)].some(text => text.toLowerCase().includes(search.value.trim().toLowerCase())))))
const filteredIdeas = computed(() => project.value.ideas.filter(idea => !ideaFilter.value || idea.status === ideaFilter.value))
const linkedIdeas = computed(() => new Map(project.value.tasks.filter(task => task.ideaId).map(task => [task.ideaId, task])))
const reviewPeriod = ref<'daily' | 'weekly'>('daily')
const lastWeek = computed(() => projectWeek(shiftProjectDay(today.value, -7)))
const reviewKey = computed(() => reviewPeriod.value === 'daily' ? today.value : `week:${lastWeek.value[0]}`)
const reviewDrafts = reactive<Record<string, string>>({})
const reviewDraftKey = computed(() => `${project.value.id}/${reviewKey.value}`)
const reviewSaved = computed(() => project.value.reviews[reviewKey.value] ?? '')
const reviewText = computed({
  get: () => reviewDrafts[reviewDraftKey.value] ?? reviewSaved.value,
  set: value => { reviewDrafts[reviewDraftKey.value] = value },
})
type AssistantAction = 'priorities' | 'risk' | 'review'
const action = ref<AssistantAction>()
const assistantName = ref('')
const dialog = ref<'task' | 'idea' | 'project'>()
const dialogOpen = computed({ get: () => Boolean(dialog.value), set: open => { if (!open) dialog.value = undefined } })
type TaskDraft = Omit<ProjectTask, 'id' | 'completedOn' | 'previousStatus'> & { id?: string }
const taskDraft = ref<TaskDraft>(emptyTask(today.value))
const ideaDraft = ref<{ id?: string; title: string; note: string; status: IdeaStatus }>({ title: '', note: '', status: 'open' })
const projectDraft = reactive({ name: '', goal: '' })
const error = ref('')
let clock: number | undefined

const assistantResult = computed(() => {
  if (action.value === 'priorities') {
    const candidates = sortProjectTasks([...todayGroups.value.overdue, ...todayGroups.value.active]).filter(task => task.status !== 'blocked')
    const items = candidates.slice(0, 3).map(task => ({
      task,
      reason: `${isOverdue(task, today.value) ? '已逾期' : '在今日计划内'} · ${priorityLabels[task.priority]} · ${ownerName(task.ownerId)}`,
    }))
    return { title: '今日优先事项', summary: items.length ? '按优先级和截止日列出最多三项可推进工作。' : '当前没有可直接推进的今日任务。', items }
  }
  if (action.value === 'risk') {
    const nextWeek = shiftProjectDay(today.value, 7)
    const items = sortProjectTasks(project.value.tasks.filter(task =>
      task.status !== 'done' && (task.status === 'blocked' || isOverdue(task, today.value) || (task.milestone && task.due <= nextWeek)),
    )).map(task => ({
      task,
      reason: [
        isOverdue(task, today.value) ? '已逾期' : '',
        task.status === 'blocked' ? task.blocker || '阻塞原因待补充' : '',
        task.milestone ? `${task.due} 里程碑` : '',
      ].filter(Boolean).join(' · '),
    }))
    return { title: '交付风险', summary: items.length ? '依据逾期、受阻和临近里程碑汇总。' : '当前没有逾期、受阻或七日内未完成的里程碑。', items }
  }
  if (action.value === 'review') {
    const [start, end] = reviewPeriod.value === 'daily' ? [today.value, today.value] : [lastWeek.value[0], lastWeek.value[6]]
    const done = project.value.tasks.filter(task => task.completedOn && task.completedOn >= start && task.completedOn <= end)
    const unfinished = sortProjectTasks(project.value.tasks.filter(task => task.status !== 'done' && task.start <= end && task.due >= start))
    return {
      title: reviewPeriod.value === 'daily' ? '日复盘材料' : '周复盘材料',
      summary: `本期完成 ${done.length} 项，当前仍有 ${unfinished.length} 项计划内任务未完成。`,
      items: [...done.map(task => ({ task, reason: '本期完成' })), ...unfinished.map(task => ({ task, reason: projectStatuses[task.status] }))],
    }
  }
})

function runAssistant(next: AssistantAction) {
  assistantName.value = assistant.value?.name ?? assistantFallback
  action.value = next
}

watch([projects, projectId], () => {
  try { localStorage.setItem(storageKey, JSON.stringify({ projects: projects.value, projectId: projectId.value })) } catch { /* Keep the open workspace usable. */ }
}, { deep: true })
watch(projectId, () => { search.value = ''; priority.value = ''; ideaFilter.value = ''; action.value = undefined })
onMounted(() => {
  clock = window.setInterval(() => {
    const next = projectToday()
    if (next === today.value) return
    if (weekAnchor.value === today.value) weekAnchor.value = next
    today.value = next
  }, 60_000)
})
onUnmounted(() => { if (clock !== undefined) window.clearInterval(clock) })

function readProjects() {
  try {
    const state = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { projects: ManagedProject[]; projectId: string } | null
    if (state && Array.isArray(state.projects) && state.projects.length && state.projects.every(item =>
      item && Array.isArray(item.tasks) && Array.isArray(item.ideas) && item.reviews,
    )) return state
  } catch { /* Fall back to the examples. */ }
}

function ownerName(id: string) {
  return store.users.find(user => user.id === id)?.name ?? '未分配'
}

function emptyTask(date: string): TaskDraft {
  return { title: '', ownerId: props.userId, start: date, due: date, status: 'todo', priority: 'normal', milestone: false, note: '', blocker: '' }
}

function openTask(task?: ProjectTask, date = today.value, idea?: ProjectIdea) {
  taskDraft.value = task ? { ...task } : emptyTask(date)
  if (idea) Object.assign(taskDraft.value, { title: idea.title, note: idea.note, ideaId: idea.id })
  error.value = ''
  dialog.value = 'task'
}

function openIdea(idea?: ProjectIdea) {
  ideaDraft.value = idea ? { ...idea } : { title: '', note: '', status: 'open' }
  error.value = ''
  dialog.value = 'idea'
}

function openProject() {
  Object.assign(projectDraft, { name: '', goal: '' })
  error.value = ''
  dialog.value = 'project'
}

function saveDialog() {
  if (dialog.value === 'project') {
    const name = projectDraft.name.trim()
    if (!name) { error.value = '请输入项目名称。'; return }
    const newProject: ManagedProject = { id: makeId('project'), name, goal: projectDraft.goal.trim(), tasks: [], ideas: [], reviews: {} }
    projects.value.push(newProject)
    projectId.value = newProject.id
    tab.value = 'today'
  } else if (dialog.value === 'idea') {
    const { id, title, note, status } = ideaDraft.value
    if (!title.trim()) { error.value = '请输入想法标题。'; return }
    const existing = project.value.ideas.find(idea => idea.id === id)
    const data = { title: title.trim(), note: note.trim(), status }
    if (existing) Object.assign(existing, data)
    else project.value.ideas.unshift({ id: makeId('idea'), ...data })
  } else if (dialog.value === 'task') {
    const { id, title, status, milestone: isMilestone, due, start, ownerId, priority, note, blocker, ideaId } = taskDraft.value
    const starts = isMilestone ? due : start
    if (!title.trim()) { error.value = '请输入任务标题。'; return }
    if (!isProjectDate(starts) || !isProjectDate(due) || starts > due) {
      error.value = '请选择有效日期，截止日期应在开始日期当天或之后。'
      return
    }
    const existing = project.value.tasks.find(task => task.id === id)
    const fields = { ownerId, priority, note: note.trim(), blocker: blocker.trim(), ideaId, title: title.trim(), start: starts, due, milestone: isMilestone }
    if (existing) {
      Object.assign(existing, fields)
      projectStatusChange(existing, status, today.value)
    } else {
      if (ideaId && linkedIdeas.value.has(ideaId)) {
        error.value = '该想法已关联任务。'
        return
      }
      const task: ProjectTask = { id: makeId('task'), ...fields, status: 'todo' }
      projectStatusChange(task, status, today.value)
      project.value.tasks.push(task)
    }
  }
  dialog.value = undefined
}

function toggleTask(task: ProjectTask) {
  projectStatusChange(task, task.status === 'done' ? task.previousStatus ?? 'todo' : 'done', today.value)
}

function saveReview() {
  const value = reviewText.value.trim()
  if (value) project.value.reviews[reviewKey.value] = value
  else delete project.value.reviews[reviewKey.value]
  delete reviewDrafts[reviewDraftKey.value]
}
</script>

<template>
  <section class="pm-workbench" aria-label="项目管理工作台">
    <header class="pm-top">
      <div class="pm-brand">
        <span><ListChecks :size="20" aria-hidden="true" /></span>
        <div><h1>项目管理工作台</h1><small>{{ today }} · {{ todayGroups.active.length + todayGroups.overdue.length }} 项待办</small></div>
      </div>
      <nav class="pm-tabs" aria-label="项目工作区">
        <button v-for="item in tabs" :key="item.id" type="button" :aria-pressed="tab === item.id" @click="tab = item.id">{{ item.name }}</button>
      </nav>
      <button v-if="tab === 'ideas'" class="pm-button pm-primary" type="button" @click="openIdea()"><Plus :size="16" aria-hidden="true" />新建想法</button>
      <button v-else class="pm-button pm-primary" type="button" @click="openTask()"><Plus :size="16" aria-hidden="true" />新建任务</button>
    </header>

    <div class="pm-project">
      <div>
        <label><span>项目</span><select v-model="projectId" aria-label="选择项目"><option v-for="item in projects" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <p v-if="project.goal">{{ project.goal }}</p>
      </div>
      <button v-if="milestone" class="pm-next" type="button" @click="openTask(milestone)">
        <Flag :size="15" aria-hidden="true" /><span>里程碑 · {{ milestone.title }}</span><time :datetime="milestone.due">{{ milestone.due.slice(5) }}</time>
      </button>
      <button class="pm-button" type="button" @click="openProject"><Plus :size="14" aria-hidden="true" />新建项目</button>
    </div>

    <div class="pm-layout">
      <div class="pm-content">
        <template v-if="tab === 'today'">
          <section class="pm-summary" aria-label="今日任务统计">
            <div><h2>今天</h2><p>{{ weekdays[projectWeek(today).indexOf(today)] }} · {{ today }}</p></div>
            <dl>
              <div><dt>今日待办</dt><dd>{{ todayGroups.active.length }}</dd></div>
              <div :class="{ 'pm-danger-number': todayGroups.overdue.length }"><dt>逾期</dt><dd>{{ todayGroups.overdue.length }}</dd></div>
              <div><dt>今日完成</dt><dd>{{ todayGroups.completed.length }}</dd></div>
            </dl>
          </section>
          <section v-if="todayGroups.overdue.length" aria-label="逾期任务">
            <h2 class="pm-section-title">逾期 <span>{{ todayGroups.overdue.length }}</span></h2>
            <div class="pm-list">
              <ProjectTaskRow v-for="task in todayGroups.overdue" :key="task.id" :task="task" :owner="ownerName(task.ownerId)" late @open="openTask(task)" @toggle="toggleTask(task)" />
            </div>
          </section>
          <section aria-label="今天要做">
            <h2 class="pm-section-title">今天要做 <span>{{ todayGroups.active.length }}</span></h2>
            <div v-if="todayGroups.active.length" class="pm-list">
              <ProjectTaskRow v-for="task in todayGroups.active" :key="task.id" :task="task" :owner="ownerName(task.ownerId)" @open="openTask(task)" @toggle="toggleTask(task)" />
            </div>
            <div v-else class="pm-empty">
              <Check :size="23" aria-hidden="true" /><strong>今天没有待办</strong>
              <button class="pm-button pm-primary" type="button" @click="openTask()"><Plus :size="15" aria-hidden="true" />新建任务</button>
            </div>
          </section>
          <section aria-label="今天已完成">
            <h2 class="pm-section-title">今天已完成 <span>{{ todayGroups.completed.length }}</span></h2>
            <div v-if="todayGroups.completed.length" class="pm-list">
              <ProjectTaskRow v-for="task in todayGroups.completed" :key="task.id" :task="task" :owner="ownerName(task.ownerId)" @open="openTask(task)" @toggle="toggleTask(task)" />
            </div>
            <p v-else class="pm-muted">还没有完成记录。</p>
          </section>
          <section aria-label="项目复盘">
            <h2 class="pm-section-title">复盘</h2>
            <form class="pm-review" @submit.prevent="saveReview">
              <div class="pm-review-head">
                <div class="pm-tabs" role="group" aria-label="复盘周期">
                  <button type="button" :aria-pressed="reviewPeriod === 'daily'" @click="reviewPeriod = 'daily'">日复盘</button>
                  <button type="button" :aria-pressed="reviewPeriod === 'weekly'" @click="reviewPeriod = 'weekly'">周复盘</button>
                </div>
                <span>{{ reviewPeriod === 'daily' ? today : `${lastWeek[0]} – ${lastWeek[6]}` }}</span>
              </div>
              <textarea v-model="reviewText" rows="3" maxlength="4000" aria-label="复盘正文" placeholder="完成了什么、遇到哪些阻碍、接下来怎么做…" />
              <div class="pm-review-footer"><span>{{ reviewSaved ? '已保存' : '待写' }}</span><button class="pm-button pm-primary" type="submit" :disabled="reviewText.trim() === reviewSaved">保存复盘</button></div>
            </form>
          </section>
        </template>

        <section v-else-if="tab === 'week'" class="pm-panel pm-week" aria-label="项目周排期">
          <header class="pm-panel-head">
            <div><h2>项目排期</h2><p>{{ days[0] }} – {{ days[6] }}</p></div>
            <div class="pm-week-nav">
              <button class="pm-button" type="button" aria-label="上一周" @click="weekAnchor = shiftProjectDay(weekAnchor, -7)"><ChevronLeft :size="16" /></button>
              <button class="pm-button" type="button" @click="weekAnchor = today">回到本周</button>
              <button class="pm-button" type="button" aria-label="下一周" @click="weekAnchor = shiftProjectDay(weekAnchor, 7)"><ChevronRight :size="16" /></button>
            </div>
          </header>
          <div class="pm-timeline-scroll">
            <div class="pm-timeline">
              <div class="pm-time-head">
                <span>任务 / 里程碑</span>
                <button v-for="(day, index) in days" :key="day" type="button" :class="{ 'pm-today-col': day === today }" :aria-label="`${day} 新建任务`" @click="openTask(undefined, day)">
                  <span>{{ weekdays[index] }}</span><strong>{{ day.slice(5) }}</strong>
                </button>
              </div>
              <div v-for="span in timeline" :key="span.task.id" class="pm-time-row">
                <button class="pm-time-name" type="button" @click="openTask(span.task)"><Flag v-if="span.task.milestone" :size="13" aria-hidden="true" />{{ span.task.title }}</button>
                <span v-for="(day, index) in days" :key="day" class="pm-time-cell" :class="{ 'pm-today-col': day === today }" :style="{ gridColumn: index + 2 }" aria-hidden="true" />
                <button
                  type="button"
                  class="pm-time-bar"
                  :class="[`pm-status-${span.task.status}`, { 'pm-time-milestone': span.task.milestone }]"
                  :style="{ gridColumn: `${span.from + 2} / ${span.to + 3}` }"
                  :aria-label="`${span.task.title}，${span.task.start} 至 ${span.task.due}`"
                  @click="openTask(span.task)"
                ><Flag v-if="span.task.milestone" :size="12" aria-hidden="true" /><span>{{ span.task.milestone ? '里程碑' : projectStatuses[span.task.status] }}</span></button>
              </div>
            </div>
          </div>
          <p v-if="!timeline.length" class="pm-muted pm-empty-timeline">这一周暂无排期。点击日期可安排任务。</p>
        </section>

        <section v-else-if="tab === 'tasks'" aria-label="项目任务看板">
          <div class="pm-board-toolbar">
            <h2>任务看板</h2>
            <label><Search :size="15" aria-hidden="true" /><input v-model="search" type="search" aria-label="搜索项目任务" placeholder="搜索任务或负责人" /></label>
            <select v-model="priority" aria-label="筛选优先级"><option value="">全部优先级</option><option v-for="(label, id) in priorityLabels" :key="id" :value="id">{{ label }}</option></select>
          </div>
          <div class="pm-board">
            <section v-for="(label, status) in projectStatuses" :key="status" class="pm-column" :aria-label="label">
              <h3>{{ label }} <span>{{ filteredTasks.filter(task => task.status === status).length }}</span></h3>
              <div v-for="task in filteredTasks.filter(item => item.status === status)" :key="task.id" class="pm-board-card">
                <ProjectTaskRow :task="task" :owner="ownerName(task.ownerId)" :late="isOverdue(task, today)" @open="openTask(task)" @toggle="toggleTask(task)" />
                <select
                  :value="task.status"
                  :aria-label="`移动任务 ${task.title}`"
                  @change="projectStatusChange(task, ($event.target as HTMLSelectElement).value as ProjectStatus, today)"
                ><option v-for="(name, id) in projectStatuses" :key="id" :value="id">{{ name }}</option></select>
              </div>
              <p v-if="!filteredTasks.some(task => task.status === status)" class="pm-muted">暂无任务</p>
            </section>
          </div>
        </section>

        <section v-else aria-label="项目想法池">
          <div class="pm-board-toolbar">
            <h2>想法池</h2>
            <select v-model="ideaFilter" aria-label="筛选想法状态"><option value="">全部状态</option><option v-for="(label, id) in ideaStatuses" :key="id" :value="id">{{ label }}</option></select>
          </div>
          <div v-if="filteredIdeas.length" class="pm-ideas">
            <article v-for="idea in filteredIdeas" :key="idea.id" class="pm-idea">
              <span class="pm-chip">{{ ideaStatuses[idea.status] }}</span>
              <button class="pm-idea-title" type="button" @click="openIdea(idea)"><Lightbulb :size="16" aria-hidden="true" />{{ idea.title }}</button>
              <p v-if="idea.note">{{ idea.note }}</p>
              <button v-if="linkedIdeas.has(idea.id)" class="pm-button" type="button" @click="openTask(linkedIdeas.get(idea.id))">查看关联任务</button>
              <button v-else class="pm-button" type="button" @click="openTask(undefined, today, idea)"><ArrowDownRight :size="14" aria-hidden="true" />转为任务</button>
            </article>
          </div>
          <div v-else class="pm-empty"><Lightbulb :size="22" aria-hidden="true" /><strong>暂无符合条件的想法</strong></div>
        </section>
      </div>

      <aside class="pm-assistant" aria-label="项目助理">
        <header><span><Sparkles :size="17" aria-hidden="true" /></span><h2>项目助理</h2><small>本地规则</small></header>
        <WorkbenchAssistantSelect :fallback-label="assistantFallback" />
        <p class="pm-assistant-context">{{ project.name }}</p>
        <div class="pm-actions" role="group" aria-label="智能处理">
          <button type="button" :aria-pressed="action === 'priorities'" @click="runAssistant('priorities')">梳理今日优先事项</button>
          <button type="button" :aria-pressed="action === 'risk'" @click="runAssistant('risk')">找出交付风险</button>
          <button type="button" :aria-pressed="action === 'review'" @click="runAssistant('review')">整理复盘材料</button>
        </div>
        <div v-if="assistantResult" class="pm-assistant-result">
          <div role="status"><h3>{{ assistantResult.title }}</h3><p>本次助理 · {{ assistantName }}</p><p>{{ assistantResult.summary }}</p></div>
          <ul v-if="assistantResult.items.length">
            <li v-for="item in assistantResult.items" :key="item.task.id"><button type="button" @click="openTask(item.task)">{{ item.task.title }}</button><small>{{ item.reason }}</small></li>
          </ul>
        </div>
      </aside>
    </div>

    <el-dialog
      v-model="dialogOpen"
      :title="dialog === 'task' ? taskDraft.id ? '编辑任务' : '新建任务' : dialog === 'idea' ? ideaDraft.id ? '编辑想法' : '新建想法' : '新建项目'"
      width="min(500px, calc(100vw - 28px))"
      append-to-body
    >
      <form class="pm-dialog" @submit.prevent="saveDialog">
        <template v-if="dialog === 'project'">
          <label>项目名称<input v-model="projectDraft.name" maxlength="60" /></label>
          <label>交付目标<textarea v-model="projectDraft.goal" rows="3" maxlength="300" /></label>
        </template>
        <template v-else-if="dialog === 'idea'">
          <label>想法标题<input v-model="ideaDraft.title" maxlength="80" /></label>
          <label>状态<select v-model="ideaDraft.status"><option v-for="(label, id) in ideaStatuses" :key="id" :value="id">{{ label }}</option></select></label>
          <label>说明<textarea v-model="ideaDraft.note" rows="3" maxlength="1000" /></label>
        </template>
        <template v-else-if="dialog === 'task'">
          <label>任务标题<input v-model="taskDraft.title" maxlength="80" /></label>
          <div class="pm-dialog-pair">
            <label>负责人<select v-model="taskDraft.ownerId"><option value="">未分配</option><option v-for="user in store.users" :key="user.id" :value="user.id">{{ user.name }}</option></select></label>
            <label>优先级<select v-model="taskDraft.priority"><option v-for="(label, id) in priorityLabels" :key="id" :value="id">{{ label }}</option></select></label>
          </div>
          <div class="pm-dialog-pair">
            <label v-if="!taskDraft.milestone">开始日期<input v-model="taskDraft.start" type="date" /></label>
            <label>{{ taskDraft.milestone ? '里程碑日期' : '截止日期' }}<input v-model="taskDraft.due" type="date" /></label>
          </div>
          <label class="pm-dialog-checkbox"><input v-model="taskDraft.milestone" type="checkbox" />标记为里程碑</label>
          <label>任务状态<select v-model="taskDraft.status"><option v-for="(label, id) in projectStatuses" :key="id" :value="id">{{ label }}</option></select></label>
          <label v-if="taskDraft.status === 'blocked'">阻塞原因<input v-model="taskDraft.blocker" maxlength="160" /></label>
          <label>任务说明<textarea v-model="taskDraft.note" rows="2" maxlength="1000" /></label>
        </template>
        <p v-if="error" class="pm-form-error" role="alert">{{ error }}</p>
        <footer><button class="pm-button" type="button" @click="dialog = undefined">取消</button><button class="pm-button pm-primary" type="submit">保存</button></footer>
      </form>
    </el-dialog>
  </section>
</template>

<style src="./project-workbench.css"></style>
