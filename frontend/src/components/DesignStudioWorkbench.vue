<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, ArrowUp, Check, ChevronDown, Download, Focus, LayoutGrid, Maximize2, MousePointer2, Palette, Pencil, Play, ScanLine, Smartphone, Sparkles, Type, Undo2, X } from 'lucide-vue-next'
import noodlePhoto from '@/assets/design-studio-noodles.jpg?inline'
import { contrastOnWhite, elementText, elements, initialDesign, screenOf, screens, type Basket, type DesignDocument, type DishId, type ElementId, type ScreenId } from '@/stores/designStudio'
import { useWorkbenchAssistant } from '@/workbenchAssistant'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import DesignStudioScreen from './DesignStudioScreen.vue'
import phoneCss from './designStudioPhone.css?inline'

const props = defineProps<{ userId: string }>()
const storageKey = 'ai-worker-design-studio:' + props.userId
const { assistant } = useWorkbenchAssistant()
const fallbackAssistant = '设计助理'
const colors = [
  { name: '暖棕', color: '#a64828' }, { name: '橙色', color: '#b54c18' }, { name: '墨绿', color: '#286650' },
  { name: '靛蓝', color: '#4357a3' }, { name: '红色', color: '#a53742' },
]
const sampleBasket: Basket = { beef: 1, tomato: 1, greens: 1 }
const targetIds = Object.keys(elements) as ElementId[]
type Dialog = '' | 'text' | 'style' | 'note' | 'appearance' | 'check' | 'export'
type Suggestion = { id: ElementId; label?: string; color?: string; emphasis?: boolean }
interface Exchange { prompt: string; context?: string; text: string; assistantName: string; suggestion?: Suggestion; applied?: boolean }

function loadDesign(): DesignDocument {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<DesignDocument> | null
    if (saved?.labels && saved.styles && saved.notes) return { ...initialDesign, ...saved }
  } catch {
    // The example can open when saved data is unavailable.
  }
  return structuredClone(initialDesign)
}

const design = shallowRef(loadDesign())
const versions = shallowRef<DesignDocument[]>([])
const activeScreen = ref<ScreenId>('menu')
const selected = ref<ElementId | undefined>('menu.cta')
const changed = ref<ElementId>()
const dialog = ref<Dialog>('')
const editText = ref('')
const editColor = ref('')
const editEmphasis = ref(false)
const editRadius = ref(12)
const view = ref<'canvas' | 'single'>('canvas')
const preview = ref(false)
const zoom = ref<'fit' | '0.8' | '1' | '1.25'>('fit')
const basket = ref<Basket>({ ...sampleBasket })
const orderBasket = ref<Basket>()
const prompt = ref('')
const exchanges = ref<Exchange[]>([])
const messages = ref<HTMLElement>()
const viewport = ref<HTMLElement>()
const exportArea = ref<HTMLElement>()
const exporting = ref(false)
const viewportWidth = ref(950)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
const projectName = computed(() => elementText(design.value, 'menu.title'))
const single = computed(() => preview.value || view.value === 'single')
const visibleScreens = computed(() => single.value ? screens.filter(screen => screen.id === activeScreen.value) : screens)
const fitZoom = computed(() => Math.min(1.12, Math.max(.7, (viewportWidth.value - 40) / (single.value ? 216 : 724))))
const zoomScale = computed(() => zoom.value === 'fit' ? fitZoom.value : Number(zoom.value))
const screenName = (id: ScreenId) => screens.find(screen => screen.id === id)!.name
const selectionName = computed(() => selected.value ? `${screenName(screenOf(selected.value))} · ${elements[selected.value].name}` : '')
const checkResults = computed(() => targetIds.filter(id => id.endsWith('.cta')).map(id => {
  const ratio = contrastOnWhite(design.value.styles[id]?.color ?? design.value.accent)
  return { id, ratio, passed: ratio >= 4.5 }
}))
const dialogTitle = computed(() => ({ text: '修改文案', style: '元素样式', note: '添加标注', appearance: '项目外观', check: '设计体检', export: '导出设计', '': '' }[dialog.value]))

watch(viewport, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(([entry]) => { viewportWidth.value = entry.contentRect.width })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
onUnmounted(() => clearTimeout(highlightTimer))

function save(next: DesignDocument, target?: ElementId) {
  versions.value = [...versions.value.slice(-29), design.value]
  replaceDesign(next)
  if (!target) return
  select(target)
  changed.value = undefined
  clearTimeout(highlightTimer)
  void nextTick(() => {
    changed.value = target
    highlightTimer = setTimeout(() => { changed.value = undefined }, 1500)
  })
}

function replaceDesign(next: DesignDocument) {
  design.value = next
  try {
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    ElMessage.warning('浏览器无法保存，本次编辑可继续使用。')
  }
}

function undo() {
  const previous = versions.value.at(-1)
  if (!previous) return
  versions.value = versions.value.slice(0, -1)
  replaceDesign(previous)
}

function select(id: ElementId) {
  activeScreen.value = screenOf(id)
  selected.value = id
}

function selectScreen(id: ScreenId) {
  activeScreen.value = id
  if (selected.value && screenOf(selected.value) !== id) selected.value = undefined
}

function tryPrototype() {
  preview.value = !preview.value
  if (preview.value) {
    activeScreen.value = 'menu'
    basket.value = { ...sampleBasket }
    orderBasket.value = undefined
  } else if (selected.value) {
    activeScreen.value = screenOf(selected.value)
  }
}

function focusSelection() {
  if (preview.value) tryPrototype()
  const id = selected.value ?? `${activeScreen.value}.title`
  select(id)
  void nextTick(() => viewport.value?.querySelector<HTMLElement>(`[data-element="${id}"]`)?.focus())
}

function adjustQuantity(id: DishId, amount: number) {
  basket.value = { ...basket.value, [id]: Math.max(0, Math.min(99, basket.value[id] + amount)) }
}

function checkout() {
  orderBasket.value = { ...basket.value }
  basket.value = { beef: 0, tomato: 0, greens: 0 }
  activeScreen.value = 'orders'
}

function openDialog(next: Dialog) {
  const id = selected.value
  if (next === 'text' || next === 'style' || next === 'note') {
    if (!id) return
    editText.value = next === 'note' ? design.value.notes[id] ?? '' : elementText(design.value, id)
    editColor.value = design.value.styles[id]?.color ?? (id.endsWith('.cta') ? design.value.accent : '#33231a')
    editEmphasis.value = !!design.value.styles[id]?.emphasis
  }
  if (next === 'appearance') {
    editColor.value = design.value.accent
    editRadius.value = design.value.radius
  }
  dialog.value = next
}

function commitDialog() {
  if (dialog.value === 'appearance') {
    save({ ...design.value, accent: editColor.value, radius: editRadius.value })
  } else {
    const id = selected.value
    if (!id) return
    if (dialog.value === 'text' && editText.value.trim()) {
      save({ ...design.value, labels: { ...design.value.labels, [id]: editText.value.trim() } }, id)
    } else if (dialog.value === 'note') {
      save({ ...design.value, notes: { ...design.value.notes, [id]: editText.value.trim() } }, id)
    } else if (dialog.value === 'style') {
      save({ ...design.value, styles: { ...design.value.styles, [id]: { color: editColor.value, emphasis: editEmphasis.value } } }, id)
    }
  }
  dialog.value = ''
}

function suggest(text: string, id: ElementId): Suggestion | undefined {
  const quoted = text.match(/[「“"]([^」”"]+)[」”"]/u)?.[1]?.trim()
  const colorLiteral = text.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i)?.[0]
  const hex = colorLiteral?.length === 4 ? colorLiteral.replace(/[0-9a-f]/gi, digit => digit + digit) : colorLiteral
  const colorRequest = /颜色|背景|配色/.test(text)
  const simpleColors = { 蓝色: '#4357a3', 绿色: '#286650', 白色: '#ffffff', 黑色: '#222222', 紫色: '#6c4e96' }
  const namedColor = colors.find(item => text.includes(item.name))?.color
    ?? Object.entries(simpleColors).find(([name]) => text.includes(name))?.[1]
  if ((hex || namedColor) && (!quoted || colorRequest)) return { id, color: hex ?? namedColor }
  if (colorRequest) return
  if (quoted) return { id, label: quoted.slice(0, 30) }
  if (/突出|加粗|强调|醒目/.test(text)) return { id, emphasis: true }
  const label = text.match(/(?:文案改为|文案改成|改成|改为|换成)[：:\s]*([^，。！？\n]+)/u)?.[1]?.trim()
  if (label) return { id, label: label.slice(0, 30) }
}

async function send(value = prompt.value) {
  const text = value.trim()
  if (!text) return
  const assistantName = assistant.value?.name ?? fallbackAssistant
  const id = selected.value
  const suggestion = id && !/检查|体检/.test(text) ? suggest(text, id) : undefined
  let reply = '可以先选中画布上的元素，再指定文案、颜色或强调样式。'
  if (/检查|体检/.test(text)) {
    const issues = checkResults.value.filter(result => !result.passed)
    reply = issues.length ? `${issues.length} 个按钮的文字对比度低于 4.5:1。可在「体检」查看位置。` : '点单、购物车和订单的三个跳转按钮文字对比度均达到 4.5:1。可以用「试用」走一遍点单流程。'
  } else if (suggestion) {
    const proposed = suggestion.label ? `将文案改为「${suggestion.label}」` : suggestion.color ? `将颜色设为 ${suggestion.color}` : '加强视觉强调'
    reply = `建议在「${screenName(screenOf(suggestion.id))}」的${elements[suggestion.id].name}上${proposed}。`
  }
  exchanges.value.push({ prompt: text, context: selectionName.value || undefined, text: reply, assistantName, suggestion })
  prompt.value = ''
  await nextTick()
  if (messages.value) messages.value.scrollTop = messages.value.scrollHeight
}

function sendOnEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  void send()
}

function apply(exchange: Exchange) {
  const change = exchange.suggestion
  if (!change || exchange.applied) return
  const { id, label, color, emphasis } = change
  const current = design.value
  const next = label ? { ...current, labels: { ...current.labels, [id]: label } } : {
    ...current,
    styles: { ...current.styles, [id]: { ...current.styles[id], ...(color ? { color } : {}), ...(emphasis ? { emphasis } : {}) } },
  }
  save(next, id)
  exchange.applied = true
}

function download(content: string, mime: string, extension: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = `巷口面馆.${extension}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  dialog.value = ''
}

async function exportHtml() {
  if (exporting.value) return
  exporting.value = true
  await nextTick()
  const content = exportArea.value?.innerHTML
  exporting.value = false
  if (!content) return
  download(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小程序设计原型</title>
    <style>${phoneCss}body{margin:0;padding:24px;background:#f1f2f5;font:14px system-ui,sans-serif}main{display:flex;flex-wrap:wrap;justify-content:center;gap:28px}section h2{font-size:14px}section:target .studio-phone{outline:2px solid #5267ff;outline-offset:4px}</style>
    <main>${content}</main>
    <script>document.addEventListener('click',event=>{const target=event.target.closest('[data-next-screen]');if(target)location.hash=target.dataset.nextScreen})<\/script></html>`, 'text/html;charset=utf-8', 'html')
}
</script>

<template>
  <div class="design-studio" @keydown.esc="selected = undefined">
    <aside class="studio-assistant" aria-label="设计助理">
      <header class="studio-assistant-header">
        <span class="studio-icon"><Sparkles :size="17" aria-hidden="true" /></span>
        <div class="studio-assistant-title">
          <h1>设计工作台</h1>
          <WorkbenchAssistantSelect class="studio-assistant-select" :fallback-label="fallbackAssistant" />
        </div>
        <span class="studio-demo">本地演示</span>
      </header>
      <div ref="messages" class="studio-messages" role="log" aria-label="设计对话">
        <div v-if="!exchanges.length" class="studio-welcome">
          <span class="studio-welcome-mark"><Sparkles :size="23" aria-hidden="true" /></span>
          <h2>完善「{{ projectName }}」</h2>
          <p>在画布中选中一个元素，说说你想怎么改。</p>
          <div class="studio-suggestions">
            <button type="button" @click="send('让选中按钮更醒目')">强调选中按钮 <ArrowRight :size="14" aria-hidden="true" /></button>
            <button type="button" @click="send('检查按钮对比度')">检查按钮对比度 <ArrowRight :size="14" aria-hidden="true" /></button>
          </div>
        </div>
        <template v-for="(exchange, index) in exchanges" :key="index">
          <div class="studio-user-message"><small v-if="exchange.context">{{ exchange.context }}</small><p>{{ exchange.prompt }}</p></div>
          <div class="studio-reply"><small class="studio-reply-author">{{ exchange.assistantName }}</small><p>{{ exchange.text }}</p>
            <button v-if="exchange.suggestion" type="button" :disabled="exchange.applied" @click="apply(exchange)"><component :is="exchange.applied ? Check : Sparkles" :size="13" aria-hidden="true" />{{ exchange.applied ? '已应用' : '应用到画布' }}</button>
          </div>
        </template>
      </div>
      <form class="studio-composer" @submit.prevent="send()">
        <div v-if="selected" class="studio-context" :title="design.notes[selected] || selectionName">
          <Focus :size="13" aria-hidden="true" /><span>{{ selectionName }}</span>
          <button type="button" aria-label="移除选区" @click="selected = undefined"><X :size="13" /></button>
        </div>
        <textarea v-model="prompt" aria-label="描述设计修改" placeholder="例如，把文案改成「查看购物车」" maxlength="240" rows="3" @keydown.enter.exact="sendOnEnter" />
        <div class="studio-compose-footer"><span>{{ selected ? '修改选中元素' : '选择画布元素后可定向修改' }}</span><button type="submit" aria-label="发送修改" :disabled="!prompt.trim()"><ArrowUp :size="18" /></button></div>
      </form>
    </aside>

    <section class="studio-canvas" aria-label="设计画布">
      <div class="studio-canvas-header">
        <div class="studio-project"><LayoutGrid :size="16" aria-hidden="true" /><strong>{{ projectName }}</strong><span>· {{ screens.length }} 屏</span></div>
        <div class="studio-canvas-actions">
          <button type="button" aria-label="撤销修改" title="撤销修改" :disabled="!versions.length" @click="undo"><Undo2 :size="16" /></button>
          <button type="button" @click="openDialog('appearance')"><Palette :size="16" aria-hidden="true" />外观</button>
          <button type="button" @click="openDialog('check')"><ScanLine :size="16" aria-hidden="true" />体检</button>
          <button class="studio-export" type="button" @click="openDialog('export')"><Download :size="16" aria-hidden="true" />导出</button>
        </div>
      </div>
      <div ref="viewport" class="studio-viewport">
        <div class="studio-stage" :class="{ 'single-screen': single }" :style="{ zoom: zoomScale }">
          <div v-for="(screen, index) in visibleScreens" :key="screen.id" class="studio-artboard" :class="{ 'is-active': screen.id === activeScreen }">
            <div class="studio-artboard-heading">
              <button type="button" :aria-current="screen.id === activeScreen ? 'true' : undefined" @click="selectScreen(screen.id)">{{ screen.name }}</button>
              <small>{{ screen.file }}</small>
            </div>
            <DesignStudioScreen
              :screen="screen.id" :design="design" :basket="preview ? (screen.id === 'orders' ? orderBasket ?? basket : basket) : sampleBasket"
              :photo="noodlePhoto" :selected="selected" :changed="changed" :preview="preview" :ordered="!!orderBasket"
              @select="select" @navigate="selectScreen" @quantity="adjustQuantity" @checkout="checkout"
            />
            <span v-if="!single && index < visibleScreens.length - 1" class="studio-flow-arrow" aria-hidden="true"><ArrowRight :size="17" /></span>
          </div>
        </div>
      </div>
      <div class="studio-canvas-footer">
        <div class="studio-toolbar" role="group" aria-label="画布工具">
          <button type="button" :aria-pressed="!preview" @click="focusSelection"><MousePointer2 :size="16" aria-hidden="true" />选择</button>
          <button type="button" :disabled="!selected || preview" @click="openDialog('text')"><Type :size="16" aria-hidden="true" />改字</button>
          <button type="button" :disabled="!selected || preview" @click="openDialog('style')"><Palette :size="16" aria-hidden="true" />样式</button>
          <button type="button" :disabled="!selected || preview" @click="openDialog('note')"><Pencil :size="16" aria-hidden="true" />标注</button>
          <button type="button" :aria-pressed="preview" @click="tryPrototype"><Play :size="16" aria-hidden="true" />{{ preview ? '退出试用' : '试用' }}</button>
        </div>
        <div class="studio-view-tools">
          <button type="button" :aria-label="single ? '多屏画布' : '单屏视图'" :title="single ? '多屏画布' : '单屏视图'" :disabled="preview" @click="view = view === 'canvas' ? 'single' : 'canvas'"><component :is="single ? LayoutGrid : Smartphone" :size="16" /></button>
          <label :title="`当前缩放 ${Math.round(zoomScale * 100)}%`"><Maximize2 :size="14" aria-hidden="true" />
            <select v-model="zoom" aria-label="画布缩放"><option value="fit">适应</option><option value="0.8">80%</option><option value="1">100%</option><option value="1.25">125%</option></select>
            <ChevronDown :size="12" aria-hidden="true" />
          </label>
        </div>
      </div>
    </section>

    <el-dialog :model-value="!!dialog" :title="dialogTitle" width="min(420px, calc(100vw - 30px))" append-to-body @update:model-value="!$event && (dialog = '')">
      <form v-if="dialog === 'text' || dialog === 'style' || dialog === 'note' || dialog === 'appearance'" class="studio-dialog-form" @submit.prevent="commitDialog">
        <p v-if="dialog !== 'appearance'" class="studio-dialog-context">{{ selectionName }}</p>
        <label v-if="dialog === 'text'">文案<input v-model="editText" maxlength="30" required /></label>
        <label v-if="dialog === 'note'">标注内容<textarea v-model="editText" maxlength="160" rows="3" placeholder="写下设计要求，或清空已有标注" /></label>
        <template v-if="dialog === 'style' || dialog === 'appearance'">
          <label>{{ dialog === 'appearance' ? '品牌主色' : '元素颜色' }}<span class="studio-color-input"><input v-model="editColor" type="color" /><code>{{ editColor }}</code></span></label>
          <div class="studio-swatches">
            <button v-for="item in colors" :key="item.name" type="button" :aria-label="item.name" :title="item.name" :aria-pressed="editColor === item.color" :style="{ background: item.color }" @click="editColor = item.color" />
          </div>
          <label v-if="dialog === 'appearance'">卡片圆角 {{ editRadius }} px<input v-model.number="editRadius" type="range" min="4" max="20" /></label>
          <label v-else class="studio-checkbox"><input v-model="editEmphasis" type="checkbox" />强调元素</label>
        </template>
        <el-button type="primary" native-type="submit" :disabled="dialog === 'text' && !editText.trim()">应用到画布</el-button>
      </form>
      <div v-else-if="dialog === 'check'" class="studio-check">
        <p>主要跳转按钮的文字对比度。最低目标为 4.5:1。</p>
        <button v-for="result in checkResults" :key="result.id" type="button" @click="preview = false; select(result.id); dialog = ''">
          <span>{{ screenName(screenOf(result.id)) }} · {{ elements[result.id].name }}</span><strong :class="{ 'check-fail': !result.passed }">{{ result.ratio.toFixed(2) }}:1 · {{ result.passed ? '通过' : '需调整' }}</strong>
        </button>
      </div>
      <div v-else-if="dialog === 'export'" class="studio-export-options">
        <button type="button" :disabled="exporting" @click="exportHtml"><strong>HTML 原型</strong><small>包含三屏与页面跳转，可离线打开</small><Download :size="16" aria-hidden="true" /></button>
        <button type="button" @click="download(JSON.stringify({ name: projectName, screens, ...design }, null, 2), 'application/json', 'json')"><strong>设计配置 JSON</strong><small>包含文案、颜色、样式和标注</small><Download :size="16" aria-hidden="true" /></button>
      </div>
    </el-dialog>

    <div v-if="exporting" ref="exportArea" hidden>
      <section v-for="screen in screens" :id="screen.id" :key="screen.id"><h2>{{ screen.name }}</h2><DesignStudioScreen :screen="screen.id" :design="design" :basket="sampleBasket" :photo="noodlePhoto" :preview="false" :ordered="true" /></section>
    </div>
  </div>
</template>

<style scoped src="./designStudioWorkbench.css"></style>
<style scoped>
.studio-assistant-title { display: grid; flex: 1; min-width: 0; gap: 4px; justify-items: start; }
.studio-assistant-select { min-width: 0; max-width: 100%; }
.studio-reply-author { display: block; margin-bottom: 3px; color: #666a80; font-size: 11px; font-weight: 650; }
</style>
