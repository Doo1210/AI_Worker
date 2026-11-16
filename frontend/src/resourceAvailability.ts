import type { Resource } from '@/stores/platform'

export function resourceUnavailableReason(resource?: Resource) {
  if (!resource) return '当前账号已无权访问此资源。'
  if (resource.status === '停用') return '资源已停用，请更换为其他可用资源。'
  if (resource.status === '未连接') {
    return resource.scope === 'organization'
      ? '资源需要可用的组织连接，请联系管理员检查接入。'
      : '资源接入尚未就绪，请检查个人资源设置。'
  }
  return ''
}
