<script setup lang="ts">
import { ElTooltip } from 'element-plus'
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{ label: string; compact: boolean }>()
const route = useRoute()
const panelId = useId()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const open = ref(false)
let pinned = false
let closeTimer: ReturnType<typeof setTimeout> | undefined

function show() {
  clearTimeout(closeTimer)
  open.value = true
}

function close() {
  clearTimeout(closeTimer)
  pinned = false
  open.value = false
}

function scheduleClose() {
  clearTimeout(closeTimer)
  if (!pinned) closeTimer = setTimeout(close, 180)
}

function toggle(event: MouseEvent) {
  if (pinned) {
    close()
    return
  }
  pinned = true
  show()
  if (event.detail === 0) {
    void nextTick(() => (panel.value?.querySelector('a') ?? panel.value)?.focus())
  }
}

function onOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (open.value && target instanceof Node && !trigger.value?.contains(target) && !panel.value?.contains(target)) close()
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return
  if (panel.value?.contains(document.activeElement)) trigger.value?.focus()
  close()
}

watch([() => props.compact, () => route.fullPath], close)
onMounted(() => {
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('keydown', onEscape)
})
onUnmounted(() => {
  clearTimeout(closeTimer)
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  document.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div :class="compact ? 'compact-recent-section' : 'history-section'">
    <ElTooltip
      v-if="compact"
      :visible="open"
      :offset="10"
      :show-arrow="false"
      :aria-label="label"
      effect="light"
      placement="right-start"
      popper-class="sidebar-recent-popover"
      role="dialog"
    >
      <button
        ref="trigger"
        type="button"
        class="side-link compact-recent-trigger"
        :class="{ active: open }"
        :aria-label="label"
        :aria-expanded="open"
        :aria-controls="panelId"
        aria-haspopup="dialog"
        @mouseenter="show"
        @mouseleave="scheduleClose"
        @click="toggle"
      >
        <slot name="icon" />
      </button>
      <template #content>
        <div :id="panelId" ref="panel" class="sidebar-recent-panel" tabindex="-1" @mouseenter="show" @mouseleave="scheduleClose">
          <div class="sidebar-label">{{ label }}</div>
          <div class="sidebar-recent-scroll">
            <slot :close="close" />
          </div>
        </div>
      </template>
    </ElTooltip>
    <template v-else>
      <div class="sidebar-label">{{ label }}</div>
      <slot :close="close" />
    </template>
  </div>
</template>
