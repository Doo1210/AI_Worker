<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ArrowDownToLine, ArrowRight, CircleCheck, FileText, Package, Pause, Play, Plus, Printer, RotateCcw, Ship, Sparkles, X } from 'lucide-vue-next'
import { makeId, usePlatformStore } from '@/stores/platform'
import { useWorkbenchAssistant } from '@/workbenchAssistant'
import TradeLoadPreview from './TradeLoadPreview.vue'
import WorkbenchAssistantSelect from './WorkbenchAssistantSelect.vue'
import {
  cargoError, cartonVolume, cartonWeight, exampleCargo, loadSteps, planLoading, vehicles, vehicleVolume,
  type Cargo, type VehicleKind,
} from './tradeLoading'

interface PackingList {
  reference: string
  shipper: string
  consignee: string
  vehicle: string
  lines: Cargo[]
}

interface TradeDraft {
  vehicleId: string
  cargo: Cargo[]
  packingList?: PackingList
}

const store = usePlatformStore()
const assistantFallback = '装柜助手'
const { assistant } = useWorkbenchAssistant()
const storageKey = `ai-worker-trade-draft:${store.currentUser.id}`
const draft = ref<TradeDraft>(readDraft())
const tab = ref<'loading' | 'documents'>('loading')
const vehicle = computed(() => vehicles.find(item => item.id === draft.value.vehicleId) ?? vehicles[2])
const inputKey = computed(() => JSON.stringify([vehicle.value.id, draft.value.cargo]))
const plan = shallowRef(planLoading(vehicle.value, cargoError(draft.value.cargo) ? [] : draft.value.cargo))
const planKey = ref(cargoError(draft.value.cargo) ? '' : inputKey.value)
const dirty = computed(() => planKey.value !== inputKey.value)
const shown = ref(plan.value.loaded)
const playing = ref(false)
const selected = ref('')
const error = ref('')
const assistantRun = ref<{ mode: 'review' | 'compare'; author: string }>()
let timer: number | undefined

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const decimalFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numericFields = [
  { id: 'length', label: '长', unit: 'cm', step: '.1' },
  { id: 'width', label: '宽', unit: 'cm', step: '.1' },
  { id: 'height', label: '高', unit: 'cm', step: '.1' },
  { id: 'cartons', label: '箱数', unit: '箱', step: '1' },
  { id: 'net', label: '净重／箱', unit: 'kg', step: '.01' },
  { id: 'tare', label: '皮重／箱', unit: 'kg', step: '.01' },
  { id: 'pieces', label: '每箱件数', unit: 'pcs', step: '1' },
] as const

const stats = computed(() => {
  const data = plan.value
  return [
    { label: '货物体积', value: decimalFormat.format(data.totalVolume), unit: 'CBM' },
    { label: '货物总毛重', value: decimalFormat.format(data.totalWeight), unit: 'kg' },
    { label: '空间利用率', value: decimalFormat.format(100 * data.loadedVolume / vehicleVolume(data.vehicle)), unit: '%' },
    { label: '装载箱数', value: `${numberFormat.format(data.loaded)} / ${numberFormat.format(data.total)}`, unit: '箱' },
    { label: '重量饱和度', value: decimalFormat.format(100 * data.loadedWeight / data.vehicle.payload), unit: '%' },
    { label: '剩余载重', value: numberFormat.format(Math.max(0, data.vehicle.payload - data.loadedWeight)), unit: 'kg' },
    { label: '占用柜长', value: decimalFormat.format(data.occupied / 100), unit: 'm' },
    { label: '未装载', value: numberFormat.format(data.total - data.loaded), unit: '箱' },
  ]
})
const steps = computed(() => loadSteps(plan.value, 80, selected.value))
const focusGroup = computed(() => plan.value.groups.find(group => group.cargo.id === selected.value))
const comparison = computed(() => {
  if (assistantRun.value?.mode !== 'compare' || dirty.value) return []
  return vehicles.filter(item => item.kind === plan.value.vehicle.kind)
    .map(item => planLoading(item, draft.value.cargo))
    .sort((a, b) => b.loaded - a.loaded || vehicleVolume(a.vehicle) - vehicleVolume(b.vehicle))
})
const suggested = computed(() => comparison.value[0])
const review = computed(() => {
  const groups = focusGroup.value ? [focusGroup.value] : plan.value.groups
  return groups.map(group => {
    const remainder = group.cargo.cartons - group.count
    const detail = group.reason === 'dimensions' ? '当前允许的箱规方向超出内尺寸。'
      : group.reason === 'capacity' ? '当前分区剩余空间或可用载重不足。' : '全部排入方案。'
    return { id: group.cargo.id, name: group.cargo.name, text: `装入 ${group.count} 箱，剩余 ${remainder} 箱。${detail}` }
  })
})
const documentTotals = computed(() => (draft.value.packingList?.lines ?? []).reduce((total, item) => ({
  cartons: total.cartons + item.cartons,
  pieces: total.pieces + item.cartons * item.pieces,
  gross: total.gross + item.cartons * cartonWeight(item),
  net: total.net + item.cartons * item.net,
  volume: total.volume + item.cartons * cartonVolume(item),
}), { cartons: 0, pieces: 0, gross: 0, net: 0, volume: 0 }))

watch(draft, value => {
  try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* The open draft stays available. */ }
}, { deep: true })
watch(inputKey, () => { error.value = '' })
onBeforeUnmount(stopPlayback)

function readDraft(): TradeDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as TradeDraft | null
    if (saved && Array.isArray(saved.cargo) && saved.cargo.every(item => item && typeof item.name === 'string')) {
      return { ...saved, packingList: Array.isArray(saved.packingList?.lines) ? saved.packingList : undefined }
    }
  } catch { /* Use the example when local storage is unavailable. */ }
  return { vehicleId: '40hq', cargo: exampleCargo() }
}

function stopPlayback() {
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
  playing.value = false
}

function playback() {
  if (playing.value) {
    stopPlayback()
    return
  }
  if (!plan.value.loaded) return
  if (shown.value >= plan.value.loaded) shown.value = 0
  playing.value = true
  timer = window.setInterval(() => {
    shown.value = Math.min(plan.value.loaded, shown.value + Math.max(1, Math.ceil(plan.value.loaded / 46)))
    if (shown.value >= plan.value.loaded) stopPlayback()
  }, 45)
}

function calculate(animate = true) {
  error.value = cargoError(draft.value.cargo)
  if (error.value) return
  if (dirty.value) assistantRun.value = undefined
  stopPlayback()
  plan.value = planLoading(vehicle.value, draft.value.cargo)
  planKey.value = inputKey.value
  shown.value = plan.value.loaded
  if (selected.value && !plan.value.groups.some(item => item.cargo.id === selected.value)) selected.value = ''
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) playback()
}

function runAssistant(mode: 'review' | 'compare') {
  if (dirty.value) return
  assistantRun.value = { mode, author: assistant.value?.name ?? assistantFallback }
}

function selectKind(kind: VehicleKind) {
  if (vehicle.value.kind !== kind) draft.value.vehicleId = vehicles.find(item => item.kind === kind)!.id
}

function resetExample() {
  draft.value.vehicleId = '40hq'
  draft.value.cargo = exampleCargo()
  selected.value = ''
  assistantRun.value = undefined
  calculate()
}

function addCargo() {
  draft.value.cargo.push({
    id: makeId('cargo'), name: '', length: 40, width: 30, height: 30,
    cartons: 1, net: 5, tare: .5, pieces: 1, upright: true,
  })
}

function applyVehicle(id: string) {
  draft.value.vehicleId = id
  calculate()
}

function generateDocument() {
  if (dirty.value || !plan.value.loaded) return
  const existing = draft.value.packingList
  draft.value.packingList = {
    reference: existing?.reference ?? 'PL-20261111-01',
    shipper: existing?.shipper ?? 'Demonstration Export Co.',
    consignee: existing?.consignee ?? 'Sample Trading Ltd.',
    vehicle: plan.value.vehicle.label,
    lines: plan.value.groups.filter(group => group.count > 0).map(group => ({ ...group.cargo, cartons: group.count })),
  }
  stopPlayback()
  shown.value = plan.value.loaded
  tab.value = 'documents'
}

function useDocumentCargo() {
  const packingList = draft.value.packingList
  if (!packingList?.lines.length) return
  draft.value.cargo = packingList.lines.map(item => ({ ...item }))
  selected.value = ''
  tab.value = 'loading'
  calculate()
}

function exportPackingList() {
  const packingList = draft.value.packingList
  if (!packingList) return
  const cell = (value: string | number) => {
    const text = String(value)
    const escaped = typeof value === 'string' && /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text
    return '"' + escaped.replaceAll('"', '""') + '"'
  }
  const rows = [
    ['Packing List', packingList.reference], ['Shipper', packingList.shipper], ['Consignee', packingList.consignee], ['Vehicle', packingList.vehicle],
    ['Description', 'Cartons', 'Pieces', 'Dimensions (cm)', 'Net (kg)', 'Gross (kg)', 'Volume (CBM)'],
    ...packingList.lines.map(item => [
      item.name, item.cartons, item.pieces * item.cartons, `${item.length} × ${item.width} × ${item.height}`,
      (item.net * item.cartons).toFixed(2), (cartonWeight(item) * item.cartons).toFixed(2), (cartonVolume(item) * item.cartons).toFixed(3),
    ]),
    ['Total', documentTotals.value.cartons, documentTotals.value.pieces, '', documentTotals.value.net.toFixed(2), documentTotals.value.gross.toFixed(2), documentTotals.value.volume.toFixed(3)],
  ]
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = (packingList.reference.trim() || 'packing-list') + '.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function printPackingList() {
  window.print()
}
</script>

<template>
  <section class="trade-workbench" aria-label="外贸工作台">
    <header class="trade-top">
      <div class="trade-brand">
        <span><Ship :size="21" aria-hidden="true" /></span>
        <h1>外贸工作台</h1>
      </div>
      <nav class="trade-nav" aria-label="外贸业务区">
        <button type="button" :aria-pressed="tab === 'loading'" @click="tab = 'loading'">装柜计算</button>
        <button type="button" :aria-pressed="tab === 'documents'" @click="tab = 'documents'">外贸单证</button>
      </nav>
    </header>

    <template v-if="tab === 'loading'">
      <div class="trade-toolbar">
        <div class="trade-toolbar-title">
          <h2>装柜计算</h2>
          <div class="trade-segment" role="group" aria-label="载具类型">
            <button type="button" :aria-pressed="vehicle.kind === 'container'" @click="selectKind('container')">集装箱</button>
            <button type="button" :aria-pressed="vehicle.kind === 'truck'" @click="selectKind('truck')">厢式货车</button>
          </div>
        </div>
        <div class="trade-buttons">
          <button class="trade-button" type="button" :disabled="!plan.loaded" @click="playback">
            <Pause v-if="playing" :size="15" aria-hidden="true" /><Play v-else-if="shown < plan.loaded" :size="15" aria-hidden="true" /><RotateCcw v-else :size="15" aria-hidden="true" />
            {{ playing ? '暂停' : shown < plan.loaded ? '继续' : '重播' }}
          </button>
          <button class="trade-button" type="button" :disabled="!draft.packingList?.lines.length" @click="useDocumentCargo">从单证取货</button>
          <button class="trade-button" type="button" @click="resetExample">载入示例</button>
          <button class="trade-button trade-primary" type="button" :disabled="dirty || !plan.loaded" @click="generateDocument">生成单据 <ArrowRight :size="16" aria-hidden="true" /></button>
        </div>
      </div>
      <div class="trade-layout">
        <aside class="trade-manifest" aria-label="柜型与货物">
          <section class="trade-vehicle-panel">
            <div class="trade-section-heading"><h3>柜型 / 车型</h3><small>内尺寸为演示预设</small></div>
            <div class="trade-vehicles" role="group" aria-label="选择柜型或车型">
              <button
                v-for="item in vehicles.filter(item => item.kind === vehicle.kind)"
                :key="item.id"
                type="button"
                :aria-pressed="item.id === vehicle.id"
                @click="draft.vehicleId = item.id"
              >{{ item.label }}</button>
            </div>
            <dl class="trade-specs">
              <div><dt>内尺寸（长×宽×高）</dt><dd>{{ vehicle.size.map(value => value / 100).join(' × ') }} m</dd></div>
              <div><dt>容积</dt><dd>{{ numberFormat.format(vehicleVolume(vehicle)) }} m³</dd></div>
              <div><dt>载重</dt><dd>{{ numberFormat.format(vehicle.payload / 1000) }} t</dd></div>
            </dl>
          </section>
          <section class="trade-cargo-panel" aria-label="货物明细">
            <div class="trade-section-heading">
              <h3>货物明细</h3>
              <button class="trade-text-button" type="button" @click="addCargo"><Plus :size="15" aria-hidden="true" />添加货物</button>
            </div>
            <div class="trade-cargo-list">
              <article v-for="(item, index) in draft.cargo" :key="item.id" class="trade-cargo-card" :class="{ selected: selected === item.id }">
                <header>
                  <span class="trade-cargo-number">{{ index + 1 }}</span>
                  <input v-model="item.name" type="text" :aria-label="`货物 ${index + 1} 名称`" maxlength="80" placeholder="货物名称" />
                  <button type="button" :aria-label="`删除货物 ${index + 1}`" title="删除货物" @click="draft.cargo.splice(index, 1)"><X :size="15" /></button>
                </header>
                <div class="trade-cargo-fields">
                  <label v-for="field in numericFields" :key="field.id">
                    <span>{{ field.label }}</span>
                    <span class="trade-number-field">
                      <input v-model.number="item[field.id]" type="number" :step="field.step" min="0" :aria-label="`货物 ${index + 1} ${field.label}`" />
                      <small>{{ field.unit }}</small>
                    </span>
                  </label>
                  <div class="trade-weight">
                    <span>毛重／箱</span>
                    <strong>{{ Number.isFinite(item.net) && Number.isFinite(item.tare) ? numberFormat.format(cartonWeight(item)) + ' kg' : '—' }}</strong>
                  </div>
                </div>
                <label class="trade-orientation"><input v-model="item.upright" type="checkbox" />保持箱体直立</label>
              </article>
              <p v-if="!draft.cargo.length" class="trade-empty">添加货物后可计算装柜方案。</p>
            </div>
          </section>
          <footer class="trade-compute">
            <p v-if="error" role="alert">{{ error }}</p>
            <button class="trade-button trade-primary" type="button" @click="calculate()">开始计算</button>
          </footer>
        </aside>

        <div class="trade-results">
          <dl class="trade-stats" aria-label="装载指标">
            <div v-for="stat in stats" :key="stat.label">
              <dt>{{ stat.label }}</dt><dd><strong>{{ stat.value }}</strong><small>{{ stat.unit }}</small></dd>
            </div>
          </dl>
          <div class="trade-notice" :class="{ warning: dirty || plan.total !== plan.loaded }" role="status">
            <span v-if="dirty">柜型或货物已修改，请重新计算。下方显示上次结果。</span>
            <span v-else>{{ plan.vehicle.label }} · {{ plan.loaded === plan.total ? `全部 ${plan.loaded} 箱可排入当前方案` : `装入 ${plan.loaded} 箱，剩余 ${plan.total - plan.loaded} 箱` }}</span>
            <span>单{{ plan.vehicle.kind === 'container' ? '柜' : '车' }}估算</span>
          </div>
          <TradeLoadPreview :plan="plan" :shown="shown" :selected="selected" @select="selected = selected === $event ? '' : $event" />
          <div class="trade-result-panels">
            <section class="trade-steps" aria-label="装载步骤">
              <div class="trade-section-heading">
                <h3>装载步骤</h3>
                <small>{{ focusGroup ? focusGroup.cargo.name + ' · ' : '' }}显示前 {{ steps.length }} 箱</small>
              </div>
              <ol v-if="steps.length">
                <li v-for="(step, index) in steps" :key="index">
                  <span class="trade-step-marker" :style="{ background: step.color }" aria-hidden="true" />
                  <span><strong>{{ step.cargo.name }}</strong><small>坐标 {{ step.position.map(numberFormat.format).join(', ') }} · {{ step.size.join(' × ') }} cm</small></span>
                </li>
              </ol>
              <p v-else class="trade-empty">当前方案没有可展示的装载步骤。</p>
            </section>
            <aside class="trade-assistant" aria-label="装柜助手">
              <div class="trade-section-heading"><h3><Sparkles :size="16" aria-hidden="true" />装柜助手</h3><small>规则计算</small></div>
              <div class="trade-assistant-inner">
                <p class="trade-assistant-context">{{ plan.vehicle.label }} · {{ focusGroup?.cargo.name ?? '全部货物' }}</p>
                <WorkbenchAssistantSelect :fallback-label="assistantFallback" />
                <div class="trade-buttons">
                  <button class="trade-button" type="button" :disabled="dirty" :aria-pressed="assistantRun?.mode === 'review'" @click="runAssistant('review')">复核装载</button>
                  <button class="trade-button" type="button" :disabled="dirty" :aria-pressed="assistantRun?.mode === 'compare'" @click="runAssistant('compare')">比较{{ plan.vehicle.kind === 'container' ? '柜型' : '车型' }}</button>
                </div>
                <p v-if="assistantRun && !dirty" class="trade-assistant-context">{{ assistantRun.author }}</p>
                <ul v-if="assistantRun?.mode === 'review' && !dirty" class="trade-review" role="status">
                  <li v-for="item in review" :key="item.id"><strong>{{ item.name }}</strong><span>{{ item.text }}</span></li>
                </ul>
                <ul v-if="assistantRun?.mode === 'compare' && !dirty" class="trade-review" role="status">
                  <li v-for="item in comparison" :key="item.vehicle.id"><strong>{{ item.vehicle.label }}</strong><span>装入 {{ item.loaded }} / {{ item.total }} 箱</span></li>
                </ul>
                <button v-if="suggested && suggested.vehicle.id !== plan.vehicle.id" type="button" class="trade-button trade-primary" @click="applyVehicle(suggested.vehicle.id)">应用 {{ suggested.vehicle.label }} 并计算</button>
                <p class="trade-method">按货物分区估算箱规、空间和总载重。实际装运需复核柜体和堆码承压。</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="trade-toolbar">
        <h2>外贸单证</h2>
        <div v-if="draft.packingList" class="trade-buttons">
          <button type="button" class="trade-button" @click="useDocumentCargo"><Package :size="15" aria-hidden="true" />带回装柜计算</button>
          <button type="button" class="trade-button" @click="exportPackingList"><ArrowDownToLine :size="15" aria-hidden="true" />下载 CSV</button>
          <button type="button" class="trade-button trade-primary" @click="printPackingList"><Printer :size="15" aria-hidden="true" />打印装箱单</button>
        </div>
      </div>
      <div v-if="draft.packingList" class="trade-docs">
        <aside class="trade-doc-form" aria-label="装箱单信息">
          <div class="trade-section-heading"><h3><FileText :size="16" aria-hidden="true" />装箱单</h3><small>草稿</small></div>
          <label>单据编号<input v-model="draft.packingList.reference" type="text" maxlength="60" /></label>
          <label>发货人<input v-model="draft.packingList.shipper" type="text" maxlength="120" /></label>
          <label>收货人<input v-model="draft.packingList.consignee" type="text" maxlength="120" /></label>
          <p><CircleCheck :size="15" aria-hidden="true" />货物数量取自方案实际装入的箱数。</p>
        </aside>
        <article class="trade-paper" aria-label="装箱单预览">
          <header><h3>Packing List</h3><span>装箱单 · {{ draft.packingList.reference || '未编号' }}</span></header>
          <dl>
            <div><dt>Shipper / 发货人</dt><dd>{{ draft.packingList.shipper || '—' }}</dd></div>
            <div><dt>Consignee / 收货人</dt><dd>{{ draft.packingList.consignee || '—' }}</dd></div>
            <div><dt>Container / 柜型</dt><dd>{{ draft.packingList.vehicle }}</dd></div>
          </dl>
          <div class="trade-paper-table">
            <table>
              <thead><tr><th scope="col">货物<br />Description</th><th scope="col">箱数<br />Cartons</th><th scope="col">件数<br />Pieces</th><th scope="col">净重 / kg</th><th scope="col">毛重 / kg</th><th scope="col">体积 / CBM</th></tr></thead>
              <tbody>
                <tr v-for="item in draft.packingList.lines" :key="item.id">
                  <th scope="row">{{ item.name }}<small>{{ item.length }} × {{ item.width }} × {{ item.height }} cm</small></th>
                  <td>{{ numberFormat.format(item.cartons) }}</td><td>{{ numberFormat.format(item.cartons * item.pieces) }}</td>
                  <td>{{ decimalFormat.format(item.cartons * item.net) }}</td><td>{{ decimalFormat.format(item.cartons * cartonWeight(item)) }}</td>
                  <td>{{ decimalFormat.format(item.cartons * cartonVolume(item)) }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th scope="row">合计</th><td>{{ numberFormat.format(documentTotals.cartons) }}</td><td>{{ numberFormat.format(documentTotals.pieces) }}</td><td>{{ decimalFormat.format(documentTotals.net) }}</td><td>{{ decimalFormat.format(documentTotals.gross) }}</td><td>{{ decimalFormat.format(documentTotals.volume) }}</td></tr></tfoot>
            </table>
          </div>
        </article>
      </div>
      <div v-else class="trade-doc-empty">
        <FileText :size="30" aria-hidden="true" />
        <p>从装柜方案生成装箱单后，可在这里编辑、预览和打印。</p>
        <button type="button" class="trade-button trade-primary" @click="tab = 'loading'">打开装柜计算</button>
      </div>
    </template>
  </section>
</template>

<style src="./trade-workbench.css"></style>
