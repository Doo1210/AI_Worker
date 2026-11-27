import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export interface AdminUsageRecord {
  id: string
  userId: string
  targetId: string
  kind: 'assistant' | 'workbench'
  operation: string
  status: '成功' | '失败' | '处理中'
  at: number
  modelId?: string
  inputTokens: number
  outputTokens: number
  priced: boolean
  source: '预置演示' | '原型操作'
  note?: string
}

export const usageCost = (record: AdminUsageRecord) => record.priced
  ? (record.inputTokens * 2 + record.outputTokens * 3) / 1_000_000 : 0
export const usagePeriods = [{ value: '24h', label: '近 24 小时' }, { value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }] as const
export type UsagePeriod = (typeof usagePeriods)[number]['value']
export function filterUsage(records: AdminUsageRecord[], filters: { period?: string; department?: string; target?: string; model?: string; kind?: string; status?: string }, members: { id: string; departmentId?: string }[], end = Date.now()) {
  const start = end - ({ '24h': 1, '7d': 7, '30d': 30 }[filters.period ?? '7d'] ?? 7) * 86_400_000
  return records.filter(item => item.at >= start && item.at <= end
    && (!filters.department || members.some(member => member.id === item.userId && member.departmentId === filters.department))
    && (!filters.target || item.targetId === filters.target) && (!filters.model || item.modelId === filters.model)
    && (!filters.kind || item.kind === filters.kind) && (!filters.status || item.status === filters.status))
}

const key = 'ai-worker-admin-usage-v1'
export const useAdminUsageStore = defineStore('admin-usage', () => {
  let saved: { initialized?: boolean; records?: AdminUsageRecord[] } = {}
  try { saved = JSON.parse(localStorage.getItem(key) ?? '{}') } catch { /* Browser storage is optional. */ }
  const records = ref<AdminUsageRecord[]>(Array.isArray(saved.records) ? saved.records : [])
  const initialized = ref(saved.initialized === true)
  function seed(members: { id: string; status?: string }[], assistants: { id: string }[], workbenches: { id: string }[], modelId?: string) {
    if (initialized.value) return
    const base = Date.now()
    for (let daysAgo = 0; daysAgo < 30; daysAgo += 1) {
      for (const [index, member] of members.filter(item => item.status !== 'disabled').slice(0, 3).entries()) {
        for (let slot = 0; slot < 4; slot += 1) {
          const kind = slot >= 2 ? 'workbench' : 'assistant'
          const target = kind === 'assistant' ? assistants[(daysAgo + index + slot) % assistants.length] : workbenches[(daysAgo + index + slot) % workbenches.length]
          if (!target) continue
          const opened = kind === 'workbench' && slot === 2
          const failed = daysAgo === 0 && index === 0 && slot === 0
          records.value.push({
            id: `run-${daysAgo}-${member.id}-${slot}`, userId: member.id, targetId: target.id, kind,
            operation: kind === 'assistant' ? '助理请求' : opened ? '打开工作台' : '生成业务检查结果',
            status: failed ? '失败' : '成功', at: base - daysAgo * 86_400_000 - (index * 75 + slot * 18 + 10) * 60_000,
            modelId: opened ? undefined : modelId, inputTokens: opened ? 0 : 1800 + index * 160, outputTokens: opened || failed ? 0 : 650 + slot * 90,
            priced: !opened && (daysAgo + slot + index) % 7 !== 0, source: '预置演示',
            note: failed ? '模型请求超时（演示）。请核对依赖当前状态，再由成员重新发起请求。' : opened ? '工作台访问记录，不计入模型用量。' : '已完成模拟处理。',
          })
        }
      }
    }
    initialized.value = true
  }
  function record(draft: Omit<AdminUsageRecord, 'id' | 'at'>) {
    records.value.unshift({ ...draft, id: `run-${crypto.randomUUID()}`, at: Date.now() })
  }
  watch([records, initialized], () => {
    try { localStorage.setItem(key, JSON.stringify({ initialized: initialized.value, records: records.value })) } catch { /* Keep the current session usable. */ }
  }, { deep: true })
  return { records, seed, record }
})
