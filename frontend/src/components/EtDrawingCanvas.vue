<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { FileBox, FolderOpen, Maximize, Minus, Plus, ScanLine, Upload, X } from 'lucide-vue-next'
import { selectEntities, type Bounds, type DrawingEntity, type Point } from './etDrawing'

const props = defineProps<{
  drawing?: { name: string, entities: DrawingEntity[], bounds: Bounds }
  selection: DrawingEntity[]
  loading: boolean
}>()
const emit = defineEmits<{
  workspace: []
  upload: []
  sample: []
  close: []
  files: [FileList]
  select: [DrawingEntity[]]
}>()

const canvas = ref<HTMLCanvasElement>()
const size = ref({ width: 0, height: 0 })
const zoom = ref(1)
const dragDepth = ref(0)
const box = ref<{ start: Point, end: Point }>()
let pointerId: number | undefined

const projection = computed(() => {
  if (!props.drawing) return
  const { left, right, top, bottom } = props.drawing.bounds
  const { width, height } = size.value
  const drawingWidth = right - left
  const drawingHeight = top - bottom
  const margin = Math.min(60, width * 0.13, height * 0.13)
  const scale = zoom.value * Math.min(
    Math.max(1, width - 2 * margin) / Math.max(drawingWidth, 0.000001),
    Math.max(1, height - 2 * margin) / Math.max(drawingHeight, 0.000001),
  )
  return {
    scale, left, top,
    x: (width - drawingWidth * scale) / 2,
    y: (height - drawingHeight * scale) / 2,
  }
})

const layerColors = new Map([['HOLES', '#8fcef4'], ['CENTER', '#7686a6'], ['DIMENSIONS', '#95a8ce']])

watch(canvas, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(([entry]) => {
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watch(() => props.drawing, () => {
  zoom.value = 1
  box.value = undefined
  pointerId = undefined
})

watchEffect(() => {
  const element = canvas.value
  const view = projection.value
  if (!element || !view || !props.drawing) return
  const context = element.getContext('2d')
  if (!context) return

  const { width, height } = size.value
  if (!width || !height) return
  const resolution = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(width * resolution)
  const pixelHeight = Math.round(height * resolution)
  if (element.width !== pixelWidth) element.width = pixelWidth
  if (element.height !== pixelHeight) element.height = pixelHeight
  context.setTransform(resolution, 0, 0, resolution, 0, 0)
  context.clearRect(0, 0, width, height)
  const selected = new Set(props.selection)
  for (const entity of props.drawing.entities) {
    context.beginPath()
    for (const [index, point] of entity.points.entries()) {
      const x = view.x + (point.x - view.left) * view.scale
      const y = view.y + (view.top - point.y) * view.scale
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    const highlighted = selected.has(entity)
    context.strokeStyle = highlighted ? '#fbd083' : layerColors.get(entity.layer) ?? '#cbd9f4'
    context.lineWidth = highlighted ? 2.5 : 1.45
    context.setLineDash(!highlighted && entity.layer === 'CENTER' ? [5, 4] : [])
    context.stroke()
  }

  if (box.value) {
    const { start, end } = box.value
    context.fillStyle = '#7499ff33'
    context.strokeStyle = '#93b0ff'
    context.lineWidth = 1
    context.setLineDash([4, 3])
    context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y)
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
  }
})

function dragEnter(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) dragDepth.value++
}

function dropFile(event: DragEvent) {
  dragDepth.value = 0
  if (event.dataTransfer?.files.length) emit('files', event.dataTransfer.files)
}

function canvasPoint(event: PointerEvent) {
  const area = canvas.value!.getBoundingClientRect()
  return {
    x: Math.min(area.width, Math.max(0, event.clientX - area.left)),
    y: Math.min(area.height, Math.max(0, event.clientY - area.top)),
  }
}

function startSelection(event: PointerEvent) {
  if (event.button !== 0 || pointerId !== undefined || !canvas.value) return
  pointerId = event.pointerId
  const point = canvasPoint(event)
  box.value = { start: point, end: point }
  canvas.value.setPointerCapture(pointerId)
}

function moveSelection(event: PointerEvent) {
  if (pointerId === event.pointerId && box.value) box.value.end = canvasPoint(event)
}

function finishSelection(event: PointerEvent) {
  const view = projection.value
  if (pointerId !== event.pointerId || !box.value || !props.drawing || !view) return
  const { start } = box.value
  const end = canvasPoint(event)
  const tolerance = Math.hypot(start.x - end.x, start.y - end.y) < 4 ? 5 : 0
  emit('select', selectEntities(props.drawing.entities, {
    left: view.left + (Math.min(start.x, end.x) - tolerance - view.x) / view.scale,
    right: view.left + (Math.max(start.x, end.x) + tolerance - view.x) / view.scale,
    bottom: view.top - (Math.max(start.y, end.y) + tolerance - view.y) / view.scale,
    top: view.top - (Math.min(start.y, end.y) - tolerance - view.y) / view.scale,
  }))
  cancelSelection()
}

function cancelSelection() {
  box.value = undefined
  pointerId = undefined
}
</script>

<template>
  <section
    class="drawing-panel"
    :class="{ 'is-dragging': dragDepth > 0 }"
    aria-label="图纸操作区"
    @dragenter.prevent="dragEnter"
    @dragleave="dragDepth = Math.max(0, dragDepth - 1)"
    @dragover.prevent
    @drop.prevent="dropFile"
  >
    <template v-if="drawing">
      <div class="drawing-toolbar">
        <span class="drawing-name" :title="drawing.name"><FileBox :size="17" aria-hidden="true" />{{ drawing.name }}</span>
        <div class="drawing-actions">
          <button type="button" aria-label="选择工作空间文件" :disabled="loading" @click="emit('workspace')"><FolderOpen :size="16" aria-hidden="true" />工作空间文件</button>
          <button type="button" :disabled="loading" @click="emit('upload')"><Upload :size="16" aria-hidden="true" />上传本地文件</button>
          <button type="button" aria-label="关闭图纸" title="关闭图纸" @click="emit('close')"><X :size="17" /></button>
        </div>
      </div>
      <div class="drawing-preview">
        <canvas
          ref="canvas"
          role="img"
          aria-label="当前图纸预览，拖动鼠标框选实体"
          @pointerdown="startSelection"
          @pointermove="moveSelection"
          @pointerup="finishSelection"
          @pointercancel="cancelSelection"
          @lostpointercapture="cancelSelection"
        />
      </div>
      <div class="drawing-footer">
        <span role="status"><ScanLine :size="16" aria-hidden="true" />{{ selection.length ? `已选中 ${selection.length} 个实体` : '拖动框选实体' }}</span>
        <div class="drawing-actions">
          <button type="button" aria-label="缩小" title="缩小" :disabled="zoom <= 0.5" @click="zoom = Math.max(0.5, zoom - 0.25)"><Minus :size="16" /></button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button type="button" aria-label="放大" title="放大" :disabled="zoom >= 3" @click="zoom = Math.min(3, zoom + 0.25)"><Plus :size="16" /></button>
          <button type="button" aria-label="适应视图" title="适应视图" @click="zoom = 1"><Maximize :size="15" /></button>
        </div>
      </div>
    </template>
    <div v-else class="drawing-empty">
      <span class="drawing-symbol" aria-hidden="true"><FileBox :size="36" :stroke-width="1.45" /></span>
      <h2>打开图纸开始试用</h2>
      <p>支持 ASCII DXF 图纸预览<br />可浏览图纸、框选实体，并使用智能问图</p>
      <div class="open-actions">
        <button type="button" class="open-button" :disabled="loading" @click="emit('workspace')">
          <FolderOpen :size="17" aria-hidden="true" />选择工作空间文件
        </button>
        <button type="button" class="open-button upload-button" :disabled="loading" @click="emit('upload')">
          <Upload :size="17" aria-hidden="true" />上传本地文件
        </button>
      </div>
      <span class="drop-hint" role="status">{{ loading ? '正在打开图纸…' : '也可将本地图纸拖拽到这里' }}</span>
      <button type="button" class="sample-button" @click="emit('sample')">打开示例图纸</button>
    </div>
  </section>
</template>

<style scoped>
.drawing-panel { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 1px solid #323d51; border-radius: 13px; background: #252d3d; color: #eaf0ff; overflow: hidden; container-type: inline-size; }
.drawing-panel.is-dragging { outline: 2px dashed #a5baff; outline-offset: -6px; background: #2d3954; }
.drawing-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 26px 12px; text-align: center; }
.drawing-symbol { display: grid; place-items: center; width: 62px; height: 62px; margin-bottom: 3px; border: 1px solid #485670; border-radius: 14px; background: #303a4f; color: #d9e2f7; }
.drawing-empty h2 { margin: 0; font-size: 22px; font-weight: 650; }
.drawing-empty p { margin: 0; color: #bfc9db; font-size: 13px; line-height: 1.7; }
.open-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 4px; }
.open-button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 7px 12px; border: 1px solid transparent; border-radius: 8px; background: #4a67e0; color: #fff; font-weight: 650; }
.open-button:hover:not(:disabled) { background: #5673eb; }
.open-button.upload-button { border-color: #51617e; background: #303a4f; color: #eaf0ff; }
.open-button.upload-button:hover:not(:disabled) { background: #3b4864; }
.open-button:disabled { opacity: .65; }
.drop-hint { color: #a1aec5; font-size: 12px; }
.sample-button { padding: 3px 7px; border: 0; border-radius: 5px; background: transparent; color: #b5c7ff; font-size: 13px; }
.sample-button:hover { background: #34415b; color: white; }
.drawing-toolbar, .drawing-footer { z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 7px 10px; background: #252d3d; color: #bcc9df; font-size: 12px; }
.drawing-toolbar { border-bottom: 1px solid #374258; }
.drawing-footer { flex-wrap: wrap; border-top: 1px solid #374258; }
.drawing-name { display: flex; align-items: center; gap: 7px; min-width: 0; color: #e4ecff; font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
.drawing-name svg { flex: none; color: #aabdf7; }
.drawing-footer > span, .drawing-actions, .drawing-actions button { display: flex; align-items: center; gap: 5px; }
.drawing-actions { flex: none; }
.drawing-actions button { justify-content: center; min-width: 28px; min-height: 29px; padding: 4px 6px; border: 1px solid #47526a; border-radius: 6px; background: #2d374b; color: #e2eaff; font-size: 12px; white-space: nowrap; }
.drawing-actions button:disabled { opacity: .55; }
.drawing-actions button:hover:not(:disabled) { background: #3b4864; }
.drawing-panel button:focus-visible { outline-color: #b4c7ff; }
.drawing-preview { position: relative; flex: 1; min-height: 225px; background-color: #1f2737; background-image: linear-gradient(#677c9b1b 1px, transparent 1px), linear-gradient(90deg, #677c9b1b 1px, transparent 1px); background-size: 24px 24px; }
.drawing-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
@container (max-width: 480px) {
  .drawing-toolbar, .drawing-toolbar .drawing-actions { flex-wrap: wrap; }
  .drawing-toolbar .drawing-actions { flex: 0 1 auto; }
}
</style>
