import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { makeId, nowIso, usePlatformStore } from './platform'

const frequencies = ['once', 'daily', 'weekly'] as const

export type AutomationStatus = 'active' | 'paused' | 'ended'
export type AutomationFrequency = typeof frequencies[number]

export interface AutomationDraft {
  name: string
  instruction: string
  frequency: AutomationFrequency
  startAt: string
}

export interface PersonalAutomation extends AutomationDraft {
  id: string
  status: AutomationStatus
  runs: { id: string; ranAt: string }[]
}

interface OwnedAutomation extends PersonalAutomation {
  userId: string
}

const storageKey = 'ai-worker-personal-automations-v1'

function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function sampleTasks(): OwnedAutomation[] {
  const scheduled = (days: number, hour: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    date.setHours(hour, 0, 0, 0)
    return date
  }
  return [
    {
      id: 'automation-daily-summary', userId: 'lin', name: '每日工作摘要',
      instruction: '整理今天的工作进展，列出完成事项、待跟进问题和下一步行动。',
      frequency: 'daily', startAt: localDateTime(scheduled(-3, 18)), status: 'active',
      runs: [{ id: 'run-daily-summary', ranAt: scheduled(-1, 18).toISOString() }],
    },
    {
      id: 'automation-weekly-report', userId: 'lin', name: '整理每周项目进展',
      instruction: '把本周项目资料整理成周报初稿，按进展、风险和下一步分组。',
      frequency: 'weekly', startAt: localDateTime(scheduled(2, 16)), status: 'active', runs: [],
    },
    {
      id: 'automation-materials', userId: 'lin', name: '检查项目资料',
      instruction: '按交付清单汇总缺失和待更新的文件。',
      frequency: 'weekly', startAt: localDateTime(scheduled(3, 10)), status: 'paused', runs: [],
    },
    {
      id: 'automation-review-reminder', userId: 'lin', name: '交付评审准备提醒',
      instruction: '提醒确认评审资料和参会名单。',
      frequency: 'once', startAt: localDateTime(scheduled(-1, 10)), status: 'ended',
      runs: [{ id: 'run-review-reminder', ranAt: scheduled(-1, 10).toISOString() }],
    },
  ]
}

function loadTasks(): OwnedAutomation[] {
  try {
    const saved = localStorage.getItem(storageKey)
    const records: unknown = saved === null ? null : JSON.parse(saved)
    if (Array.isArray(records)) {
      return records.filter(record => record && typeof record.id === 'string' && typeof record.userId === 'string'
        && typeof record.name === 'string' && typeof record.instruction === 'string'
        && frequencies.includes(record.frequency) && ['active', 'paused', 'ended'].includes(record.status)
        && typeof record.startAt === 'string' && Number.isFinite(Date.parse(record.startAt))
        && Array.isArray(record.runs) && record.runs.every((run: unknown) =>
          run !== null && typeof run === 'object' && 'id' in run && typeof run.id === 'string'
          && 'ranAt' in run && typeof run.ranAt === 'string' && Number.isFinite(Date.parse(run.ranAt))))
    }
  } catch {
    // Demo tasks remain available if storage cannot be read.
  }
  return sampleTasks()
}

export const usePersonalAutomationsStore = defineStore('personal-automations', () => {
  const platform = usePlatformStore()
  const records = ref(loadTasks())
  const tasks = computed(() => records.value.filter(task => task.userId === platform.currentUser.id))

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(records.value))
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }

  function findTask(id: string) {
    return tasks.value.find(task => task.id === id)
  }

  function save(draft: AutomationDraft, id?: string): PersonalAutomation | undefined {
    const name = draft.name.trim()
    const instruction = draft.instruction.trim()
    const date = new Date(draft.startAt)
    if (!name || !instruction || !frequencies.includes(draft.frequency)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.startAt)
      || !Number.isFinite(date.getTime()) || localDateTime(date) !== draft.startAt) return

    const values = { name, instruction, frequency: draft.frequency, startAt: draft.startAt }
    if (id !== undefined) {
      const task = findTask(id)
      if (!task || task.status === 'ended') return
      Object.assign(task, values)
      persist()
      return task
    }

    const task: OwnedAutomation = {
      ...values, id: makeId('automation'), userId: platform.currentUser.id, status: 'active', runs: [],
    }
    records.value.unshift(task)
    persist()
    return task
  }

  function setPaused(id: string, paused: boolean) {
    const task = findTask(id)
    const status = paused ? 'paused' : 'active'
    if (!task || task.status === 'ended' || task.status === status) return
    task.status = status
    persist()
  }

  function runNow(id: string) {
    const task = findTask(id)
    if (!task || task.status === 'ended') return
    task.runs.unshift({ id: makeId('automation-run'), ranAt: nowIso() })
    persist()
  }

  function remove(id: string) {
    const task = findTask(id)
    if (!task) return
    records.value = records.value.filter(record => record !== task)
    persist()
  }

  function clearEnded() {
    records.value = records.value.filter(task => task.userId !== platform.currentUser.id || task.status !== 'ended')
    persist()
  }

  return { tasks, save, setPaused, runNow, remove, clearEnded }
})
