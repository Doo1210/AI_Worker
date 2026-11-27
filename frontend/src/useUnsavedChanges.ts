import { onBeforeUnmount, onMounted, type ComputedRef } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessageBox } from 'element-plus'

export function useUnsavedChanges(dirty: ComputedRef<boolean>) {
  async function confirmDiscard() {
    if (!dirty.value) return true
    try {
      await ElMessageBox.confirm('有尚未保存的修改，离开后将丢失。', '离开当前编辑？', {
        confirmButtonText: '放弃修改并离开', cancelButtonText: '继续编辑', type: 'warning',
      })
      return true
    } catch { return false }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  async function beforeClose(done: () => void) { if (await confirmDiscard()) done() }
  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate((to, from) => JSON.stringify(to.params) === JSON.stringify(from.params) ? true : confirmDiscard())
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
  return { confirmDiscard, beforeClose }
}
