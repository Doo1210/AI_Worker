import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useAdminListQuery() {
  const route = useRoute()
  const router = useRouter()
  function field(key: string, fallback = '') {
    return computed({
      get: () => typeof route.query[key] === 'string' ? String(route.query[key]) : fallback,
      set: (value: string) => {
        void router.replace({ query: { ...route.query, [key]: value && value !== fallback ? value : undefined, page: undefined } })
      },
    })
  }
  return { field }
}
