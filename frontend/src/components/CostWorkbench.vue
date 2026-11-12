<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, ArrowUpRight, Box, Calculator, ChevronDown, ClipboardList, Download, FolderClosed, LayoutDashboard, Paperclip, Plus, Search, Sparkles, Upload, X } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { makeId } from '@/stores/platform'
import CostModelPreview from '@/components/CostModelPreview.vue'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import { calculateLineAmount, formatCny, ledgerLabels, makeProject, projectStages, useConstructionCost, type CostBuilding, type CostEntry, type CostLedger } from '@/stores/constructionCost'
import { useWorkbenchAssistant } from '@/workbenchAssistant'

type Section = 'projects' | 'overview' | 'archive' | 'model' | 'ledger' | 'calculator' | 'attachments'
type Dialog = 'create' | 'rename' | 'building' | 'entry' | 'search'

const navigation = [
  { id: 'overview', label: '项目总览', icon: LayoutDashboard },
  { id: 'archive', label: '造价档案', icon: FolderClosed },
  { id: 'model', label: '模型配置', icon: Box },
  { id: 'ledger', label: '工作台', icon: ClipboardList },
  { id: 'calculator', label: '计算台', icon: Calculator },
  { id: 'attachments', label: '附件库', icon: Paperclip },
] as const
const ledgerKinds = ['measure', 'change', 'output', 'contract', 'calculation'] as const
const prompts = [
  { id: 'summary', label: '概览项目造价' },
  { id: 'changes', label: '汇总签证变更' },
  { id: 'check', label: '检查待补资料' },
] as const
const assistantFallback = '造价助理'

const { assistant } = useWorkbenchAssistant()
const { projects, saveProjects, restoreProjects } = useConstructionCost()
const savedSnapshot = ref(JSON.stringify(projects.value))
const dirty = computed(() => JSON.stringify(projects.value) !== savedSnapshot.value)
const projectId = ref(projects.value[0]?.id ?? '')
const section = ref<Section>(projectId.value ? 'overview' : 'projects')
const project = computed(() => projects.value.find(item => item.id === projectId.value))
const ledger = ref<CostLedger>('measure')
const assistantOpen = ref(false)
const assistantResult = ref('')
const assistantAction = ref<{ id: typeof prompts[number]['id']; author: string }>()
const dialog = ref<Dialog>()
const dialogVisible = computed({
  get: () => Boolean(dialog.value),
  set: (value) => { if (!value) dialog.value = undefined },
})
const dialogTitles: Record<Dialog, string> = { create: '新建项目', rename: '重命名项目', building: '配置楼栋', entry: '台账记录', search: '搜索项目资料' }
const projectName = ref('')
const buildingDraft = reactive<CostBuilding>({ id: '', name: '', floors: 1, area: 0 })
const entryDraft = reactive<CostEntry>({ id: '', kind: 'measure', title: '', quantity: 1, unit: 'm²', unitPrice: 0, date: '' })
const calculation = reactive({ title: '', quantity: 0, unit: 'm²', unitPrice: 0 })
const calculationAmount = computed(() => calculateLineAmount(calculation))
const searchText = ref('')
const attachmentInput = ref<HTMLInputElement>()
const uploading = ref(false)
const highlightedId = ref('')
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

const entries = computed(() => project.value?.entries.filter(entry => entry.kind === ledger.value) ?? [])
const ledgerTotal = computed(() => entries.value.reduce((sum, entry) => sum + calculateLineAmount(entry), 0))
const changeTotal = computed(() => project.value?.entries.filter(entry => entry.kind === 'change').reduce((sum, entry) => sum + calculateLineAmount(entry), 0) ?? 0)
const ledgerCounts = computed(() => {
  const counts: Record<CostLedger, number> = { measure: 0, change: 0, output: 0, contract: 0, calculation: 0 }
  for (const entry of project.value?.entries ?? []) counts[entry.kind] += 1
  return counts
})
const searchResults = computed(() => {
  const current = project.value
  const query = searchText.value.trim().toLocaleLowerCase()
  if (!current || !query) return []
  return [
    ...current.entries.map(item => ({ id: item.id, title: item.title, label: ledgerLabels[item.kind], section: 'ledger' as const, kind: item.kind })),
    ...current.buildings.map(item => ({ id: item.id, title: item.name, label: '楼栋', section: 'model' as const })),
    ...current.attachments.map(item => ({ id: item.id, title: item.name, label: '附件', section: 'attachments' as const })),
  ].filter(item => `${item.title} ${item.label}`.toLocaleLowerCase().includes(query))
})

watch(projectId, () => {
  ledger.value = 'measure'
  assistantResult.value = ''
  assistantAction.value = undefined
  Object.assign(calculation, { title: '', quantity: 0, unit: 'm²', unitPrice: 0 })
})

function navigate(next: Section) {
  section.value = next
  highlightedId.value = ''
  if (next === 'projects') assistantOpen.value = false
}

function openProject(id: string) {
  projectId.value = id
  navigate('overview')
}

function openLedger(kind: CostLedger) {
  ledger.value = kind
  navigate('ledger')
}

function openProjectDialog(mode: 'create' | 'rename') {
  projectName.value = mode === 'rename' ? project.value?.name ?? '' : ''
  dialog.value = mode
}

function submitProject() {
  const name = projectName.value.trim()
  if (!name) return
  if (dialog.value === 'create') {
    const created = makeProject(name)
    projects.value.push(created)
    openProject(created.id)
  } else if (project.value) {
    project.value.name = name
  }
  dialog.value = undefined
}

function save() {
  if (!dirty.value) return
  if (!saveProjects()) {
    ElMessage.error('保存失败。请检查浏览器存储空间后重试。')
    return
  }
  savedSnapshot.value = JSON.stringify(projects.value)
  ElMessage.success('更改已保存')
}

function undo() {
  restoreProjects()
  savedSnapshot.value = JSON.stringify(projects.value)
  if (!project.value) {
    projectId.value = projects.value[0]?.id ?? ''
    navigate('projects')
  }
  assistantResult.value = ''
  assistantAction.value = undefined
  ElMessage.info('已撤销未保存的更改')
}

function onShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return
  switch (event.key.toLowerCase()) {
    case 's':
      event.preventDefault()
      if (!dialog.value && !uploading.value) save()
      break
    case 'k':
      if (!project.value || section.value === 'projects' || dialog.value) return
      event.preventDefault()
      openSearch()
      break
  }
}

onMounted(() => window.addEventListener('keydown', onShortcut))
onUnmounted(() => window.removeEventListener('keydown', onShortcut))

function openBuilding(item?: CostBuilding) {
  Object.assign(buildingDraft, item ?? { id: '', name: '', floors: 1, area: 0 })
  dialog.value = 'building'
}

function submitBuilding() {
  const current = project.value
  const name = buildingDraft.name.trim()
  if (!current || !name || !Number.isInteger(buildingDraft.floors) || buildingDraft.floors < 1 || !(buildingDraft.area > 0)) return
  const index = current.buildings.findIndex(item => item.id === buildingDraft.id)
  const building = { ...buildingDraft, name, id: buildingDraft.id || makeId('cost-building') }
  if (index >= 0) current.buildings.splice(index, 1, building)
  else current.buildings.push(building)
  dialog.value = undefined
}

function today() {
  return new Date().toLocaleDateString('sv-SE')
}

function openEntry(item?: CostEntry) {
  Object.assign(entryDraft, item ?? { id: '', kind: ledger.value, title: '', quantity: 1, unit: '', unitPrice: 0, date: today() })
  dialog.value = 'entry'
}

function submitEntry() {
  const current = project.value
  const title = entryDraft.title.trim()
  const unit = entryDraft.unit.trim()
  if (!current || !title || !unit || !Number.isFinite(entryDraft.quantity) || !(entryDraft.quantity > 0) || !Number.isFinite(entryDraft.unitPrice)) return
  const index = current.entries.findIndex(item => item.id === entryDraft.id)
  const entry = { ...entryDraft, title, unit, id: entryDraft.id || makeId('cost-entry') }
  if (index >= 0) current.entries.splice(index, 1, entry)
  else current.entries.push(entry)
  dialog.value = undefined
}

function setContractAmount(event: Event) {
  const current = project.value
  const input = event.currentTarget as HTMLInputElement
  if (!current) return
  const amount = input.valueAsNumber
  if (!input.validity.valid) return
  if (input.value === '') current.contractAmount = 0
  else if (Number.isFinite(amount)) current.contractAmount = amount
}

function resetInvalidAmount(event: FocusEvent) {
  const input = event.currentTarget as HTMLInputElement
  if (!input.validity.valid) input.value = String(project.value?.contractAmount || '')
}

function recordCalculation() {
  const current = project.value
  const title = calculation.title.trim()
  const unit = calculation.unit.trim()
  if (!current || !title || !unit || !Number.isFinite(calculation.quantity) || !(calculation.quantity > 0) || !Number.isFinite(calculation.unitPrice)) return
  current.entries.push({ ...calculation, title, unit, id: makeId('cost-entry'), kind: 'calculation', date: today() })
  openLedger('calculation')
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(reader.error)
    reader.onerror = () => reject(reader.error)
    reader.onabort = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function uploadAttachment(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  const current = project.value
  input.value = ''
  if (!file || !current || uploading.value) return
  const totalBytes = projects.value.reduce((sum, item) => sum + item.attachments.reduce((size, attachment) => size + attachment.size, 0), 0)
  if (file.size > 512 * 1024 || totalBytes + file.size > 1536 * 1024) {
    ElMessage.warning('单个附件限 512 KB，附件合计限 1.5 MB。')
    return
  }
  uploading.value = true
  try {
    const data = await readDataUrl(file)
    projects.value.find(item => item.id === current.id)?.attachments.push({ id: makeId('cost-file'), name: file.name, size: file.size, data })
    ElMessage.success('附件已添加')
  } catch {
    ElMessage.error('无法读取附件，请重试。')
  } finally {
    uploading.value = false
  }
}

function openSearch() {
  searchText.value = ''
  dialog.value = 'search'
}

function openSearchResult(item: typeof searchResults.value[number]) {
  if ('kind' in item) openLedger(item.kind)
  else navigate(item.section)
  highlightedId.value = item.id
  dialog.value = undefined
}

function runAssistant(id: typeof prompts[number]['id']) {
  const current = project.value
  if (!current) return
  assistantAction.value = { id, author: assistant.value?.name ?? assistantFallback }
  const counts = ledgerCounts.value
  switch (id) {
    case 'summary':
      assistantResult.value = `当前阶段为${current.stage}，合同金额${current.contractAmount ? '为 ' + formatCny(current.contractAmount) : '待录入'}。已记录 ${counts.measure} 笔收方、${counts.output} 笔产值和 ${counts.change} 笔签证变更。可从项目总览打开各台账核对明细。`
      break
    case 'changes':
      assistantResult.value = counts.change
        ? `当前有 ${counts.change} 笔签证变更，增减净额为 ${formatCny(changeTotal.value)}。
${current.entries.filter(item => item.kind === 'change').map(item => `${item.title}  ${formatCny(calculateLineAmount(item))}`).join('\n')}`
        : '当前项目暂无签证变更记录。'
      break
    case 'check': {
      const missing = [
        current.stage === '未设置' && '在造价档案中设置项目阶段',
        !current.contractAmount && '在造价档案中录入合同金额',
        !current.buildings.length && '在模型配置中录入楼栋',
        !current.attachments.length && '在附件库补充项目资料',
      ].filter(Boolean)
      assistantResult.value = missing.length ? missing.join('。\n') + '。' : '阶段、合同金额、楼栋和附件均已有记录。可在相应模块核对完整性。'
      break
    }
  }
}
</script>

<template>
  <div class="cost-workbench">
    <nav v-if="project && section !== 'projects'" class="cost-dock" aria-label="工程造价项目导航">
      <button class="cost-dock-home" type="button" title="工程造价工作台首页" aria-label="工程造价工作台首页" @click="navigate('projects')">
        <LayoutDashboard :size="19" aria-hidden="true" />
      </button>
      <button
        v-for="item in navigation" :key="item.id" type="button"
        :aria-current="section === item.id ? 'page' : undefined" @click="navigate(item.id)"
      >
        <component :is="item.icon" :size="18" :stroke-width="1.7" aria-hidden="true" />
        {{ item.label }}
      </button>
    </nav>

    <div class="cost-shell">
      <header class="cost-toolbar">
        <template v-if="project && section !== 'projects'">
          <div class="cost-crumbs">
            <button class="cost-home-link" type="button" @click="navigate('projects')"><ArrowLeft :size="14" aria-hidden="true" /> 返回首页</button>
            <el-dropdown class="cost-project-select" trigger="click" @command="openProject">
              <button class="cost-project-button" type="button" aria-label="切换项目"><span>{{ project.name }}</span><ChevronDown :size="14" aria-hidden="true" /></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="item in projects" :key="item.id" :command="item.id">{{ item.name }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="cost-toolbar-actions">
            <button type="button" class="cost-search-button" aria-label="搜索项目资料" @click="openSearch">
              <Search :size="16" aria-hidden="true" /><span>搜索</span><kbd>⌘ K</kbd>
            </button>
            <button type="button" class="cost-ai-button" :aria-expanded="assistantOpen" @click="assistantOpen = !assistantOpen">
              <Sparkles :size="17" aria-hidden="true" /> AI 助手
            </button>
          </div>
        </template>
        <template v-else>
          <div class="cost-workbench-title"><Calculator :size="18" aria-hidden="true" />工程造价工作台</div>
          <button class="cost-button cost-primary" type="button" @click="openProjectDialog('create')"><Plus :size="15" aria-hidden="true" />新建项目</button>
        </template>
      </header>

      <div class="cost-content" :class="{ 'has-assistant': assistantOpen && project && section !== 'projects' }">
        <div v-if="section === 'projects' || !project" class="cost-body cost-projects">
          <h1>工程项目</h1>
          <div class="cost-project-list">
            <button v-for="item in projects" :key="item.id" type="button" @click="openProject(item.id)">
              <span class="cost-project-icon"><FolderClosed :size="21" aria-hidden="true" /></span>
              <span><strong>{{ item.name }}</strong><small>{{ item.stage }} · {{ item.buildings.length }} 栋楼</small></span>
              <ArrowUpRight :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div v-else class="cost-body" :class="{ 'is-overview': section === 'overview' }">
          <template v-if="section === 'overview'">
            <div class="cost-section-title">
              <h1>{{ project.name }}</h1>
              <button class="cost-button cost-compact" type="button" @click="openProjectDialog('rename')">重命名</button>
            </div>
            <div class="cost-overview">
              <div class="cost-summary">
                <dl>
                  <div><dt>当前阶段</dt><dd>{{ project.stage }}</dd></div>
                  <div><dt>合同金额</dt><dd>{{ project.contractAmount ? formatCny(project.contractAmount) : '待录入' }}</dd></div>
                  <div><dt>签证变更 · 签证金额</dt><dd>{{ ledgerCounts.change ? formatCny(changeTotal) : '暂无记录' }}</dd></div>
                </dl>
                <button class="cost-button cost-accent" type="button" @click="navigate('archive')">造价档案 <ArrowUpRight :size="14" aria-hidden="true" /></button>
              </div>
              <div class="cost-viewport">
                <CostModelPreview :key="project.id" :buildings="project.buildings" @configure="navigate('model')" />
              </div>
              <div class="cost-shortcuts" aria-label="台账快捷入口">
                <button v-for="kind in ledgerKinds" :key="kind" type="button" @click="openLedger(kind)">
                  <span>{{ ledgerLabels[kind] }}</span><strong>{{ ledgerCounts[kind] }}</strong><ArrowUpRight :size="14" aria-hidden="true" />
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="section === 'archive'">
            <div class="cost-section-title"><h1>造价档案</h1></div>
            <div class="cost-section-body">
              <div class="cost-form-grid cost-archive-fields">
                <label>项目名称<input :value="project.name" readonly /></label>
                <label>当前阶段<select v-model="project.stage"><option v-for="stage in projectStages" :key="stage">{{ stage }}</option></select></label>
                <label>合同金额（元）<input :value="project.contractAmount || ''" type="number" min="0" max="999999999999" step="0.01" placeholder="待录入" @input="setContractAmount" @blur="resetInvalidAmount" /></label>
              </div>
              <div class="cost-subsection">
                <h2>造价台账</h2>
                <div class="cost-shortcuts cost-archive-shortcuts">
                  <button v-for="kind in ledgerKinds" :key="kind" type="button" @click="openLedger(kind)"><span>{{ ledgerLabels[kind] }}</span><strong>{{ ledgerCounts[kind] }}</strong><ArrowUpRight :size="14" aria-hidden="true" /></button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="section === 'model'">
            <div class="cost-section-title"><h1>模型配置</h1><button class="cost-button cost-primary" type="button" @click="openBuilding()"><Plus :size="15" aria-hidden="true" />添加楼栋</button></div>
            <div class="cost-section-body">
              <p class="cost-section-note">按楼栋的层数和建筑面积生成体量示意。</p>
              <div v-if="project.buildings.length" class="cost-table-wrap">
                <table class="cost-table">
                  <thead><tr><th>楼栋</th><th>层数</th><th>建筑面积</th><th>操作</th></tr></thead>
                  <tbody><tr v-for="item in project.buildings" :key="item.id" :class="{ 'is-highlighted': highlightedId === item.id }">
                    <th scope="row">{{ item.name }}</th><td>{{ item.floors }} 层</td><td>{{ numberFormat.format(item.area) }} m²</td>
                    <td><button class="cost-text-button" type="button" @click="openBuilding(item)">编辑</button></td>
                  </tr></tbody>
                </table>
              </div>
              <div v-else class="cost-empty"><Box :size="25" aria-hidden="true" /><p>暂无楼栋</p></div>
              <button v-if="project.buildings.length" class="cost-button cost-accent cost-preview-button" type="button" @click="navigate('overview')">查看体量预览 <ArrowUpRight :size="14" aria-hidden="true" /></button>
            </div>
          </template>

          <template v-else-if="section === 'ledger'">
            <div class="cost-section-title"><h1>工作台</h1><button class="cost-button cost-primary" type="button" @click="openEntry()"><Plus :size="15" aria-hidden="true" />新增记录</button></div>
            <div class="cost-section-body">
              <div class="cost-ledger-nav" role="group" aria-label="切换台账">
                <button v-for="kind in ledgerKinds" :key="kind" type="button" :aria-pressed="ledger === kind" @click="openLedger(kind)">{{ ledgerLabels[kind] }} <span>{{ ledgerCounts[kind] }}</span></button>
              </div>
              <div v-if="entries.length" class="cost-table-wrap">
                <table class="cost-table">
                  <thead><tr><th>项目名称</th><th>数量</th><th>单价</th><th>金额</th><th>日期</th><th>操作</th></tr></thead>
                  <tbody><tr v-for="item in entries" :key="item.id" :class="{ 'is-highlighted': highlightedId === item.id }">
                    <th scope="row">{{ item.title }}</th><td>{{ numberFormat.format(item.quantity) }} {{ item.unit }}</td>
                    <td>{{ formatCny(item.unitPrice) }}</td><td>{{ formatCny(calculateLineAmount(item)) }}</td><td>{{ item.date }}</td>
                    <td><button class="cost-text-button" type="button" @click="openEntry(item)">编辑</button></td>
                  </tr></tbody>
                  <tfoot><tr><th scope="row" colspan="3">合计</th><td colspan="3">{{ formatCny(ledgerTotal) }}</td></tr></tfoot>
                </table>
              </div>
              <div v-else class="cost-empty"><ClipboardList :size="25" aria-hidden="true" /><p>暂无{{ ledgerLabels[ledger] }}记录</p></div>
            </div>
          </template>

          <template v-else-if="section === 'calculator'">
            <div class="cost-section-title"><h1>计算台</h1><button class="cost-button" type="button" @click="openLedger('calculation')">计算记录 <ArrowUpRight :size="14" aria-hidden="true" /></button></div>
            <div class="cost-section-body">
              <form class="cost-calculator" @submit.prevent="recordCalculation">
                <h2>工程量计价</h2>
                <label>计算名称<input v-model="calculation.title" required maxlength="80" placeholder="例如 地坪工程计价" /></label>
                <div class="cost-form-grid">
                  <label>工程量<input v-model.number="calculation.quantity" type="number" required min="0.0001" max="999999999" step="any" /></label>
                  <label>单位<input v-model="calculation.unit" required maxlength="12" /></label>
                  <label>综合单价（元）<input v-model.number="calculation.unitPrice" type="number" required min="0" max="999999999" step="0.01" /></label>
                </div>
                <div class="cost-calculation-result"><span>工程量 × 综合单价</span><output>{{ formatCny(calculationAmount) }}</output></div>
                <button class="cost-button cost-primary" type="submit" :disabled="!calculation.title.trim() || !(calculation.quantity > 0)">写入计算记录</button>
              </form>
            </div>
          </template>

          <template v-else-if="section === 'attachments'">
            <div class="cost-section-title"><h1>附件库</h1><button class="cost-button cost-primary" type="button" :disabled="uploading" @click="attachmentInput?.click()"><Upload :size="15" aria-hidden="true" />上传附件</button></div>
            <div class="cost-section-body">
              <input ref="attachmentInput" type="file" hidden @change="uploadAttachment" />
              <p class="cost-section-note">单个附件限 512 KB。保存更改后可在本浏览器中再次打开。</p>
              <ul v-if="project.attachments.length" class="cost-attachments">
                <li v-for="item in project.attachments" :key="item.id" :class="{ 'is-highlighted': highlightedId === item.id }">
                  <Paperclip :size="18" aria-hidden="true" />
                  <div><strong>{{ item.name }}</strong><small>{{ numberFormat.format(item.size / 1024) }} KB</small></div>
                  <a class="cost-button" :href="item.data" :download="item.name"><Download :size="15" aria-hidden="true" />下载</a>
                </li>
              </ul>
              <div v-else class="cost-empty"><Paperclip :size="25" aria-hidden="true" /><p>暂无项目附件</p></div>
            </div>
          </template>
        </div>

        <aside v-if="assistantOpen && project && section !== 'projects'" class="cost-assistant" aria-label="项目 AI 助手">
          <div class="cost-assistant-heading"><Sparkles :size="17" aria-hidden="true" /><h2>AI 助手</h2><button class="cost-icon-button" type="button" aria-label="关闭 AI 助手" @click="assistantOpen = false"><X :size="17" aria-hidden="true" /></button></div>
          <p class="cost-assistant-context">{{ project.name }} <span>本地演示</span></p>
          <WorkbenchAssistantSelect :fallback-label="assistantFallback" class="cost-assistant-select" />
          <div class="cost-assistant-actions">
            <button v-for="prompt in prompts" :key="prompt.id" type="button" :aria-pressed="assistantAction?.id === prompt.id" @click="runAssistant(prompt.id)">{{ prompt.label }} <ArrowUpRight :size="14" aria-hidden="true" /></button>
          </div>
          <div v-if="assistantResult" class="cost-assistant-result" role="status">
            <strong>{{ assistantAction?.author }}</strong><br />{{ assistantResult }}
          </div>
        </aside>
      </div>

      <footer class="cost-footer">
        <span role="status">{{ dirty ? '有未保存更改' : '已保存' }} <small>· 可按 Ctrl / ⌘ + S 保存</small></span>
        <div>
          <button class="cost-button cost-save" type="button" :disabled="!dirty || uploading" @click="save">保存更改</button>
          <button class="cost-button" type="button" :disabled="!dirty || uploading" @click="undo">撤销</button>
        </div>
      </footer>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialog ? dialogTitles[dialog] : ''" width="min(500px, calc(100vw - 28px))" append-to-body>
      <form v-if="dialog === 'create' || dialog === 'rename'" class="cost-dialog-form" @submit.prevent="submitProject">
        <label>项目名称<input v-model="projectName" required maxlength="60" /></label>
        <div class="cost-dialog-actions"><button class="cost-button" type="button" @click="dialog = undefined">取消</button><button class="cost-button cost-primary" type="submit" :disabled="!projectName.trim()">确定</button></div>
      </form>
      <form v-else-if="dialog === 'building'" class="cost-dialog-form" @submit.prevent="submitBuilding">
        <label>楼栋名称<input v-model="buildingDraft.name" required maxlength="40" /></label>
        <div class="cost-form-grid">
          <label>层数<input v-model.number="buildingDraft.floors" type="number" required min="1" max="80" step="1" /></label>
          <label>建筑面积（m²）<input v-model.number="buildingDraft.area" type="number" required min="0.01" max="1000000" step="0.01" /></label>
        </div>
        <div class="cost-dialog-actions"><button class="cost-button" type="button" @click="dialog = undefined">取消</button><button class="cost-button cost-primary" type="submit">应用</button></div>
      </form>
      <form v-else-if="dialog === 'entry'" class="cost-dialog-form" @submit.prevent="submitEntry">
        <label>记录名称<input v-model="entryDraft.title" required maxlength="80" /></label>
        <div class="cost-form-grid">
          <label>数量<input v-model.number="entryDraft.quantity" type="number" required min="0.0001" max="999999999" step="any" /></label>
          <label>单位<input v-model="entryDraft.unit" required maxlength="12" /></label>
          <label>单价（元）<input v-model.number="entryDraft.unitPrice" type="number" required :min="entryDraft.kind === 'change' ? -999999999 : 0" max="999999999" step="0.01" /></label>
          <label>日期<input v-model="entryDraft.date" type="date" required /></label>
        </div>
        <div class="cost-dialog-actions"><button class="cost-button" type="button" @click="dialog = undefined">取消</button><button class="cost-button cost-primary" type="submit">应用</button></div>
      </form>
      <div v-else-if="dialog === 'search'" class="cost-dialog-form">
        <label>搜索台账、楼栋和附件<input v-model="searchText" type="search" /></label>
        <div v-if="searchResults.length" class="cost-search-results">
          <button v-for="item in searchResults" :key="item.id" type="button" @click="openSearchResult(item)"><span>{{ item.title }}</span><small>{{ item.label }}</small><ArrowUpRight :size="14" aria-hidden="true" /></button>
        </div>
        <p v-else-if="searchText.trim()" class="cost-section-note">没有找到匹配记录</p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped src="./cost-workbench.css"></style>

<style scoped>
.cost-assistant-select { margin-bottom: 8px; }
</style>
