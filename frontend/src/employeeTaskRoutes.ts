import type { LocationQuery } from 'vue-router'

export const assignedTasksLabel = '我交办的任务'

export function taskOverviewLocation({ employee, q, source, status, period }: LocationQuery) {
  return { name: 'employee-task-overview', query: { employee, q, source, status, period } }
}
