import type { Conversation } from '@/stores/platform'

function activityTime(chat: Conversation) {
  let latest = Date.parse(chat.createdAt) || 0
  for (const message of chat.messages) {
    if (message.role !== 'user') continue
    const sentAt = Date.parse(message.createdAt)
    if (sentAt > latest) latest = sentAt
  }
  return latest
}

export function orderConversationsByActivity(chats: readonly Conversation[]) {
  return chats.map(chat => ({ chat, time: activityTime(chat) }))
    .sort((a, b) => b.time - a.time || (a.chat.id < b.chat.id ? -1 : a.chat.id > b.chat.id ? 1 : 0))
    .map(({ chat }) => chat)
}

export function withDraftFirst(ids: string[], draftId?: string) {
  return draftId && ids.includes(draftId) ? [draftId, ...ids.filter(id => id !== draftId)] : ids
}

export function reconcileManualOrder(chatsByActivity: readonly Conversation[], saved: readonly string[] = []) {
  const missing = new Map(chatsByActivity.map(chat => [chat.id, chat]))
  const kept = saved.filter(id => missing.delete(id))
  const active: string[] = []
  const archived: string[] = []
  for (const chat of missing.values()) (chat.archived ? archived : active).push(chat.id)
  return [...kept, ...active, ...archived]
}

export type InsertSide = 'before' | 'after'

export function moveConversationInOrder(
  completeOrder: readonly string[], visibleOrder: readonly string[], source: string, target: string, side: InsertSide,
) {
  if (source === target) return
  const from = visibleOrder.indexOf(source)
  const to = visibleOrder.indexOf(target)
  if (from < 0 || to < 0) return
  const insertion = to - (from < to ? 1 : 0) + (side === 'after' ? 1 : 0)
  if (from === insertion || !completeOrder.includes(source)) return

  // Use the same target in the complete order so filtered members keep their relative positions.
  const next = completeOrder.filter(id => id !== source)
  const targetIndex = next.indexOf(target)
  if (targetIndex < 0) return
  next.splice(targetIndex + (side === 'after' ? 1 : 0), 0, source)
  return next
}
