import { computed, inject, provide, ref, watch, type ComputedRef, type InjectionKey } from 'vue'
import { usePlatformStore, type Workbench } from '@/stores/platform'

function createWorkbenchAssistant(workbench: ComputedRef<Workbench | undefined>) {
  const store = usePlatformStore()
  const override = ref<string>()
  const available = computed(() => store.visibleAssistants.filter(item => item.id !== 'default'))
  const pairedId = computed(() => available.value.find(item => item.scope === 'organization'
    && item.id === workbench.value?.pairedAssistantId)?.id ?? '')
  const selection = computed({
    get: () => override.value ?? pairedId.value,
    set: (id: string) => {
      if (!id || available.value.some(item => item.id === id)) override.value = id
    },
  })
  const assistant = computed(() => available.value.find(item => item.id === selection.value))

  watch([() => workbench.value?.id, () => store.currentUser.id], () => { override.value = undefined }, { flush: 'sync' })
  watch(available, items => {
    if (override.value && !items.some(item => item.id === override.value)) override.value = undefined
  }, { flush: 'sync' })

  return { available, selection, assistant }
}

const assistantKey: InjectionKey<ReturnType<typeof createWorkbenchAssistant>> = Symbol('workbenchAssistant')

export function provideWorkbenchAssistant(workbench: ComputedRef<Workbench | undefined>) {
  const context = createWorkbenchAssistant(workbench)
  provide(assistantKey, context)
  return context
}

export function useWorkbenchAssistant() {
  const context = inject(assistantKey)
  if (!context) throw new Error('Workbench assistant selection requires a workbench')
  return context
}
