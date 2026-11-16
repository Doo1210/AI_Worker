import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { EtReviewFinding, EtReviewVersion } from '@/components/etReviewDrawing'
import { makeId, nowIso, usePlatformStore } from './platform'
import { etWorkspaceId, useSharedWorkspacesStore } from './sharedWorkspaces'

const storageKey = 'ai-worker-et-drawing-review-v1'

export interface EtReviewDraft {
  version: EtReviewVersion
  scope: string
  assistantName: string
  findings: EtReviewFinding[]
}

interface EtConfirmedReview extends EtReviewDraft {
  id: string
  authorName: string
  confirmedAt: string
}

interface EtDrawingRelease {
  taskId: string
  authorName: string
  publishedAt: string
}

interface EtDrawingReviewState {
  drafts: Record<string, Partial<Record<EtReviewVersion, EtReviewDraft>>>
  confirmed: EtConfirmedReview[]
  release?: EtDrawingRelease
}

function readReviewState(): EtDrawingReviewState | undefined {
  try {
    const data = localStorage.getItem(storageKey)
    if (data) {
      const saved = JSON.parse(data) as EtDrawingReviewState
      if (saved?.drafts && Array.isArray(saved.confirmed)) return saved
    }
  } catch {
    // The review remains available for the current session without browser storage.
  }
}

export const useEtDrawingReviewStore = defineStore('et-drawing-review', () => {
  const platform = usePlatformStore()
  const workspaces = useSharedWorkspacesStore()
  const state = shallowRef<EtDrawingReviewState>(readReviewState() ?? { drafts: {}, confirmed: [] })
  let storageWritable = true
  const hasWorkspaceAccess = computed(() => workspaces.canAccess(etWorkspaceId))
  const canEdit = computed(() => workspaces.canEdit(etWorkspaceId))
  const confirmed = computed(() => hasWorkspaceAccess.value ? state.value.confirmed : [])
  const release = computed(() => hasWorkspaceAccess.value ? state.value.release : undefined)
  const canPublish = computed(() => canEdit.value && !release.value
    && confirmed.value.some(checklist => checklist.version === 'V2'))

  function latest() {
    return (storageWritable ? readReviewState() : undefined) ?? state.value
  }

  function commit(next: EtDrawingReviewState) {
    state.value = next
    if (!storageWritable) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      storageWritable = false
    }
  }

  function draftFor(version: EtReviewVersion) {
    return canEdit.value ? state.value.drafts[platform.currentUser.id]?.[version] : undefined
  }

  function setDraft(draft: EtReviewDraft) {
    if (!canEdit.value) return
    const current = latest()
    const userId = platform.currentUser.id
    commit({ ...current, drafts: { ...current.drafts, [userId]: { ...current.drafts[userId], [draft.version]: draft } } })
  }

  function clearDraft(version: EtReviewVersion) {
    if (!canEdit.value) return
    const current = latest()
    const userId = platform.currentUser.id
    const userDrafts = { ...current.drafts[userId] }
    delete userDrafts[version]
    commit({ ...current, drafts: { ...current.drafts, [userId]: userDrafts } })
  }

  function confirmDraft(version: EtReviewVersion) {
    if (!canEdit.value) return false
    const current = latest()
    const userId = platform.currentUser.id
    const draft = current.drafts[userId]?.[version]
    if (!draft?.findings.length || draft.findings.some(finding => !finding.conclusion.trim())) return false
    const userDrafts = { ...current.drafts[userId] }
    delete userDrafts[version]
    const checklist = {
      ...draft,
      findings: draft.findings.map(finding => ({ ...finding, conclusion: finding.conclusion.trim() })),
      id: makeId('et-checklist'),
      authorName: platform.currentUser.name,
      confirmedAt: nowIso(),
    }
    commit({ ...current, drafts: { ...current.drafts, [userId]: userDrafts }, confirmed: [checklist, ...current.confirmed] })
    return true
  }

  function publish(taskId: string) {
    if (!canPublish.value) return
    const current = latest()
    if (current.release) {
      state.value = current
      return
    }
    commit({ ...current, release: { taskId, authorName: platform.currentUser.name, publishedAt: nowIso() } })
  }

  return { hasWorkspaceAccess, canEdit, confirmed, release, canPublish, draftFor, setDraft, clearDraft, confirmDraft, publish }
})
