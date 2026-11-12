<script setup lang="ts">
import { ref, watch, watchEffect } from 'vue'
import { Maximize, Minus, Plus } from 'lucide-vue-next'
import { loadBlocks, type Dimensions, type LoadingPlan } from './tradeLoading'

const props = defineProps<{ plan: LoadingPlan; shown: number; selected?: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const canvas = ref<HTMLCanvasElement>()
const viewport = ref({ width: 0, height: 0 })
const zoom = ref(1)

watch(canvas, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(([entry]) => {
    viewport.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

function corners([x, y, z]: Dimensions, [l, w, h]: Dimensions): Dimensions[] {
  return [
    [x, y, z], [x + l, y, z], [x + l, y + w, z], [x, y + w, z],
    [x, y, z + h], [x + l, y, z + h], [x + l, y + w, z + h], [x, y + w, z + h],
  ]
}

function shade(color: string, factor: number) {
  const channels = color.slice(1).match(/../g)!.map(channel => {
    const value = parseInt(channel, 16)
    return Math.round(factor < 1 ? value * factor : value + (255 - value) * (factor - 1))
  })
  return `rgb(${channels.join(',')})`
}

watchEffect(() => {
  const element = canvas.value
  const { width, height } = viewport.value
  if (!element || !width || !height) return
  const ctx = element.getContext('2d')
  if (!ctx) return

  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (element.width !== pixelWidth) element.width = pixelWidth
  if (element.height !== pixelHeight) element.height = pixelHeight
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const [l, w] = props.plan.vehicle.size
  const raw = ([x, y, z]: Dimensions) => [(l - x) * .9 + y * .64, -(l - x) * .29 + y * .42 - z * .92]
  const outer = corners([0, 0, 0], props.plan.vehicle.size)
  const projected = outer.map(raw)
  const minX = Math.min(...projected.map(point => point[0]))
  const maxX = Math.max(...projected.map(point => point[0]))
  const minY = Math.min(...projected.map(point => point[1]))
  const maxY = Math.max(...projected.map(point => point[1]))
  const scale = Math.min((width - 30) / (maxX - minX), (height - 35) / (maxY - minY)) * zoom.value
  const project = (point: Dimensions) => {
    const [x, y] = raw(point)
    return { x: width * .5 + (x - (minX + maxX) / 2) * scale, y: height * .54 + (y - (minY + maxY) / 2) * scale }
  }
  function path(points: Dimensions[], close = false) {
    ctx!.beginPath()
    points.forEach((point, index) => {
      const { x, y } = project(point)
      if (index) ctx!.lineTo(x, y)
      else ctx!.moveTo(x, y)
    })
    if (close) ctx!.closePath()
  }
  function line(a: Dimensions, b: Dimensions) {
    path([a, b])
    ctx!.stroke()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = '#ded9cd'
  for (let x = 0; x <= l; x += 50) line([x, 0, 0], [x, w, 0])
  for (let y = 0; y <= w; y += 35) line([0, y, 0], [l, y, 0])

  ctx.strokeStyle = '#a59c8d'
  ctx.setLineDash([4, 4])
  path(outer.slice(4), true)
  ctx.stroke()
  for (let i = 0; i < 4; i++) line(outer[i], outer[i + 4])
  ctx.setLineDash([])
  path(outer.slice(0, 4), true)
  ctx.stroke()

  let remaining = props.shown
  const boxes = props.plan.groups.flatMap(group => {
    const blocks = loadBlocks(group, remaining)
    remaining -= group.count
    return blocks.map(block => ({ ...block, color: group.color, id: group.cargo.id }))
  }).sort((a, b) => a.start[0] - b.start[0] || a.start[2] - b.start[2])
  for (const box of boxes) {
    const vertices = corners(box.start, box.size)
    ctx.globalAlpha = !props.selected || props.selected === box.id ? 1 : .26
    for (const [face, tone] of [
      [[1, 2, 6, 5], .77],
      [[3, 2, 6, 7], .9],
      [[4, 5, 6, 7], 1.28],
    ] as const) {
      path(face.map(index => vertices[index]), true)
      ctx.fillStyle = shade(box.color, tone)
      ctx.fill()
      ctx.strokeStyle = shade(box.color, .68)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
})
</script>

<template>
  <section class="trade-preview" aria-label="装柜图">
    <div class="trade-plot">
      <canvas ref="canvas" role="img" :aria-label="`${plan.vehicle.label} 装柜图，当前显示 ${shown} 箱，共计划装载 ${plan.loaded} 箱`" />
      <div class="trade-preview-status">
        <span>装柜演示</span>
        <strong>{{ shown }} / {{ plan.loaded }} 箱</strong>
        <progress :value="shown" :max="Math.max(1, plan.loaded)" aria-label="演示进度" />
      </div>
      <div class="trade-zoom" role="group" aria-label="装柜图视图">
        <button type="button" aria-label="放大装柜图" title="放大" :disabled="zoom >= 1.75" @click="zoom = Math.min(1.75, zoom + .25)"><Plus :size="16" /></button>
        <button type="button" aria-label="缩小装柜图" title="缩小" :disabled="zoom <= .5" @click="zoom = Math.max(.5, zoom - .25)"><Minus :size="16" /></button>
        <button type="button" aria-label="重置装柜图视图" title="重置视图" @click="zoom = 1"><Maximize :size="14" /></button>
      </div>
    </div>
    <div class="trade-legend" role="group" aria-label="图例与货物筛选">
      <button v-for="group in plan.groups" :key="group.cargo.id" type="button" :aria-pressed="selected === group.cargo.id" @click="emit('select', group.cargo.id)">
        <span :style="{ background: group.color }" aria-hidden="true" />{{ group.cargo.name }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.trade-preview { min-width: 0; border: 1px solid var(--trade-line); background: linear-gradient(#fffdf8, #f9f6ed); }
.trade-plot { position: relative; min-height: 300px; height: clamp(300px, 37vh, 480px); }
.trade-plot canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.trade-preview-status { position: absolute; top: 12px; left: 12px; display: grid; grid-template-columns: auto auto; gap: 6px 12px; padding: 9px 10px; border: 1px solid var(--trade-line); border-left: 3px solid var(--trade-gold); background: #fffdf9ed; color: var(--trade-muted); font-size: 11px; }
.trade-preview-status strong { color: var(--trade-ink); }
.trade-preview-status progress { grid-column: 1 / -1; width: 100%; height: 4px; accent-color: var(--trade-gold); }
.trade-zoom { position: absolute; top: 12px; right: 12px; display: grid; gap: 4px; }
.trade-zoom button { display: grid; width: 29px; height: 29px; place-items: center; padding: 0; border: 1px solid var(--trade-line); background: #fffdf9; color: var(--trade-ink); }
.trade-zoom button:hover:not(:disabled) { background: #f1e6d0; }
.trade-zoom button:disabled { opacity: .45; }
.trade-legend { display: flex; flex-wrap: wrap; gap: 4px 9px; padding: 4px 8px 8px; }
.trade-legend button { display: flex; align-items: center; gap: 5px; padding: 4px 5px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: var(--trade-muted); text-align: left; font-size: 11px; overflow-wrap: anywhere; }
.trade-legend button:hover, .trade-legend button[aria-pressed="true"] { border-color: var(--trade-line); background: #f5ecdc; color: var(--trade-ink); }
.trade-legend button span { flex: none; width: 9px; height: 9px; }
</style>
