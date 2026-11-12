import { computed, onScopeDispose, shallowRef } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useOrganizationAdminStore } from './organizationAdmin'
import { makeId, usePlatformStore } from './platform'

export type AutonomousTaskStatus = 'running' | 'review' | 'completed'

export interface EmployeeAutonomousTask {
  id: string
  employeeId: string
  title: string
  status: AutonomousTaskStatus
  progress: number
  summary: string
  trigger: string
  ownerId: string
  viewerIds: readonly string[]
  updatedAt: string
  result?: string
  ruleId?: string
  ruleName?: string
  eventType?: AutonomousEventType
  eventText?: string
}

export const autonomousEventTypeLabels = {
  'file-updated': '文件更新',
  'record-updated': '业务记录更新',
  schedule: '定时触发',
} as const

export type AutonomousEventType = keyof typeof autonomousEventTypeLabels

export interface EmployeeAutonomousRuleDraft {
  name: string
  eventType: AutonomousEventType
  conditionKeyword: string
  ownerId: string
  enabled: boolean
}

export interface EmployeeAutonomousRule extends EmployeeAutonomousRuleDraft {
  id: string
  employeeId: string
}

interface SimulatedAutonomousTask extends EmployeeAutonomousTask {
  ruleId: string
  ruleName: string
  eventType: AutonomousEventType
  eventText: string
  completesAt: number
}

interface AutonomousTaskState {
  rules: EmployeeAutonomousRule[]
  simulations: SimulatedAutonomousTask[]
}

export const autonomousTaskStatusLabels: Record<AutonomousTaskStatus, string> = {
  running: '执行中',
  review: '待复核',
  completed: '已完成',
}

const sampleTasks: readonly EmployeeAutonomousTask[] = [
  {
    id: 'autonomous-design-drawing-check',
    employeeId: 'employee-design',
    title: '南区产线图纸版本核对',
    status: 'running',
    progress: 65,
    summary: '已核对图纸版本与材料清单，正在检查接线标识。',
    trigger: 'ET 设计工作台更新南区产线电气图纸',
    ownerId: 'lin',
    viewerIds: ['lin', 'zhou'],
    updatedAt: '2026-11-11T14:20:00+08:00',
  },
  {
    id: 'autonomous-design-archive-review',
    employeeId: 'employee-design',
    title: '远程监控单元归档检查',
    status: 'review',
    progress: 90,
    summary: '已核对归档材料，等待负责人确认缺失的版本说明。',
    trigger: '交付资料进入归档流程',
    ownerId: 'lin',
    viewerIds: ['lin'],
    updatedAt: '2026-11-11T11:40:00+08:00',
    result: '已找到图纸、材料清单和评审记录。请在归档前补充图纸变更的版本说明。',
  },
  {
    id: 'autonomous-design-change-check',
    employeeId: 'employee-design',
    title: '自动检测站变更核对',
    status: 'completed',
    progress: 100,
    summary: '图纸和材料清单版本一致，核对结果已归档。',
    trigger: '设计变更登记完成',
    ownerId: 'lin',
    viewerIds: ['lin', 'zhou'],
    updatedAt: '2026-11-10T16:30:00+08:00',
    result: '已核对图纸、材料清单和变更记录。三份资料对应同一版本，无待确认事项。',
  },
  {
    id: 'autonomous-service-ticket-review',
    employeeId: 'employee-service',
    title: '高优先级工单资料检查',
    status: 'review',
    progress: 85,
    summary: '已匹配客户服务记录，待负责人核实设备型号。',
    trigger: '客户服务工单调整为高优先级',
    ownerId: 'song',
    viewerIds: ['zhou', 'song'],
    updatedAt: '2026-11-11T13:45:00+08:00',
    result: '工单已关联客户服务记录。设备型号缺失，等待负责人复核后补齐。',
  },
  {
    id: 'autonomous-service-ticket-summary',
    employeeId: 'employee-service',
    title: '售后工单分类汇总',
    status: 'completed',
    progress: 100,
    summary: '已汇总新增工单并整理高频问题。',
    trigger: '本周售后工单统计表更新',
    ownerId: 'song',
    viewerIds: ['lin', 'zhou', 'song'],
    updatedAt: '2026-11-11T10:10:00+08:00',
    result: '已归类 12 条新增工单，其中设备使用问题 5 条、配件问题 4 条、现场支持 3 条。',
  },
  {
    id: 'autonomous-office-meeting-actions',
    employeeId: 'employee-office',
    title: '项目例会待办汇总',
    status: 'running',
    progress: 45,
    summary: '已提取待办事项，正在核对对应负责人。',
    trigger: '项目例会纪要上传',
    ownerId: 'lin',
    viewerIds: ['lin', 'song'],
    updatedAt: '2026-11-11T12:05:00+08:00',
  },
]

const storageKey = 'ai-worker-autonomous-tasks-v1'
const simulatedRunDuration = 1600

function loadState(): AutonomousTaskState {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const state = JSON.parse(saved) as Partial<AutonomousTaskState>
      if (Array.isArray(state.rules) && Array.isArray(state.simulations)) {
        return { rules: state.rules, simulations: state.simulations }
      }
    }
  } catch {
    // Use the demo rules when browser storage is unavailable.
  }
  return {
    rules: [{
      id: 'rule-design-drawing-check',
      employeeId: 'employee-design',
      name: '图纸更新核对',
      eventType: 'file-updated',
      conditionKeyword: '图纸',
      ownerId: 'lin',
      enabled: true,
    }],
    simulations: [],
  }
}

function byRecentUpdate(left: EmployeeAutonomousTask, right: EmployeeAutonomousTask) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

const useAutonomousTaskStore = defineStore('employee-autonomous-tasks', () => {
  const platform = usePlatformStore()
  const organization = useOrganizationAdminStore()
  const state = shallowRef(loadState())
  let completionTimer: ReturnType<typeof setTimeout> | undefined

  function canConfigureEmployee(employeeId: string) {
    return platform.employees.some(employee => employee.id === employeeId)
      && organization.canConfigureCapability(employeeId)
  }

  function hasActiveOwner(ownerId: string) {
    return platform.users.some(user => user.id === ownerId && user.status !== 'disabled')
  }

  function commit(next: AutonomousTaskState) {
    state.value = next
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }

  const visibleTasks = computed(() => {
    const employeeIds = new Set(platform.visibleEmployees.map(employee => employee.id))
    const userId = platform.currentUser.id
    return [...sampleTasks, ...state.value.simulations]
      .filter(task => employeeIds.has(task.employeeId) && task.viewerIds.includes(userId))
      .sort(byRecentUpdate)
  })
  const rules = computed(() => state.value.rules.filter(rule => canConfigureEmployee(rule.employeeId)))
  const simulationTasks = computed(() => state.value.simulations
    .filter(task => canConfigureEmployee(task.employeeId))
    .sort(byRecentUpdate))

  function saveRule(employeeId: string, draft: EmployeeAutonomousRuleDraft, ruleId?: string) {
    if (!canConfigureEmployee(employeeId)) return
    const name = draft.name.trim()
    const conditionKeyword = draft.conditionKeyword.trim()
    if (!name || !Object.hasOwn(autonomousEventTypeLabels, draft.eventType)) return

    const existing = state.value.rules.find(rule => rule.id === ruleId && rule.employeeId === employeeId)
    if (ruleId && !existing) return
    const keepsInactiveOwner = !draft.enabled && existing?.ownerId === draft.ownerId
    if (!hasActiveOwner(draft.ownerId) && !keepsInactiveOwner) return

    const rule: EmployeeAutonomousRule = {
      id: existing?.id ?? makeId('autonomous-rule'),
      employeeId,
      name,
      eventType: draft.eventType,
      conditionKeyword,
      ownerId: draft.ownerId,
      enabled: draft.enabled,
    }
    const nextRules = existing
      ? state.value.rules.map(item => item.id === rule.id ? rule : item)
      : [...state.value.rules, rule]
    commit({ ...state.value, rules: nextRules })
    return rule
  }

  function finishPendingRuns() {
    if (completionTimer !== undefined) clearTimeout(completionTimer)
    completionTimer = undefined
    const now = Date.now()
    const due = state.value.simulations.filter(task => task.status === 'running' && task.completesAt <= now)
    if (due.length) {
      const dueIds = new Set(due.map(task => task.id))
      const simulations = state.value.simulations.map((task): SimulatedAutonomousTask => {
        if (!dueIds.has(task.id)) return task
        return {
          ...task,
          status: 'completed',
          progress: 100,
          summary: '已完成模拟处理。',
          updatedAt: new Date(task.completesAt).toISOString(),
          result: `已按「${task.ruleName}」处理「${autonomousEventTypeLabels[task.eventType]}」测试事件。\n事件内容：${task.eventText}`,
        }
      })
      commit({ ...state.value, simulations })
    }

    const next = state.value.simulations.reduce((earliest, task) => task.status === 'running'
      ? Math.min(earliest, task.completesAt)
      : earliest, Number.POSITIVE_INFINITY)
    if (Number.isFinite(next)) completionTimer = setTimeout(finishPendingRuns, Math.max(0, next - Date.now()))
  }

  function simulateEvent(employeeId: string, eventType: AutonomousEventType, eventText: string): EmployeeAutonomousTask[] {
    if (!canConfigureEmployee(employeeId) || !Object.hasOwn(autonomousEventTypeLabels, eventType)) return []
    const description = eventText.trim()
    if (!description) return []
    const comparable = description.toLowerCase()
    const matched = state.value.rules.filter(rule => rule.employeeId === employeeId
      && rule.enabled && rule.eventType === eventType
      && comparable.includes(rule.conditionKeyword.toLowerCase()) && hasActiveOwner(rule.ownerId))
    if (!matched.length) return []

    const startedAt = Date.now()
    const simulations = matched.map((rule): SimulatedAutonomousTask => ({
      id: makeId('autonomous-run'),
      employeeId,
      title: rule.name,
      status: 'running',
      progress: 20,
      summary: '已匹配工作规则，正在模拟处理事件。',
      trigger: `模拟事件 · ${autonomousEventTypeLabels[eventType]}`,
      ownerId: rule.ownerId,
      viewerIds: [...new Set([platform.currentUser.id, rule.ownerId])],
      updatedAt: new Date(startedAt).toISOString(),
      ruleId: rule.id,
      ruleName: rule.name,
      eventType,
      eventText: description,
      completesAt: startedAt + simulatedRunDuration,
    }))
    commit({ ...state.value, simulations: [...state.value.simulations, ...simulations] })
    finishPendingRuns()
    return simulations
  }

  finishPendingRuns()
  onScopeDispose(() => {
    if (completionTimer !== undefined) clearTimeout(completionTimer)
  })

  return { visibleTasks, rules, simulationTasks, saveRule, simulateEvent }
})

export function useEmployeeAutonomousTasks() {
  const store = useAutonomousTaskStore()
  const { visibleTasks, rules, simulationTasks } = storeToRefs(store)
  return { visibleTasks, rules, simulationTasks, saveRule: store.saveRule, simulateEvent: store.simulateEvent }
}
