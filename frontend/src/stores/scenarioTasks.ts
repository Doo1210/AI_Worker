import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { useEmployeeAutonomousTasks } from './employeeAutonomousTasks'
import { useOrganizationAdminStore } from './organizationAdmin'
import { activeCapabilityVersion, connectionIsReady } from './organizationAdminData'
import { makeId, nowIso, usePlatformStore } from './platform'
import { ET_DESIGN_WORKBENCH_ID } from './sample'
import { etWorkspaceId, useSharedWorkspacesStore } from './sharedWorkspaces'
import { opportunities, TENDER_WORKBENCH_ID } from './tenderSample'

export const etReviewId = etWorkspaceId
export const etReviewTitle = '南区产线 · 电气图纸评审'

export const scenarioDefinitions = {
  'et-review': {
    label: '图纸交付核对', employeeId: 'employee-design', workbenchId: ET_DESIGN_WORKBENCH_ID,
    connectionId: 'connection-business', destination: 'ET-052 图纸评审记录',
  },
  'tender-review': {
    label: '招投标机会筛选与立项', employeeId: 'employee-office', workbenchId: TENDER_WORKBENCH_ID,
    connectionId: 'connection-model-deepseek', destination: '招投标工作台 · 机会记录',
  },
} as const

export type ScenarioId = keyof typeof scenarioDefinitions
export type ScenarioTaskStatus = 'running' | 'review' | 'blocked' | 'returned' | 'completed'
export type ScenarioOrigin = '人员交办' | '业务事件' | '定时规则'
export type ScenarioDecision = 'confirm' | 'return' | 'decline'
export const scenarioAssignmentChannels = ['工作门户', '企业消息（模拟）', '业务系统（模拟）'] as const
type ScenarioAssignmentChannel = typeof scenarioAssignmentChannels[number]

export const scenarioStatusLabels: Record<ScenarioTaskStatus, string> = {
  running: '进行中', review: '待复核', blocked: '执行异常', returned: '已退回', completed: '已完成',
}

export interface ScenarioEvidence {
  label: string
  detail: string
}

export interface ScenarioTaskInput {
  scenarioId: ScenarioId
  objectId: string
  objectTitle: string
  objectVersion: string
  evidence: ScenarioEvidence[]
  triggerKey?: string
}

interface ReviewStep {
  label: string
  userId: string
  decision?: ScenarioDecision
  comment?: string
}

export interface ScenarioAttempt {
  id: string
  version: string
  connectionId: string
  startedAt: string
  endedAt?: string
  status: 'running' | 'succeeded' | 'failed'
  message: string
  operation: '任务执行' | '结果写回'
}

interface ActivityEntry {
  label: string
  detail: string
  at: string
}

export interface ScenarioTask extends ScenarioTaskInput {
  id: string
  title: string
  employeeId: string
  origin: ScenarioOrigin
  channel: string
  trigger?: string
  initiatorId: string
  threadId?: string
  request?: string
  deliverable?: string
  status: ScenarioTaskStatus
  assigneeId: string
  createdAt: string
  updatedAt: string
  reviews: ReviewStep[]
  attempts: ScenarioAttempt[]
  activity: ActivityEntry[]
  result?: string
  writtenAt?: string
  completesAt?: number
}

const storageKey = 'ai-worker-scenario-tasks-v1'
const tenderReviews = [
  { label: '技术条件核实', userId: 'song' },
  { label: '商务条件核实', userId: 'zhou' },
  { label: '立项决策', userId: 'lin' },
] as const

function loadTasks(): ScenarioTask[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export function scenarioProgress(task: ScenarioTask) {
  if (task.status === 'completed') return 100
  if (task.status === 'review') return 65 + 10 * task.reviews.filter(step => step.decision === 'confirm').length
  return task.attempts.at(-1)?.operation === '结果写回' ? 95 : 25
}

export function scenarioNextStep(task: ScenarioTask) {
  switch (task.status) {
    case 'running': return 'AI 员工正在按规则执行'
    case 'review': return task.reviews.find(step => !step.decision)?.label ?? '等待人工复核'
    case 'blocked': return '连接恢复后由接手人重试'
    case 'returned': return '补充意见后重新提交'
    case 'completed': return '结果已写回业务记录'
  }
}

function runMetadata(task: ScenarioTask) {
  return {
    id: task.id, title: scenarioDefinitions[task.scenarioId].label, scenarioId: task.scenarioId,
    employeeId: task.employeeId, origin: task.origin, initiatorId: task.initiatorId, channel: task.channel, objectId: task.objectId,
    objectVersion: task.objectVersion, status: task.status, assigneeId: task.assigneeId,
    createdAt: task.createdAt, updatedAt: task.updatedAt,
    attempts: task.attempts.map(attempt => ({ ...attempt })),
  }
}

export const useScenarioTaskStore = defineStore('scenario-tasks', () => {
  const platform = usePlatformStore()
  const organization = useOrganizationAdminStore()
  const workspaces = useSharedWorkspacesStore()
  const { matchingRules } = useEmployeeAutonomousTasks()
  const tasks = ref(loadTasks())
  let timer: ReturnType<typeof setTimeout> | undefined

  function activeUser(userId: string) {
    return platform.users.some(user => user.id === userId && user.status !== 'disabled')
  }

  function hasScenarioObjectAccess(scenarioId: ScenarioId, userId: string) {
    if (!activeUser(userId)) return false
    if (scenarioId === 'et-review') return workspaces.canAccess(etWorkspaceId, userId)
    const workbench = platform.workbenches.find(item => item.id === scenarioDefinitions[scenarioId].workbenchId)
    return !!workbench && workbench.allowedUserIds.includes(userId)
  }

  function validObject({ scenarioId, objectId, objectVersion }: ScenarioTaskInput) {
    return scenarioId === 'et-review'
      ? objectId === etReviewId && ['V1', 'V2'].includes(objectVersion)
      : opportunities.some(item => item.id === objectId && item.published === objectVersion)
  }

  function isReviewer(task: ScenarioTask, userId: string) {
    return activeUser(userId) && task.reviews.some(step => step.userId === userId)
  }

  function canSee(task: ScenarioTask) {
    const userId = platform.currentUser.id
    if (isReviewer(task, userId)) return true
    return platform.visibleEmployees.some(employee => employee.id === task.employeeId)
      && hasScenarioObjectAccess(task.scenarioId, userId)
      && (task.origin !== '人员交办' || task.initiatorId === userId)
  }

  function canAct(task: ScenarioTask) {
    return task.assigneeId === platform.currentUser.id && canSee(task)
  }

  const visibleTasks = computed(() => tasks.value.filter(canSee))
  const assignedTasks = computed(() => visibleTasks.value.filter(task =>
    task.origin === '人员交办' && task.initiatorId === platform.currentUser.id))
  const pendingTasks = computed(() => visibleTasks.value.filter(task => canAct(task)
    && (task.status === 'review' || task.status === 'blocked' || task.status === 'returned')))
  const adminTasks = computed(() => platform.currentUser.role === 'admin'
    ? tasks.value.map(task => ({ ...runMetadata(task), trigger: task.trigger }))
    : [])
  const monitoredTasks = computed(() => tasks.value
    .filter(task => organization.myEmployeeMaintenance.has(task.employeeId))
    .map(task => ({
      ...runMetadata(task), writtenAt: task.writtenAt,
      trigger: canSee(task) ? task.trigger : undefined,
    })))

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks.value))
    } catch {
      // The current tab can continue the demonstration without browser storage.
    }
  }

  function log(task: ScenarioTask, label: string, detail: string, at = nowIso()) {
    task.activity.push({ label, detail, at })
    task.updatedAt = at
  }

  function officialVersion(employeeId: string) {
    const employee = platform.employees.find(item => item.id === employeeId && item.status === 'published')
    return employee ? activeCapabilityVersion(employee) : undefined
  }

  function isConnectionAvailable(connectionId: string) {
    return connectionIsReady(connectionId, platform.organizationConnections)
  }

  function restoreConnection(connectionId: string) {
    return organization.testConnection(connectionId)
  }

  function finishDue() {
    if (timer !== undefined) clearTimeout(timer)
    const now = Date.now()
    const due = tasks.value.filter(task => task.status === 'running' && (task.completesAt ?? Infinity) <= now)
    for (const task of due) {
      const attempt = task.attempts.at(-1)
      if (!attempt) continue
      task.completesAt = undefined
      if (!isConnectionAvailable(attempt.connectionId)) {
        failAttempt(task, attempt)
        continue
      }
      attempt.status = 'succeeded'
      attempt.endedAt = nowIso()
      attempt.message = '已生成模拟核对结果，等待业务复核。'
      task.status = 'review'
      task.assigneeId = task.reviews[0]?.userId ?? ''
      task.result = task.scenarioId === 'et-review'
        ? task.objectVersion === 'V2'
          ? '图纸 V2 已核对。材料清单仍标注 V1，请核实接线标识和材料清单版本后确认交付。'
          : '图纸和材料清单均标注 V1，请复核接线标识后确认交付。'
        : '已按示例筛选规则形成候选机会。请依次核实施工与交付要求、商务条件，再决定是否立项。'
      log(task, 'AI 员工提交核对结果', scenarioNextStep(task))
    }
    if (due.length) persist()
    const next = tasks.value.reduce((first, task) => Math.min(first, task.completesAt ?? Infinity), Infinity)
    if (Number.isFinite(next)) timer = setTimeout(finishDue, Math.max(0, next - Date.now()))
  }

  function failAttempt(task: ScenarioTask, attempt: ScenarioAttempt) {
    const at = nowIso()
    attempt.status = 'failed'
    attempt.endedAt = at
    attempt.message = '依赖连接未就绪，等待管理员恢复。'
    task.status = 'blocked'
    task.completesAt = undefined
    log(task, `${attempt.operation}异常`, attempt.message, at)
  }

  function beginAttempt(task: ScenarioTask, version: string) {
    const at = nowIso()
    const attempt: ScenarioAttempt = {
      id: makeId('attempt'), version, connectionId: scenarioDefinitions[task.scenarioId].connectionId,
      startedAt: at, status: 'running', operation: '任务执行', message: '正在处理样例资料。',
    }
    task.attempts.push(attempt)
    task.status = 'running'
    task.assigneeId = task.reviews[0]?.userId ?? ''
    task.writtenAt = undefined
    task.result = undefined
    task.reviews = task.reviews.map(({ label, userId }) => ({ label, userId }))
    log(task, '开始执行', `生效版本 ${version}`, at)
    if (isConnectionAvailable(attempt.connectionId)) task.completesAt = Date.now() + 850
    else failAttempt(task, attempt)
    persist()
    finishDue()
  }

  function createTask(
    input: ScenarioTaskInput, origin: ScenarioOrigin, channel: string, reviews: ReviewStep[],
    context: Pick<ScenarioTask, 'trigger' | 'request' | 'deliverable' | 'threadId'> = {},
  ) {
    const userId = platform.currentUser.id
    const definition = scenarioDefinitions[input.scenarioId]
    if (!validObject(input) || !hasScenarioObjectAccess(input.scenarioId, userId)
      || (origin !== '人员交办' && !platform.visibleWorkbenches.some(item => item.id === definition.workbenchId))
      || !reviews.every(step => activeUser(step.userId))) return
    if (origin === '人员交办' && !platform.visibleEmployees.some(item => item.id === definition.employeeId)) return
    const version = officialVersion(definition.employeeId)
    if (!version) return
    const prior = input.triggerKey && tasks.value.find(task => task.scenarioId === input.scenarioId
      && task.objectId === input.objectId && task.origin === origin && task.triggerKey === input.triggerKey)
    if (prior) return canSee(prior) ? prior : undefined

    const at = nowIso()
    const task: ScenarioTask = {
      ...input, ...context, evidence: input.evidence.map(item => ({ ...item })),
      id: makeId('scenario-task'), employeeId: definition.employeeId,
      title: `${input.objectId} ${definition.label}`,
      origin, channel, initiatorId: userId, status: 'running', assigneeId: reviews[0]?.userId ?? '',
      createdAt: at, updatedAt: at, reviews: reviews.map(step => ({ ...step })), attempts: [], activity: [],
    }
    tasks.value.unshift(task)
    const saved = tasks.value[0]!
    log(saved, '任务已受理', context.trigger ?? channel, at)
    beginAttempt(saved, version)
    return saved
  }

  function createEventTask(input: ScenarioTaskInput) {
    if (input.scenarioId !== 'et-review' || !workspaces.canEdit(etWorkspaceId)) return
    const description = `${input.objectTitle} · 图纸 ${input.objectVersion} 发布`
    const rule = matchingRules(scenarioDefinitions[input.scenarioId].employeeId, 'file-updated', description)[0]
    if (!rule) return
    return createTask(input, '业务事件', 'ET 设计工作台', [{ label: '图纸交付复核', userId: rule.ownerId }], {
      trigger: `${rule.name} · 图纸发布（模拟）`,
    })
  }

  function createAssignedTask(input: ScenarioTaskInput, request: string, deliverable: string, channel: ScenarioAssignmentChannel, threadId?: string) {
    if (input.scenarioId !== 'et-review' || !request.trim()) return
    const owner = platform.employees.find(item => item.id === scenarioDefinitions[input.scenarioId].employeeId)?.ownerId
    if (!owner) return
    return createTask(input, '人员交办', channel, [{ label: '图纸交付复核', userId: owner }], {
      request: request.trim(), deliverable: deliverable.trim(), threadId,
    })
  }

  function createScheduledTask(input: ScenarioTaskInput) {
    if (input.scenarioId !== 'tender-review') return
    return createTask(input, '定时规则', '招投标工作台模拟调度', [...tenderReviews], { trigger: '每日机会筛选（模拟）' })
  }

  function getTask(id: string) {
    return visibleTasks.value.find(task => task.id === id)
  }

  function tasksForObject(scenarioId: ScenarioId, objectId: string) {
    if (!hasScenarioObjectAccess(scenarioId, platform.currentUser.id)) return []
    return visibleTasks.value.filter(task => task.scenarioId === scenarioId && task.objectId === objectId)
  }

  function writeBack(task: ScenarioTask) {
    const latest = task.attempts.at(-1)
    const attempt: ScenarioAttempt = {
      id: makeId('attempt'), version: latest?.version ?? '—',
      connectionId: scenarioDefinitions[task.scenarioId].connectionId,
      startedAt: nowIso(), status: 'running', operation: '结果写回', message: '',
    }
    task.attempts.push(attempt)
    if (!isConnectionAvailable(attempt.connectionId)) {
      failAttempt(task, attempt)
      return
    }
    const at = nowIso()
    attempt.status = 'succeeded'
    attempt.endedAt = at
    attempt.message = '模拟写回成功。'
    task.status = 'completed'
    task.assigneeId = ''
    task.writtenAt = at
    log(task, '结果已写回', scenarioDefinitions[task.scenarioId].destination, at)
  }

  function reviewTask(id: string, decision: ScenarioDecision, comment: string) {
    const task = getTask(id)
    if (!task || !canAct(task) || task.status !== 'review') return false
    const step = task.reviews.find(item => !item.decision)
    const note = comment.trim()
    if (!step || step.userId !== platform.currentUser.id || !note) return false
    if (decision === 'decline' && step.label !== '立项决策') return false
    step.decision = decision
    step.comment = note
    const action = decision === 'return' ? '退回补充' : decision === 'decline' ? '不予立项' : step.label === '立项决策' ? '确认立项' : '已确认'
    log(task, `${step.label} · ${action}`, note)
    if (decision === 'return') {
      task.status = 'returned'
      task.assigneeId = activeUser(task.initiatorId) && canSeeAsInitiator(task) ? task.initiatorId : step.userId
      persist()
      return true
    }
    const next = task.reviews.find(item => !item.decision)
    if (next) task.assigneeId = next.userId
    else {
      task.result = task.reviews.map(item => `${item.label}（${item.decision === 'decline' ? '不予立项' : '确认'}）：${item.comment}`).join('\n')
      writeBack(task)
    }
    persist()
    return true
  }

  function canSeeAsInitiator(task: ScenarioTask) {
    return hasScenarioObjectAccess(task.scenarioId, task.initiatorId) && (isReviewer(task, task.initiatorId)
      || (!!officialVersion(task.employeeId) && platform.employees.some(item =>
        item.id === task.employeeId && item.allowedUserIds.includes(task.initiatorId))))
  }

  function retryTask(id: string, note = '') {
    const task = getTask(id)
    if (!task || !canAct(task) || !['blocked', 'returned'].includes(task.status)) return false
    const latest = task.attempts.at(-1)
    if (!latest || !isConnectionAvailable(latest.connectionId)) return false
    if (task.status === 'returned' && !note.trim()) return false
    if (latest.operation === '结果写回') {
      writeBack(task)
      persist()
      return true
    }
    const version = officialVersion(task.employeeId)
    if (!version) return false
    if (note.trim()) {
      task.evidence.push({ label: '人工补充说明', detail: note.trim() })
      log(task, '已补充并重新提交', note.trim())
    }
    beginAttempt(task, version)
    return true
  }

  finishDue()
  onScopeDispose(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  return {
    visibleTasks, assignedTasks, pendingTasks, adminTasks, monitoredTasks, getTask, tasksForObject, canAct,
    createEventTask, createAssignedTask, createScheduledTask, reviewTask, retryTask, restoreConnection, isConnectionAvailable,
  }
})
