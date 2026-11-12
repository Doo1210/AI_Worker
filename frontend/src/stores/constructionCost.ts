import { ref } from 'vue'
import { makeId } from './platform'

export const ledgerLabels = {
  measure: '收方台账',
  change: '签证变更',
  output: '产值台账',
  contract: '合同台账',
  calculation: '计算记录',
} as const

export type CostLedger = keyof typeof ledgerLabels

export interface CostBuilding {
  id: string
  name: string
  floors: number
  area: number
}

export interface CostEntry {
  id: string
  kind: CostLedger
  title: string
  quantity: number
  unit: string
  unitPrice: number
  date: string
}

export interface CostAttachment {
  id: string
  name: string
  size: number
  data: string
}

export interface CostProject {
  id: string
  name: string
  stage: string
  contractAmount: number
  buildings: CostBuilding[]
  entries: CostEntry[]
  attachments: CostAttachment[]
}

export const projectStages = ['未设置', '投资估算', '设计概算', '招标控制', '施工实施', '竣工结算'] as const

const storageKey = 'ai-worker-construction-cost-v1'
const currencyFormat = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })

export function formatCny(value: number) {
  return Number.isFinite(value) ? currencyFormat.format(value) : '—'
}

export function calculateLineAmount(entry: Pick<CostEntry, 'quantity' | 'unitPrice'>) {
  const amount = entry.quantity * entry.unitPrice
  const absolute = Math.abs(amount)
  const rounded = Math.round((absolute + Number.EPSILON * absolute) * 100) / 100
  return amount < 0 && rounded !== 0 ? -rounded : rounded
}

export function makeProject(name: string): CostProject {
  return { id: makeId('cost-project'), name: name.trim(), stage: projectStages[0], contractAmount: 0, buildings: [], entries: [], attachments: [] }
}

function makeSampleProjects(): CostProject[] {
  const note = '滨河科创中心工程 · 项目资料\n施工范围包括研发楼、配套服务楼及室外工程。\n'
  return [
    {
      id: 'cost-binhai',
      name: '滨河科创中心',
      stage: '施工实施',
      contractAmount: 28680000,
      buildings: [
        { id: 'cost-building-a', name: 'A 栋研发楼', floors: 12, area: 9840 },
        { id: 'cost-building-b', name: 'B 栋配套楼', floors: 5, area: 3600 },
      ],
      entries: [
        { id: 'cost-measure-1', kind: 'measure', title: 'A 栋基础混凝土收方', quantity: 284.5, unit: 'm³', unitPrice: 586, date: '2026-11-08' },
        { id: 'cost-measure-2', kind: 'measure', title: 'B 栋首层砌体收方', quantity: 112.8, unit: 'm³', unitPrice: 365, date: '2026-11-06' },
        { id: 'cost-change-1', kind: 'change', title: '地下室抗渗混凝土增量', quantity: 62.5, unit: 'm³', unitPrice: 682, date: '2026-11-09' },
        { id: 'cost-change-2', kind: 'change', title: '设备基础增设预埋件', quantity: 18, unit: '套', unitPrice: 860, date: '2026-11-07' },
        { id: 'cost-output-1', kind: 'output', title: '10 月土建工程计量产值', quantity: 1, unit: '项', unitPrice: 1824500, date: '2026-11-03' },
        { id: 'cost-contract-1', kind: 'contract', title: '施工总承包合同', quantity: 1, unit: '项', unitPrice: 28680000, date: '2026-09-16' },
        { id: 'cost-calculation-1', kind: 'calculation', title: '首层外墙保温估算', quantity: 325, unit: 'm²', unitPrice: 118.5, date: '2026-11-05' },
      ],
      attachments: [
        { id: 'cost-file-1', name: '滨河科创中心项目说明.txt', size: new TextEncoder().encode(note).length, data: `data:text/plain;charset=utf-8,${encodeURIComponent(note)}` },
      ],
    },
    { ...makeProject('南站配套工程'), id: 'cost-nanzhan' },
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBuilding(value: unknown): value is CostBuilding {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && isNumber(value.floors) && Number.isInteger(value.floors) && value.floors > 0
    && isNumber(value.area) && value.area >= 0
}

function isEntry(value: unknown): value is CostEntry {
  return isRecord(value) && typeof value.id === 'string' && typeof value.kind === 'string'
    && Object.hasOwn(ledgerLabels, value.kind) && typeof value.title === 'string'
    && isNumber(value.quantity) && typeof value.unit === 'string' && isNumber(value.unitPrice)
    && typeof value.date === 'string'
}

function isAttachment(value: unknown): value is CostAttachment {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && isNumber(value.size) && value.size >= 0 && typeof value.data === 'string' && value.data.startsWith('data:')
}

function isProject(value: unknown): value is CostProject {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.stage === 'string' && isNumber(value.contractAmount)
    && Array.isArray(value.buildings) && value.buildings.every(isBuilding)
    && Array.isArray(value.entries) && value.entries.every(isEntry)
    && Array.isArray(value.attachments) && value.attachments.every(isAttachment)
}

function isProjectList(value: unknown): value is CostProject[] {
  return Array.isArray(value) && value.every(isProject)
}

function loadProjects(): CostProject[] {
  try {
    const saved = localStorage.getItem(storageKey)
    const value: unknown = saved === null ? null : JSON.parse(saved)
    if (isProjectList(value)) return value
  } catch {
    // The workbench remains usable when storage is unavailable.
  }
  return makeSampleProjects()
}

export function useConstructionCost() {
  const projects = ref(loadProjects())
  let savedSnapshot = JSON.stringify(projects.value)

  function saveProjects(nextProjects = projects.value) {
    try {
      const snapshot = JSON.stringify(nextProjects)
      const parsed: unknown = JSON.parse(snapshot)
      if (!isProjectList(parsed)) return false
      localStorage.setItem(storageKey, snapshot)
      savedSnapshot = snapshot
      if (nextProjects !== projects.value) projects.value = parsed
      return true
    } catch {
      return false
    }
  }

  function restoreProjects() {
    projects.value = JSON.parse(savedSnapshot) as CostProject[]
  }

  return { projects, saveProjects, restoreProjects }
}
