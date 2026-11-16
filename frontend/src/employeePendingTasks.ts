import { computed } from 'vue'
import { usePlatformStore } from '@/stores/platform'
import { useScenarioTaskStore } from '@/stores/scenarioTasks'

export function useEmployeePendingTasks() {
  const platform = usePlatformStore()
  const scenario = useScenarioTaskStore()

  const pendingTasks = computed(() => {
    const threads = new Set(platform.employeeThreads.map(thread => thread.id))
    return [
      ...platform.myTasks
        .filter(task => task.status === '待补充' && threads.has(task.threadId))
        .map(({ id, employeeId }) => ({ id, employeeId, kind: 'assigned' as const })),
      ...scenario.pendingTasks
        .map(({ id, employeeId }) => ({ id, employeeId, kind: 'scenario' as const })),
    ]
  })

  return { pendingTasks }
}
