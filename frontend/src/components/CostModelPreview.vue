<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Box, Maximize, Minus, Plus, Settings2 } from 'lucide-vue-next'

interface Building {
  id: string
  name: string
  floors: number
  area: number
}

interface Point {
  x: number
  y: number
}

const props = defineProps<{ buildings: Building[] }>()
const emit = defineEmits<{ configure: [] }>()
const canvas = ref<HTMLCanvasElement>()
const selectedId = ref('')
const zoom = ref(1)
const selectedBuilding = computed(() => props.buildings.find(building => building.id === selectedId.value) ?? props.buildings[0])
const areaFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
let hitTargets: { id: string; path: Path2D }[] = []

function project(x: number, y: number, z = 0): Point {
  return { x: (x - y) * Math.sqrt(3) / 2, y: (x + y) / 2 - z }
}

function drawModel() {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context || !props.buildings.length) return
  const { width, height } = element.getBoundingClientRect()
  if (width < 1 || height < 1) return
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  element.width = Math.round(width * pixelRatio)
  element.height = Math.round(height * pixelRatio)
  context.setTransform(element.width / width, 0, 0, element.height / height, 0, 0)
  hitTargets = []

  const buildings = props.buildings.map((building, index) => {
    const floors = Math.max(1, building.floors)
    const footprint = Math.min(113, Math.max(48, Math.sqrt(building.area / floors) * 2.7))
    return { ...building, floors, footprint, depth: footprint * 0.78, height: floors * 8, index }
  })
  const columns = Math.ceil(Math.sqrt(buildings.length))
  const rows = Math.ceil(buildings.length / columns)
  const spacing = Math.max(...buildings.map(building => building.footprint)) + 34
  const plotWidth = columns * spacing
  const plotDepth = rows * spacing
  const blocks = buildings.map(building => ({
    ...building,
    x: (building.index % columns) * spacing + (spacing - building.footprint) / 2,
    y: Math.floor(building.index / columns) * spacing + (spacing - building.depth) / 2,
  })).sort((first, second) => first.x + first.y - second.x - second.y)

  const left = project(0, plotDepth).x
  const right = project(plotWidth, 0).x
  const top = Math.min(0, ...blocks.map(block => project(block.x, block.y, block.height).y))
  const bottom = project(plotWidth, plotDepth).y + 12
  const fit = Math.min((width - Math.min(64, width * 0.15)) / (right - left), height * 0.67 / (bottom - top), 2.8)
  const scale = fit * zoom.value
  const center = { x: width / 2 - (left + right) * scale / 2, y: height * 0.48 - (top + bottom) * scale / 2 }

  function at(x: number, y: number, z = 0): Point {
    const point = project(x, y, z)
    return { x: center.x + point.x * scale, y: center.y + point.y * scale }
  }

  function trace(path: Path2D, points: Point[], close = true) {
    points.forEach((point, index) => {
      if (index === 0) path.moveTo(point.x, point.y)
      else path.lineTo(point.x, point.y)
    })
    if (close) path.closePath()
  }

  function paint(points: Point[], fill: string, stroke: string) {
    const path = new Path2D()
    trace(path, points)
    context!.fillStyle = fill
    context!.strokeStyle = stroke
    context!.fill(path)
    context!.stroke(path)
  }

  context.lineWidth = 1
  paint([at(plotWidth, 0), at(plotWidth, plotDepth), at(plotWidth, plotDepth, -9), at(plotWidth, 0, -9)], '#d7dfe5', '#c9d4dd')
  paint([at(0, plotDepth), at(plotWidth, plotDepth), at(plotWidth, plotDepth, -9), at(0, plotDepth, -9)], '#e2e8ed', '#c9d4dd')
  paint([at(0, 0), at(plotWidth, 0), at(plotWidth, plotDepth), at(0, plotDepth)], '#f0f3f5', '#c9d4dd')

  const grid = new Path2D()
  const gridStep = Math.max(16, Math.round(Math.max(plotWidth, plotDepth) / 28))
  for (let x = gridStep; x < plotWidth; x += gridStep) trace(grid, [at(x, 0), at(x, plotDepth)], false)
  for (let y = gridStep; y < plotDepth; y += gridStep) trace(grid, [at(0, y), at(plotWidth, y)], false)
  context.strokeStyle = '#dfe7ed'
  context.stroke(grid)

  for (const block of blocks) {
    const { x, y, footprint, depth, floors, height: blockHeight } = block
    const farX = x + footprint
    const farY = y + depth
    const selected = block.id === selectedBuilding.value?.id
    const outline = selected ? '#4b739e' : '#8e9eae'
    const side = [at(farX, y), at(farX, farY), at(farX, farY, blockHeight), at(farX, y, blockHeight)]
    const front = [at(x, farY), at(farX, farY), at(farX, farY, blockHeight), at(x, farY, blockHeight)]
    const roof = [at(x, y, blockHeight), at(farX, y, blockHeight), at(farX, farY, blockHeight), at(x, farY, blockHeight)]
    paint(side, selected ? '#8aaac7' : '#a8b7c4', outline)
    paint(front, selected ? '#acc7dc' : '#c7d2dc', outline)
    paint(roof, selected ? '#dcebf5' : '#e4ebf1', outline)

    const floorLines = new Path2D()
    const floorStep = Math.max(1, Math.ceil(2.3 / (8 * scale)))
    for (let floor = floorStep; floor < floors; floor += floorStep) {
      const z = floor * 8
      trace(floorLines, [at(x, farY, z), at(farX, farY, z), at(farX, y, z)], false)
    }
    context.strokeStyle = selected ? '#7396b5' : '#97a9b7'
    context.stroke(floorLines)

    const path = new Path2D()
    for (const face of [side, front, roof]) trace(path, face)
    hitTargets.push({ id: block.id, path })
  }
}

function selectAtPoint(event: MouseEvent) {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return
  const bounds = element.getBoundingClientRect()
  const x = (event.clientX - bounds.left) * element.width / bounds.width
  const y = (event.clientY - bounds.top) * element.height / bounds.height
  for (let index = hitTargets.length - 1; index >= 0; index -= 1) {
    const target = hitTargets[index]!
    if (context.isPointInPath(target.path, x, y)) {
      selectedId.value = target.id
      return
    }
  }
}

function changeZoom(delta: number) {
  zoom.value = Math.min(1.7, Math.max(0.7, Math.round((zoom.value + delta) * 100) / 100))
}

watch(canvas, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(drawModel)
  observer.observe(element)
  drawModel()
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
watch([() => props.buildings, selectedBuilding, zoom], drawModel, { deep: true, flush: 'post' })
</script>

<template>
  <div class="cost-model-preview">
    <template v-if="selectedBuilding">
      <canvas ref="canvas" class="model-canvas" aria-hidden="true" @click="selectAtPoint" />
      <div class="model-toolbar">
        <span class="model-label"><Box :size="16" aria-hidden="true" /> 楼栋体量示意</span>
        <div class="model-controls" role="group" aria-label="模型视图">
          <button type="button" aria-label="缩小模型" title="缩小模型" :disabled="zoom <= 0.7" @click="changeZoom(-0.1)">
            <Minus :size="16" aria-hidden="true" />
          </button>
          <button type="button" aria-label="放大模型" title="放大模型" :disabled="zoom >= 1.7" @click="changeZoom(0.1)">
            <Plus :size="16" aria-hidden="true" />
          </button>
          <button type="button" aria-label="重置模型视图" title="重置模型视图" @click="zoom = 1">
            <Maximize :size="14" aria-hidden="true" />
          </button>
          <button type="button" aria-label="配置模型" title="配置模型" @click="emit('configure')">
            <Settings2 :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="model-info">
        <select aria-label="选择楼栋" :value="selectedBuilding.id" @change="selectedId = ($event.target as HTMLSelectElement).value">
          <option v-for="building in buildings" :key="building.id" :value="building.id">{{ building.name }}</option>
        </select>
        <span aria-live="polite">{{ selectedBuilding.floors }} 层 · {{ areaFormat.format(selectedBuilding.area) }} m²</span>
      </div>
    </template>
    <div v-else class="model-empty">
      <Box :size="32" :stroke-width="1.65" aria-hidden="true" />
      <strong>项目模型尚未就绪</strong>
      <p>添加楼栋、层数和建筑面积后，即可预览体量模型。</p>
      <el-button @click="emit('configure')">配置模型</el-button>
    </div>
  </div>
</template>

<style scoped>
.cost-model-preview {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 200px;
  place-items: center;
  overflow: hidden;
  container-type: inline-size;
  border: 1px solid #e8ecef;
  border-radius: 10px;
  background: #f3f5f6;
  color: #455360;
}
.model-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(transparent 95%, #e8ecef 95%) center / 25px 25px,
    linear-gradient(90deg, transparent 95%, #e8ecef 95%) center / 25px 25px,
    radial-gradient(ellipse at center, #f8fafb, #f2f4f6 75%);
}
.model-toolbar {
  position: absolute;
  inset: 12px 12px auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  pointer-events: none;
}
.model-label { display: inline-flex; align-items: center; gap: 6px; color: #596975; font-size: 12px; font-weight: 650; }
.model-controls, .model-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  border: 1px solid #dbe3e9;
  border-radius: 7px;
  background: #fff;
}
.model-controls { margin-left: auto; padding: 2px; pointer-events: auto; }
.model-controls button { display: grid; width: 30px; height: 29px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: #576979; }
.model-controls button:hover:enabled { background: #e9eef3; color: #305473; }
.model-controls button:disabled { opacity: 0.4; }
.model-controls button:last-child { border-left: 1px solid #e5eaee; }
.model-info { position: absolute; inset: auto auto 12px 12px; max-width: calc(100% - 24px); gap: 4px 10px; padding: 5px 8px; font-size: 12px; }
.model-info select { max-width: min(170px, 100%); border: 0; background: transparent; color: #344958; font: inherit; font-weight: 650; text-overflow: ellipsis; }
.model-info span { font-variant-numeric: tabular-nums; }
.model-empty { display: grid; justify-items: center; gap: 11px; max-width: 32rem; padding: 16px; text-align: center; }
.model-empty svg { margin-bottom: 5px; color: #758795; }
.model-empty strong { font-size: 16px; }
.model-empty p { margin: 0; color: #687782; font-size: 13px; }
.model-empty .el-button { margin-top: 2px; }
@container (max-width: 255px) {
  .model-toolbar { inset: 8px 8px auto; }
  .model-controls { margin-left: 0; }
  .model-info { inset: auto auto 8px 8px; }
}
</style>
