import type { LocationQuery } from 'vue-router'

export const assignedTasksLabel = '我交办的任务'

export function taskOverviewLocation({ employee, q, source, status, period, scope }: LocationQuery) {
  return { name: 'employee-task-overview', query: { employee, q, source, status, period, scope: scope === 'action' ? scope : undefined } }
}

export function employeeRunsLocation({ run, employee, origin, status, period, q, view }: LocationQuery) {
  return {
    name: 'employee-management', params: { id: '' },
    query: { scope: 'runs', run, employee, origin, status, period, q, view },
  }
}
