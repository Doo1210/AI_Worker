import { usePlatformStore } from '@/stores/platform'
import { useAdminUsageStore } from '@/stores/adminUsage'

export function recordWorkbenchOperation(targetId: string, operation: string) {
  const platform = usePlatformStore()
  if (!platform.visibleWorkbenches.some(item => item.id === targetId)) return
  useAdminUsageStore().record({ userId: platform.currentUser.id, targetId, kind: 'workbench', operation, status: '成功', inputTokens: 0, outputTokens: 0, priced: false, source: '原型操作', note: '已记录工作台中的本地操作；真实执行与模型计量待接入。' })
}
