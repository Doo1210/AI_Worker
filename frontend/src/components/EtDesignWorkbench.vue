<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleAlert, CircleCheck, ClipboardCheck, Download, FileBox, FolderOpen, Send, Sparkles } from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePlatformStore, type WorkspaceFile } from '@/stores/platform'
import { ET_DESIGN_WORKBENCH_ID } from '@/stores/sample'
import { useEtDrawingReviewStore } from '@/stores/etDrawingReview'
import { etReviewId, etReviewTitle, useScenarioTaskStore } from '@/stores/scenarioTasks'
import { useWorkbenchAssistant } from '@/workbenchAssistant'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import ConversationFileTree from './ConversationFileTree.vue'
import EtDrawingCanvas from './EtDrawingCanvas.vue'
import EtReviewWorkspace from './EtReviewWorkspace.vue'
import { drawingSvg, getBounds, parseDrawing, sampleDxf, type DrawingEntity } from './etDrawing'
import { getReviewFindings, reviewDrawingName, reviewDrawingSource, type EtReviewVersion } from './etReviewDrawing'

const tabs = [
  { id: 'export', label: '格式转换' },
  { id: 'tools', label: '基础能力' },
  { id: 'ask', label: '智能问图' },
] as const
const formats = [
  { id: 'DXF', description: 'CAD 交换格式' },
  { id: 'HTML', description: '独立网页预览' },
  { id: 'SVG', description: '矢量图形格式' },
] as const
const questions = ['概览当前图纸', '查看图层和实体', '生成出图检查清单']
const fallbackAssistant = '图纸助理'
type Tab = typeof tabs[number]['id']
type Format = typeof formats[number]['id']
type Drawing = ReturnType<typeof parseDrawing> & { name: string, file: Blob, reviewVersion?: EtReviewVersion }

const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
const review = useEtDrawingReviewStore()
const scenarioTasks = useScenarioTaskStore()
const { assistant } = useWorkbenchAssistant()
const tab = ref<Tab>('export')
const input = ref<HTMLInputElement>()
const workspacePickerOpen = ref(false)
const sharedWorkspaceOpen = ref(false)
const chatLog = ref<HTMLElement>()
const canvas = ref<InstanceType<typeof EtDrawingCanvas>>()
const drawing = shallowRef<Drawing>()
const selection = shallowRef<DrawingEntity[]>([])
const loading = ref(false)
const importError = ref('')
const question = ref('')
const messages = ref<{ question: string; answer: string; assistantName: string }[]>([])
let importRevision = 0

const reviewLocation = { name: 'workbench', params: { id: ET_DESIGN_WORKBENCH_ID }, query: { review: etReviewId } }
const reviewOpen = computed(() => review.hasWorkspaceAccess && route.name === 'workbench' && route.query.review === etReviewId)
const routeVersion = computed<EtReviewVersion>(() => route.query.version === 'V1' ? 'V1' : 'V2')
const reviewVersion = computed(() => reviewOpen.value ? drawing.value?.reviewVersion : undefined)
const reviewDraft = computed(() => reviewVersion.value ? review.draftFor(reviewVersion.value) : undefined)
const canConfirmChecklist = computed(() => !!reviewDraft.value?.findings.length
  && reviewDraft.value.findings.every(finding => !!finding.conclusion.trim()))
const canRequestReview = computed(() => platform.visibleEmployees.some(employee => employee.id === 'employee-design'))
const visibleQuestions = computed(() => reviewVersion.value ? questions.slice(0, -1) : questions)
const latestDelivery = computed(() => reviewOpen.value
  ? scenarioTasks.tasksForObject('et-review', etReviewId)
    .filter(task => task.writtenAt)
    .sort((left, right) => (right.writtenAt ?? '').localeCompare(left.writtenAt ?? ''))[0]
  : undefined)

const layers = computed(() => {
  const counts = new Map<string, number>()
  for (const entity of drawing.value?.entities ?? []) counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1)
  return [...counts]
})
const dimensions = computed(() => drawing.value ? describeSize(drawing.value.entities) : '—')

function describeSize(entities: DrawingEntity[]) {
  const { left, right, bottom, top } = getBounds(entities)
  const number = (value: number) => Number(value.toPrecision(5)).toString()
  return `${number(right - left)} × ${number(top - bottom)} 图纸单位`
}

function switchTab(event: KeyboardEvent) {
  const index = tabs.findIndex(item => item.id === tab.value)
  const nextIndex = ({
    ArrowRight: (index + 1) % tabs.length,
    ArrowLeft: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  } as Record<string, number | undefined>)[event.key]
  if (nextIndex === undefined) return
  event.preventDefault()
  tab.value = tabs[nextIndex].id
  const tabList = event.currentTarget as HTMLElement
  tabList.querySelectorAll('button')[nextIndex]?.focus()
}

function setDrawing(next?: Drawing) {
  drawing.value = next
  selection.value = []
  question.value = ''
  messages.value = []
}

function closeDrawing() {
  importRevision++
  loading.value = false
  importError.value = ''
  setDrawing()
}

function openSample() {
  closeDrawing()
  const source = sampleDxf()
  setDrawing({ ...parseDrawing(source), name: '设备安装底板.dxf', file: new Blob([source], { type: 'application/dxf' }) })
}

function openReviewVersion(version: EtReviewVersion) {
  if (!reviewOpen.value) return
  closeDrawing()
  const source = reviewDrawingSource(version)
  setDrawing({ ...parseDrawing(source), name: reviewDrawingName(version), file: new Blob([source], { type: 'application/dxf' }), reviewVersion: version })
  tab.value = 'ask'
}

function selectReviewVersion(version: EtReviewVersion) {
  if (routeVersion.value !== version) {
    return router.replace({ ...reviewLocation, query: { ...reviewLocation.query, version: version === 'V1' ? version : undefined } })
  }
  if (reviewVersion.value !== version) openReviewVersion(version)
}

function makeChecklist() {
  const current = drawing.value
  const version = reviewVersion.value
  if (!current || !version || !review.canEdit || reviewDraft.value) return
  review.setDraft({
    version,
    scope: selection.value.length ? `框选 ${selection.value.length} 个实体` : '整张图纸',
    assistantName: assistant.value?.name ?? fallbackAssistant,
    findings: getReviewFindings(current.entities, selection.value),
  })
}

function editConclusion(index: number, event: Event) {
  const draft = reviewDraft.value
  if (!draft) return
  const conclusion = (event.target as HTMLTextAreaElement).value
  review.setDraft({ ...draft, findings: draft.findings.map((finding, item) => item === index ? { ...finding, conclusion } : finding) })
}

function revealEvidence(indices: number[]) {
  if (!drawing.value) return
  selection.value = indices.flatMap(index => drawing.value?.entities[index] ?? [])
  canvas.value?.revealSelection()
}

async function openSharedVersion(version: EtReviewVersion, indices?: number[]) {
  sharedWorkspaceOpen.value = false
  await selectReviewVersion(version)
  if (!indices?.length) return
  await nextTick()
  revealEvidence(indices)
}

function confirmChecklist() {
  if (!reviewVersion.value || !review.confirmDraft(reviewVersion.value)) return
  ElMessage.success(`检查清单已保存到 ${etReviewId} 共享工作空间`)
}

async function discardChecklist() {
  const version = reviewVersion.value
  if (!version) return
  try {
    await ElMessageBox.confirm('清除后可按当前选区重新生成清单。', '清除检查清单草稿？', { confirmButtonText: '清除草稿', cancelButtonText: '继续编辑', type: 'warning' })
  } catch {
    return
  }
  review.clearDraft(version)
}

function publishReview() {
  if (!review.canPublish || reviewVersion.value !== 'V2') return
  const checklist = review.confirmed.find(item => item.version === 'V2')
  if (!checklist) return
  const task = scenarioTasks.createEventTask({
    scenarioId: 'et-review', objectId: etReviewId, objectTitle: etReviewTitle, objectVersion: 'V2',
    triggerKey: `et-review:${etReviewId}:V2`,
    evidence: [
      { label: '电气图纸 V2', detail: '接线路径和线缆标记更新，见图纸 WIRING、CABLE_TAGS 图层。' },
      { label: '材料清单 V1', detail: '共享空间中的材料清单仍为 V1，待核对 V2 变更。' },
      { label: '已确认的检查清单', detail: `${checklist.authorName}已确认 ${checklist.findings.length} 项，范围为${checklist.scope}。` },
    ],
  })
  if (!task) {
    ElMessage.warning('未能触发图纸核对任务，请检查员工的启用状态和工作规则后重试。')
    return
  }
  review.publish(task.id)
  ElMessage.success('V2 已发布，并登记了图纸核对任务')
}

watch([reviewOpen, routeVersion], ([active, version], previous) => {
  if (active) openReviewVersion(version)
  else if (previous?.[0]) {
    closeDrawing()
    sharedWorkspaceOpen.value = false
    tab.value = 'export'
  }
}, { immediate: true })

watch([reviewVersion, () => route.query.evidence], async ([version, evidence]) => {
  if (!version || typeof evidence !== 'string' || evidence.length > 500 || !/^\d+(,\d+)*$/.test(evidence)) return
  await nextTick()
  if (reviewVersion.value === version && route.query.evidence === evidence) {
    revealEvidence(evidence.split(',').map(Number))
  }
}, { immediate: true })

function isDxf(name: string) {
  return /\.dxf$/i.test(name)
}

async function openDrawing(name: string, readFile: () => Blob | Promise<Blob>) {
  const revision = ++importRevision
  loading.value = false
  importError.value = ''
  if (/\.dwg$/i.test(name)) {
    importError.value = '当前预览支持 ASCII DXF。请将 DWG 另存为 ASCII DXF 后打开。'
    return
  }
  if (!isDxf(name)) {
    importError.value = '请选择 10 MB 以内的 ASCII DXF 文件。'
    return
  }

  loading.value = true
  try {
    const file = await readFile()
    if (revision !== importRevision) return
    if (file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的 ASCII DXF 文件。')
    const source = await file.text()
    if (revision !== importRevision) return
    setDrawing({ ...parseDrawing(source), name, file })
  } catch (error) {
    if (revision === importRevision) {
      importError.value = error instanceof Error ? error.message : '无法读取图纸，请重新选择文件。'
    }
  } finally {
    if (revision === importRevision) loading.value = false
  }
}

function openFiles(files: FileList) {
  if (files.length > 1) {
    importRevision++
    loading.value = false
    importError.value = '一次可打开一张图纸，请选择单个文件。'
    return
  }
  const file = files[0]
  if (file) void openDrawing(file.name, () => file)
}

function handleFileInput(event: Event) {
  const picker = event.target as HTMLInputElement
  if (picker.files?.length) openFiles(picker.files)
  picker.value = ''
}

async function readWorkspaceFile(file: WorkspaceFile) {
  if (!file.dataUrl) return new Blob([file.content], { type: 'application/dxf' })
  try {
    if (file.dataUrl.startsWith('data:')) {
      const response = await fetch(file.dataUrl)
      if (response.ok) return await response.blob()
    }
  } catch {
    // Use the same message for invalid or unreadable workspace file data.
  }
  throw new Error('无法读取此工作空间文件，请重新选择或上传本地文件。')
}

function openWorkspaceFile(id: string) {
  const file = platform.myFiles.find(item => item.id === id)
  if (!file || !isDxf(file.name)) return
  workspacePickerOpen.value = false
  void openDrawing(file.name, () => readWorkspaceFile(file))
}

function exportDrawing(format: Format) {
  const current = drawing.value
  if (!current) return
  let file = current.file
  if (format !== 'DXF') {
    const svg = drawingSvg(current.entities, current.bounds)
    file = format === 'SVG'
      ? new Blob([svg], { type: 'image/svg+xml' })
      : new Blob([
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ET 图纸预览</title>',
        '<style>body{margin:0;background:#f6f8fc;display:grid;place-items:center;min-height:100vh}svg{width:min(96vw,1000px);max-height:96vh}</style>',
        svg, '</html>',
      ], { type: 'text/html;charset=utf-8' })
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `${current.name.replace(/\.dxf$/i, '')}.${format.toLowerCase()}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  ElMessage.success(`已生成 ${format} 文件`)
}

async function askDrawing(text = question.value) {
  const current = drawing.value
  const prompt = text.trim()
  if (!current || !prompt) return

  const assistantName = assistant.value?.name ?? fallbackAssistant
  const entities = selection.value.length ? selection.value : current.entities
  const scope = selection.value.length ? '当前框选范围' : '整张图纸预览'
  const entityTypes = new Map<string, number>()
  const entityLayers = new Map<string, number>()
  for (const { type, layer } of entities) {
    entityTypes.set(type, (entityTypes.get(type) ?? 0) + 1)
    entityLayers.set(layer, (entityLayers.get(layer) ?? 0) + 1)
  }
  const counts = (items: Map<string, number>) => [...items].map(([label, count]) => `${label}（${count}）`).join('、')
  let answer = `《${current.name}》的${scope}包含 ${entities.length} 个实体，分布于 ${entityLayers.size} 个图层。\n实体类型：${counts(entityTypes)}。\n范围宽高约为 ${describeSize(entities)}。`
  if (/检查|交付|出图/.test(prompt)) {
    if (reviewVersion.value && review.canEdit) {
      makeChecklist()
      answer = `检查清单草稿可在上方查看。请结合图层依据核对，再确认保存到 ${etReviewId}。`
    } else {
      answer = `根据《${current.name}》的${scope}整理出图检查项。\n\n1. 核对 ${entityLayers.size} 个图层的命名、可见性与打印设置。\n2. 对照原图复核关键尺寸、单位、标注和版本号。\n3. 按交付要求导出 DXF、HTML 或 SVG，并重新打开文件复核内容。`
    }
  } else if (/图层|实体/.test(prompt)) {
    answer = `《${current.name}》的${scope}共有 ${entities.length} 个实体。\n图层：${counts(entityLayers)}。\n实体类型：${counts(entityTypes)}。`
  } else if (!/概览|范围|宽|高|尺寸|数量|多少/.test(prompt)) {
    answer = `当前演示可根据《${current.name}》的${scope}汇总图层、实体数量和范围宽高，也可以生成出图检查清单。请试试下方的提问示例。`
  }
  messages.value.push({ question: prompt, answer, assistantName })
  question.value = ''
  await nextTick()
  if (chatLog.value) chatLog.value.scrollTop = chatLog.value.scrollHeight
}
</script>

<template>
  <div class="et-workbench">
    <input ref="input" type="file" accept=".dxf,.dwg" hidden @change="handleFileInput" />
    <section v-if="review.hasWorkspaceAccess" class="et-review-head page-toolbar page-tab-toolbar" aria-label="图纸评审记录">
      <div class="et-review-context">
        <div class="et-review-heading">
          <ClipboardCheck :size="18" aria-hidden="true" />
          <div><h2>{{ etReviewTitle }}</h2><span>{{ etReviewId }}</span></div>
        </div>
        <div v-if="reviewOpen" class="et-review-versions" role="group" aria-label="图纸版本">
          <button type="button" class="et-review-version" :aria-pressed="reviewVersion === 'V1'" @click="selectReviewVersion('V1')">V1 <small>{{ review.release ? '上一版' : '已发布' }}</small></button>
          <button type="button" class="et-review-version" :aria-pressed="reviewVersion === 'V2'" @click="selectReviewVersion('V2')">V2 <small>{{ review.release ? '已发布' : '待发布' }}</small></button>
        </div>
      </div>
      <div class="page-toolbar-controls">
        <RouterLink v-if="!reviewOpen" :to="reviewLocation" class="et-review-primary">打开图纸评审</RouterLink>
        <template v-else>
          <RouterLink :to="{ name: 'workbench', params: { id: ET_DESIGN_WORKBENCH_ID } }" class="et-review-text">退出评审</RouterLink>
          <button type="button" class="et-review-button" @click="sharedWorkspaceOpen = true"><FolderOpen :size="15" aria-hidden="true" />共享工作空间</button>
          <RouterLink
            v-if="canRequestReview && reviewVersion"
            :to="{ name: 'employee-contact', params: { id: 'employee-design' }, query: { mode: 'task', review: etReviewId, version: reviewVersion } }"
            class="et-review-text"
          >交办核对</RouterLink>
          <template v-if="review.release">
            <button type="button" class="et-review-button" @click="sharedWorkspaceOpen = true">查看发布与交付</button>
          </template>
          <template v-else-if="review.canEdit">
            <span v-if="!review.canPublish" class="et-review-publish-hint">确认并保存 V2 清单后可发布</span>
            <button type="button" class="et-review-primary" :disabled="!review.canPublish || reviewVersion !== 'V2'" @click="publishReview">发布 V2</button>
          </template>
          <span v-if="!review.canEdit" class="et-review-publish-hint">仅查看</span>
        </template>
      </div>
    </section>
    <div v-if="latestDelivery" class="et-review-result" aria-label="最近写回的结论">
      <CircleCheck :size="15" aria-hidden="true" />
      <strong>{{ latestDelivery.objectVersion }} 已写回</strong>
      <p :title="latestDelivery.result">{{ latestDelivery.result }}</p>
    </div>
    <p v-if="importError" class="notice import-error" role="alert"><CircleAlert :size="17" />{{ importError }}</p>
    <div class="et-layout page-body" :class="{ 'review-layout': reviewOpen, 'with-delivery': latestDelivery }">
      <EtDrawingCanvas
        ref="canvas"
        :drawing="drawing"
        :selection="selection"
        :loading="loading"
        @workspace="workspacePickerOpen = true"
        @upload="input?.click()"
        @sample="openSample"
        @close="closeDrawing"
        @files="openFiles"
        @select="selection = $event"
      />
      <aside class="drawing-tools" aria-label="图纸工具和智能问图">
        <div class="tool-tabs" role="tablist" aria-label="图纸工具" @keydown="switchTab">
          <button
            v-for="item in tabs"
            :id="`et-tab-${item.id}`"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="tab === item.id"
            :aria-controls="`et-panel-${item.id}`"
            :tabindex="tab === item.id ? 0 : -1"
            @click="tab = item.id"
          >{{ item.label }}</button>
        </div>

        <section v-show="tab === 'export'" id="et-panel-export" class="tool-content" role="tabpanel" aria-labelledby="et-tab-export" tabindex="0">
          <p class="tools-intro">选择目标格式导出当前图纸</p>
          <div class="format-list">
            <button
              v-for="format in formats"
              :key="format.id"
              type="button"
              class="format-card"
              :disabled="!drawing"
              @click="exportDrawing(format.id)"
            >
              <span class="format-icon" aria-hidden="true">{{ format.id }}</span>
              <span><strong>{{ format.id === 'DXF' && drawing ? '下载 DXF' : `转为 ${format.id}` }}</strong><small>{{ format.description }}</small></span>
              <Download :size="17" class="download-icon" aria-hidden="true" />
            </button>
          </div>
          <p v-if="!drawing" class="notice"><CircleAlert :size="17" aria-hidden="true" />请先打开图纸，再选择导出格式</p>
          <p v-else class="format-detail">DXF 下载原图，HTML 和 SVG 导出当前可预览的二维实体。</p>
          <p v-if="drawing?.skipped" class="notice"><CircleAlert :size="17" aria-hidden="true" />{{ drawing.skipped }} 个实体未纳入预览与网页、矢量导出。</p>
        </section>

        <section v-show="tab === 'tools'" id="et-panel-tools" class="tool-content" role="tabpanel" aria-labelledby="et-tab-tools" tabindex="0">
          <h2 class="tool-heading">图纸信息</h2>
          <p v-if="!drawing" class="tools-intro align-left">打开图纸后可查看范围、图层和实体统计。</p>
          <template v-else>
            <dl class="drawing-stats">
              <div><dt>预览实体</dt><dd>{{ drawing.entities.length }} 个</dd></div>
              <div><dt>范围宽高</dt><dd>{{ dimensions }}</dd></div>
              <div><dt>当前选择</dt><dd>{{ selection.length }} 个实体</dd></div>
            </dl>
            <button v-if="selection.length" type="button" class="text-button" @click="selection = []">清除选择</button>
            <h3 class="tool-heading layers-title">图层 <span>{{ layers.length }}</span></h3>
            <ul class="layer-list">
              <li v-for="[name, count] in layers" :key="name"><span>{{ name }}</span><span>{{ count }} 个实体</span></li>
            </ul>
            <p v-if="drawing.skipped" class="notice"><CircleAlert :size="17" aria-hidden="true" />{{ drawing.skipped }} 个实体未纳入预览和统计。</p>
          </template>
        </section>

        <section v-show="tab === 'ask'" id="et-panel-ask" class="tool-content chat-panel" role="tabpanel" aria-labelledby="et-tab-ask" tabindex="0">
          <div class="chat-heading">
            <Sparkles :size="17" aria-hidden="true" />
            <WorkbenchAssistantSelect class="chat-assistant-select" :fallback-label="fallbackAssistant" />
            <span class="chat-demo">本地演示</span>
          </div>
          <div v-if="drawing" class="drawing-context">
            <FileBox :size="16" aria-hidden="true" />
            <span :title="drawing.name">{{ reviewVersion ? `${etReviewId} · ${reviewVersion}` : drawing.name }}</span>
            <strong>{{ selection.length ? `框选 ${selection.length} 个` : '整张图纸' }}</strong>
          </div>
          <p v-if="drawing?.skipped" class="format-detail">问图统计仅覆盖当前可预览的实体。</p>
          <section v-if="reviewVersion && review.canEdit" class="et-checklist" aria-label="出图检查清单">
            <div class="et-checklist-header">
              <h3>出图检查清单</h3>
              <button v-if="!reviewDraft" type="button" class="et-review-button" @click="makeChecklist">生成检查清单</button>
              <button v-else type="button" class="et-review-text" @click="discardChecklist">清除草稿</button>
            </div>
            <template v-if="reviewDraft">
              <p class="et-checklist-meta">{{ reviewDraft.assistantName }} · {{ reviewDraft.scope }} · 个人草稿</p>
              <ol class="et-checklist-findings">
                <li v-for="(finding, index) in reviewDraft.findings" :key="finding.layer">
                  <div class="et-checklist-evidence">
                    <strong>{{ finding.layer }}</strong>
                    <button type="button" class="et-review-text" :aria-label="`定位图纸依据：${finding.layer}`" @click="revealEvidence(finding.entityIndices)">定位依据</button>
                  </div>
                  <small>{{ finding.evidence }}</small>
                  <textarea :aria-label="`${finding.layer} 检查结论`" :value="finding.conclusion" rows="2" maxlength="500" @input="editConclusion(index, $event)"></textarea>
                </li>
              </ol>
              <button type="button" class="et-review-primary" :disabled="!canConfirmChecklist" @click="confirmChecklist">确认并保存到 {{ etReviewId }}</button>
            </template>
          </section>
          <div ref="chatLog" class="chat-log" role="log" aria-label="问图记录" aria-live="polite">
            <p v-if="!messages.length" class="chat-welcome">{{ drawing ? '可以询问图层、实体和图纸范围。框选后，我会按所选实体回答。' : '打开图纸后，可以针对整张图纸或框选区域提问。' }}</p>
            <template v-for="(message, index) in messages" :key="index">
              <p class="chat-question">{{ message.question }}</p>
              <p class="chat-answer"><small class="chat-author">{{ message.assistantName }}</small>{{ message.answer }}</p>
            </template>
          </div>
          <div class="quick-questions">
            <button v-for="item in visibleQuestions" :key="item" type="button" :disabled="!drawing" @click="askDrawing(item)">{{ item }}</button>
          </div>
          <form class="ask-form" @submit.prevent="askDrawing()">
            <input v-model="question" type="text" aria-label="图纸问题" placeholder="输入图纸问题" maxlength="200" :disabled="!drawing" />
            <button type="submit" aria-label="发送问题" :disabled="!drawing || !question.trim()"><Send :size="16" aria-hidden="true" /></button>
          </form>
        </section>
      </aside>
    </div>
    <EtReviewWorkspace v-if="reviewOpen" v-model:open="sharedWorkspaceOpen" @open-version="openSharedVersion" />
    <el-dialog
      v-model="workspacePickerOpen"
      title="选择工作空间文件"
      width="min(480px, calc(100vw - 28px))"
      append-to-body
      destroy-on-close
    >
      <p class="workspace-picker-hint">从个人工作空间打开 ASCII DXF 图纸。</p>
      <ConversationFileTree
        class="workspace-picker-files"
        :file-filter="file => isDxf(file.name)"
        empty-text="工作空间暂无 DXF 图纸。可先上传到工作空间，或在工作台直接上传本地文件。"
        hide-heading
        @open-file="openWorkspaceFile"
      />
    </el-dialog>
  </div>
</template>

<style scoped>
.workspace-picker-hint { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
.workspace-picker-files { max-height: 50vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
.et-workbench { container-type: inline-size; --et-record-height: 0px; }
.et-workbench:has(.et-review-head) { --et-record-height: 61px; }
.et-layout { display: grid; grid-template-columns: minmax(0, 1.95fr) minmax(300px, 1fr); gap: 12px; height: max(490px, calc(var(--shell-body-height, 100dvh) - 112px - var(--et-record-height))); }
.et-layout.with-delivery { --et-record-height: 98px; }
.et-review-head { border-bottom: 1px solid var(--line); }
.et-review-context, .et-review-versions { display: flex; align-items: center; flex-wrap: wrap; min-width: 0; gap: 6px; }
.et-review-context { column-gap: 10px; }
.et-review-heading { display: flex; align-items: center; gap: 9px; min-width: 0; }
.et-review-heading svg { flex: none; color: var(--accent); }
.et-review-heading h2 { margin: 0; color: var(--text); font-size: 14px; font-weight: 675; overflow-wrap: anywhere; }
.et-review-heading span, .et-review-publish-hint { color: var(--muted); font-size: 11px; }
.et-review-button, .et-review-primary, .et-review-version { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 31px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: #435575; font-size: 12px; font-weight: 620; }
.et-review-primary { border-color: var(--accent); background: var(--accent); color: #fff; }
.et-review-primary:hover:not(:disabled) { background: var(--accent-hover); }
.et-review-primary:disabled { border-color: #e1e7f3; background: #e9edf6; color: #68768e; }
.et-review-button:hover, .et-review-version:hover, .et-review-version[aria-pressed="true"] { border-color: #c6d4f5; background: var(--soft); color: var(--accent); }
.et-review-version small { color: var(--muted); font-size: 10px; font-weight: 550; }
.et-review-text { padding: 3px 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; font-weight: 630; white-space: nowrap; }
.et-review-text:hover { text-decoration: underline; }
.et-review-result { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 8px 12px 0; padding: 7px 9px; border: 1px solid #d6ebdc; border-radius: 7px; background: #f0f8f2; color: #2b6748; font-size: 12px; }
.et-review-result svg, .et-review-result strong { flex: none; }
.et-review-result p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-checklist { display: grid; flex: none; align-items: start; gap: 7px; margin-top: 12px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
.et-checklist-header, .et-checklist-evidence { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.et-checklist-header h3 { margin: 0; font-size: 13px; }
.et-checklist-meta { margin: 0; color: var(--muted); font-size: 11px; }
.et-checklist-findings { display: grid; gap: 8px; max-height: 240px; margin: 0; padding: 0 4px 0 0; list-style: none; overflow: auto; }
.et-checklist-findings li { display: grid; gap: 3px; padding: 6px 0; }
.et-checklist-findings li + li { border-top: 1px solid var(--line); }
.et-checklist-findings strong { font-size: 12px; overflow-wrap: anywhere; }
.et-checklist-findings small { color: var(--muted); font-size: 11px; }
.et-checklist-findings textarea { width: 100%; min-width: 0; padding: 6px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--canvas); color: var(--text); font: inherit; font-size: 12px; line-height: 1.5; resize: vertical; }
.et-checklist > .et-review-primary { justify-self: start; }
.review-layout .chat-log { min-height: 50px; }
.drawing-tools { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 1px solid #e8ecf4; border-radius: 13px; background: #fff; overflow: hidden; }
.tool-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: none; background: #eaf0fc; }
.tool-tabs button { position: relative; min-height: 48px; padding: 8px 3px; border: 0; border-radius: 10px 10px 0 0; background: transparent; color: #596780; font-weight: 650; white-space: nowrap; }
.tool-tabs button:hover { color: #2b53c7; }
.tool-tabs button[aria-selected="true"] { color: #2b53c7; background: #fff; }
.tool-tabs button:focus-visible, .tool-content:focus-visible { outline-offset: -3px; }
.tool-content { flex: 1; min-height: 0; padding: 22px clamp(12px, 2.1cqw, 24px); overflow: auto; }
.tools-intro { margin: 1px 0 18px; color: #606d84; text-align: center; line-height: 1.6; }
.tools-intro.align-left { text-align: left; }
.format-list { display: grid; gap: 10px; }
.format-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; padding: 12px; border: 1px solid #e7edf8; border-radius: 10px; background: #f4f7fe; color: #273854; text-align: left; }
.format-card:not(:disabled):hover { border-color: #adbef5; background: #edf3ff; }
.format-card:disabled { border-color: transparent; background: #f3f5fa; color: #657187; }
.format-card strong, .format-card small { display: block; }
.format-card strong { font-size: 16px; font-weight: 680; }
.format-card small { margin-top: 4px; color: #67748c; font-size: 12px; }
.format-card:disabled .download-icon { visibility: hidden; }
.format-icon { position: relative; display: grid; place-items: end center; width: 43px; height: 52px; padding-bottom: 8px; border-radius: 7px; background: #5573cd; color: #fff; font-size: 12px; font-weight: 700; clip-path: polygon(0 0, 72% 0, 100% 23%, 100% 100%, 0 100%); }
.format-icon::after { position: absolute; inset: 0 0 auto auto; width: 28%; height: 23%; border-radius: 0 0 0 4px; background: #ffffff58; content: ''; }
.format-card:disabled .format-icon { background: #7687b8; }
.notice { display: flex; align-items: flex-start; gap: 7px; margin: 16px 0 0; padding: 10px; border-radius: 8px; background: #fff5df; color: #835014; font-size: 12px; line-height: 1.55; }
.notice svg { flex: none; }
.import-error { margin: 8px 12px 0; }
.format-detail { margin: 12px 0 0; color: #67748c; font-size: 12px; line-height: 1.65; }
.tool-heading { margin: 0 0 12px; font-size: 15px; font-weight: 680; }
.drawing-stats { display: grid; gap: 10px; margin: 0; font-size: 13px; }
.drawing-stats > div { display: flex; justify-content: space-between; gap: 8px; }
.drawing-stats dt { color: #66738a; }
.drawing-stats dd { margin: 0; overflow-wrap: anywhere; text-align: right; }
.text-button { margin-top: 10px; padding: 0; border: 0; background: transparent; color: var(--accent); font-size: 13px; }
.layers-title { margin-top: 20px; }
.layers-title span, .chat-demo { color: #67748c; font-size: 12px; font-weight: 500; }
.layer-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.layer-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 8px; border-radius: 6px; background: #f4f6fb; font-size: 12px; overflow-wrap: anywhere; }
.layer-list li span:last-child { flex: none; color: #67748c; }
.chat-panel { display: flex; flex-direction: column; }
.chat-heading { display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 12px; }
.chat-heading > svg { flex: none; color: var(--accent); }
.chat-assistant-select { min-width: 0; max-width: 100%; }
.chat-demo { flex: none; margin-left: auto; white-space: nowrap; }
.drawing-context { display: flex; align-items: center; gap: 6px; padding: 8px; border-radius: 7px; background: #eef3ff; color: #405891; font-size: 12px; }
.drawing-context svg, .drawing-context strong { flex: none; }
.drawing-context span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawing-context strong { margin-left: auto; font-weight: 600; }
.chat-log { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 105px; padding: 12px 1px; overflow: auto; }
.chat-log p { margin: 0; padding: 9px; border-radius: 8px; background: #f3f5fa; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
.chat-log .chat-welcome { color: #596780; }
.chat-log .chat-question { align-self: flex-end; max-width: 92%; background: #edf2ff; color: #2b4593; }
.chat-author { display: block; margin-bottom: 3px; color: #596780; font-size: 11px; font-weight: 650; }
.quick-questions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.quick-questions button { padding: 4px 7px; border: 1px solid #dde6fa; border-radius: 6px; background: #fff; color: #3e5795; font-size: 12px; }
.quick-questions button:disabled { color: #68748a; }
.quick-questions button:hover:not(:disabled) { background: #edf3ff; }
.ask-form { display: flex; gap: 6px; margin-top: 9px; }
.ask-form input { flex: 1; width: 100%; min-width: 0; padding: 7px; border: 1px solid #dce3f2; border-radius: 7px; color: var(--text); font-size: 13px; }
.ask-form input:disabled { background: #f5f7fb; }
.ask-form button { display: grid; flex: none; place-items: center; width: 34px; min-height: 34px; border: 0; border-radius: 7px; background: var(--accent); color: #fff; }
.ask-form button:disabled { background: #dfe5f4; color: #637496; }
@container (max-width: 680px) {
  .et-layout { grid-template-columns: minmax(0, 1fr); height: auto; gap: 8px; padding: 6px; }
  .et-layout > :first-child { min-height: 350px; }
  .tool-content { padding: 16px 12px; }
  .chat-log { max-height: 300px; }
}
@container (min-width: 681px) and (max-width: 850px) {
  .et-layout.review-layout { --et-record-height: 93px; }
  .et-layout.with-delivery { --et-record-height: 130px; }
}
@container (max-width: 325px) {
  .format-card { padding: 9px; gap: 8px; }
}
</style>
