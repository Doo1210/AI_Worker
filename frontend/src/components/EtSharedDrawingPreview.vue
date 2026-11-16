<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { Download } from 'lucide-vue-next'
import EtDrawingCanvas from './EtDrawingCanvas.vue'
import { parseDrawing, type DrawingEntity } from './etDrawing'
import { reviewDrawingName, reviewDrawingSource, type EtReviewVersion } from './etReviewDrawing'

const props = defineProps<{
  version: EtReviewVersion
  indices?: number[]
}>()

const canvas = ref<InstanceType<typeof EtDrawingCanvas>>()
const source = computed(() => reviewDrawingSource(props.version))
const drawing = computed(() => ({ ...parseDrawing(source.value), name: reviewDrawingName(props.version) }))
const selection = shallowRef<DrawingEntity[]>([])

watch([drawing, () => props.indices], async ([current, indices]) => {
  selection.value = [...new Set(indices)].flatMap(index => current.entities[index] ?? [])
  if (selection.value.length) {
    await nextTick()
    if (drawing.value === current) canvas.value?.revealSelection()
  }
}, { immediate: true })

function downloadDrawing() {
  const url = URL.createObjectURL(new Blob([source.value], { type: 'application/dxf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = drawing.value.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="shared-drawing">
    <EtDrawingCanvas ref="canvas" class="shared-drawing-canvas" :drawing="drawing" :selection="selection"
      :loading="false" preview-only @select="selection = $event" />
    <div class="shared-drawing-actions">
      <el-button :icon="Download" @click="downloadDrawing">下载 DXF</el-button>
    </div>
  </div>
</template>

<style scoped>
.shared-drawing { display: grid; gap: 12px; min-width: 0; }
.shared-drawing-canvas { min-height: min(50vh, 420px); }
.shared-drawing-actions { display: flex; justify-content: flex-end; }
</style>
