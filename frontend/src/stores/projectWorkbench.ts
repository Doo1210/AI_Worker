export const PROJECT_WORKBENCH_ID = 'workbench-project'

export const projectStatuses = {
  todo: '待办', doing: '进行中', blocked: '受阻', done: '已完成',
} as const
export const ideaStatuses = {
  open: '待评估', accepted: '已采纳', parked: '暂缓',
} as const
export type ProjectStatus = keyof typeof projectStatuses
export type IdeaStatus = keyof typeof ideaStatuses
export type Priority = 'high' | 'normal' | 'low'

export interface ProjectTask {
  id: string
  title: string
  ownerId: string
  start: string
  due: string
  status: ProjectStatus
  previousStatus?: Exclude<ProjectStatus, 'done'>
  completedOn?: string
  priority: Priority
  milestone: boolean
  note: string
  blocker: string
  ideaId?: string
}

export interface ProjectIdea {
  id: string
  title: string
  note: string
  status: IdeaStatus
}

export interface ManagedProject {
  id: string
  name: string
  goal: string
  tasks: ProjectTask[]
  ideas: ProjectIdea[]
  reviews: Record<string, string>
}

const dayMs = 86400000
const calendarZone = 'Asia/Shanghai'
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: calendarZone, year: 'numeric', month: '2-digit', day: '2-digit',
})
const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

export function projectToday(now = new Date()) {
  return localDate.format(now)
}

function midnight(date: string) {
  return Date.parse(date + 'T00:00:00Z')
}

export function shiftProjectDay(date: string, amount: number) {
  return new Date(midnight(date) + amount * dayMs).toISOString().slice(0, 10)
}

export function projectDayDistance(start: string, end: string) {
  return Math.round((midnight(end) - midnight(start)) / dayMs)
}

export function projectWeek(date: string) {
  const weekday = new Date(midnight(date)).getUTCDay()
  const start = shiftProjectDay(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => shiftProjectDay(start, index))
}

export function isProjectDate(value: string) {
  const time = midnight(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export function isOverdue(task: ProjectTask, today: string) {
  return task.status !== 'done' && task.due < today
}

export function sortProjectTasks(tasks: ProjectTask[]) {
  return [...tasks].sort((a, b) => rank[a.priority] - rank[b.priority] || a.due.localeCompare(b.due) || a.title.localeCompare(b.title, 'zh-CN'))
}

export function projectTodayGroups(tasks: ProjectTask[], today: string) {
  return {
    active: sortProjectTasks(tasks.filter(task => task.status !== 'done' && task.start <= today && task.due >= today)),
    overdue: sortProjectTasks(tasks.filter(task => isOverdue(task, today))),
    completed: tasks.filter(task => task.status === 'done' && task.completedOn === today),
  }
}

export function projectTimeline(tasks: ProjectTask[], dates: string[]) {
  const start = dates[0]
  const end = dates[dates.length - 1]
  return tasks.filter(task => task.start <= end && task.due >= start)
    .sort((a, b) => a.start.localeCompare(b.start) || rank[a.priority] - rank[b.priority] || a.due.localeCompare(b.due))
    .map(task => ({
      task,
      from: Math.max(0, projectDayDistance(start, task.start)),
      to: Math.min(dates.length - 1, projectDayDistance(start, task.due)),
    }))
}

export function projectStatusChange(task: ProjectTask, status: ProjectStatus, today: string) {
  if (task.status === status) return
  if (status === 'done') {
    if (task.status !== 'done') task.previousStatus = task.status
    task.completedOn = today
  } else {
    task.completedOn = undefined
    task.previousStatus = undefined
  }
  task.status = status
}

export function sampleProjects(today: string): ManagedProject[] {
  const task = (id: string, title: string, ownerId: string, start: number, due: number, extra: Partial<ProjectTask> = {}): ProjectTask => ({
    id, title, ownerId, start: shiftProjectDay(today, start), due: shiftProjectDay(today, due),
    status: 'todo', priority: 'normal', milestone: false, note: '', blocker: '', ...extra,
  })
  return [
    {
      id: 'project-delivery', name: '设备交付试点', goal: '完成试点设备安装准备、联调和客户验收。',
      tasks: [
        task('survey', '确认现场电源与网络点位', 'zhou', -3, -1, { status: 'blocked', priority: 'high', blocker: '现场电气图尚未收到，无法确认点位。' }),
        task('drawings', '复核安装图和物料清单', 'lin', -1, 1, { status: 'doing', priority: 'high', note: '对照最新图纸核对线缆、紧固件和标签。' }),
        task('shipping', '核对发货与到场时间', 'zhou', 0, 0, { note: '确认承运方到场时间及卸货联系人。' }),
        task('handover', '更新验收检查清单', 'lin', 0, 0, { status: 'done', completedOn: today, previousStatus: 'doing' }),
        task('test', '执行设备联调与记录', 'song', 1, 3, { status: 'todo', priority: 'normal' }),
        task('acceptance', '客户现场验收', 'lin', 4, 4, { milestone: true, priority: 'high', note: '交付验收记录和遗留事项清单。' }),
      ],
      ideas: [
        { id: 'qr', title: '在设备标签上加入维护二维码', note: '扫码打开备件信息、设备手册和故障反馈入口。', status: 'open' },
        { id: 'template', title: '把验收步骤整理成通用模板', note: '把本次核对项沉淀成下次可以直接复用的清单。', status: 'accepted' },
      ],
      reviews: {},
    },
    {
      id: 'project-renewal', name: '售后流程优化', goal: '梳理高频售后问题，验证工单处理方式。',
      tasks: [
        task('cases', '归纳高频服务工单', 'zhou', -1, 1, { status: 'doing', priority: 'high' }),
        task('check-in', '确认改版试用范围', 'song', 2, 2, { milestone: true }),
      ],
      ideas: [{ id: 'group', title: '给重复问题增加关联入口', note: '把相同设备和故障现象的工单关联在一起。', status: 'open' }],
      reviews: {},
    },
  ]
}
