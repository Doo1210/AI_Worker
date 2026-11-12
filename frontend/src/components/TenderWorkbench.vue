<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ClipboardCheck, Download, FileSearch, ListFilter, Printer, Search, Sparkles, Undo2 } from 'lucide-vue-next'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import { useWorkbenchAssistant } from '@/workbenchAssistant'
import {
  findOpportunities, opportunities, screenOpportunity, tenderAnalysis, tenderCategories,
  type TenderCategory, type TenderQuery, type TenderRules,
} from '@/stores/tenderSample'

const props = defineProps<{ userId: string }>()
const { assistant } = useWorkbenchAssistant()
const assistantFallback = '招投标助理'
const stages = [
  { id: 'search', label: '机会查询', icon: Search },
  { id: 'rules', label: '规则初筛', icon: ListFilter },
  { id: 'analysis', label: '智能分析', icon: Sparkles },
  { id: 'review', label: '人工复核', icon: ClipboardCheck },
  { id: 'report', label: '报告交付', icon: Download },
] as const
type Stage = typeof stages[number]['id']
const decisions = ['保留跟进', '暂缓观察', '排除'] as const
interface Review { decision: typeof decisions[number]; note: string }
interface Task {
  query: TenderQuery
  rules?: TenderRules
  analyzed: string[]
  analysisAssistants?: Record<string, string>
  reviews: Record<string, Review>
}
const emptyQuery: TenderQuery = { keyword: '', type: '', region: '', from: '', to: '' }
const storageKey = 'ai-worker-tender-workbench:' + props.userId
function loadTask(): Task {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) return JSON.parse(saved) as Task
  } catch {
    // The example still works when browser storage is unavailable.
  }
  return { query: { ...emptyQuery }, analyzed: [], reviews: {} }
}
const task = ref(loadTask())
const query = ref({ ...task.value.query })
const rules = ref<TenderRules>({ ...(task.value.rules ?? { minBudget: 100, exclude: '维保' }) })
const previewRules = ref<TenderRules>()
const stage = ref<Stage>('search')
const selectedId = ref('')
const categoryFilter = ref<TenderCategory | ''>('')
const reviewFilter = ref<'pending' | 'done'>('pending')
const draftDecision = ref<Review['decision'] | ''>('')
const draftNote = ref('')
const undo = ref<{ id: string; previous?: Review }>()
const report = ref<{ created: string; pending: number; reviewed: number; rows: string[][] }>()
const regions = [...new Set(opportunities.map(item => item.region))]
const records = computed(() => findOpportunities(task.value.query))
const activeRules = computed(() => stage.value === 'rules' && previewRules.value ? previewRules.value : task.value.rules)
const screened = computed(() => records.value.map(item => ({
  item,
  screening: activeRules.value ? screenOpportunity(item, activeRules.value) : undefined,
})))
const eligible = computed(() => task.value.rules ? records.value.filter(item => {
  const { category } = screenOpportunity(item, task.value.rules!)
  return category === '纳入' || category === '观察' || category === '人工复核'
}) : [])
const reviewedCount = computed(() => eligible.value.filter(item => task.value.reviews[item.id]).length)
const pendingCount = computed(() => eligible.value.length - reviewedCount.value)
const remainingAnalysis = computed(() => eligible.value.filter(item => !task.value.analyzed.includes(item.id)))
const visible = computed(() => {
  if (stage.value === 'rules' && categoryFilter.value) return screened.value.filter(row => row.screening?.category === categoryFilter.value)
  if (stage.value === 'analysis' || stage.value === 'review') {
    return screened.value.filter(({ item }) => eligible.value.includes(item)
      && (stage.value === 'analysis' || !!task.value.reviews[item.id] === (reviewFilter.value === 'done')))
  }
  return screened.value
})
const selected = computed(() => visible.value.find(row => row.item.id === selectedId.value) ?? visible.value[0])
const selectedOpportunity = computed(() => selected.value?.item)
const categories = computed(() => tenderCategories.map(category => ({
  category,
  count: screened.value.filter(row => row.screening?.category === category).length,
})))
const reportHeaders = ['编号', '项目', '类型', '地区', '采购或建设单位', '来源日期', '投标截止', '预算或投资（万元）', '初筛分类', '人工复核', '复核备注']
const amountFormat = new Intl.NumberFormat('zh-CN')

watch(task, () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(task.value))
  } catch {
    // Changes remain available in the open workbench.
  }
}, { deep: true })
watch(rules, () => { previewRules.value = undefined; categoryFilter.value = '' }, { deep: true })
watch(selectedOpportunity, item => {
  const review = item ? task.value.reviews[item.id] : undefined
  draftDecision.value = review?.decision ?? ''
  draftNote.value = review?.note ?? ''
}, { immediate: true })
watch(stage, () => { categoryFilter.value = '' })

async function runQuery() {
  if (query.value.from && query.value.to && query.value.from > query.value.to) {
    ElMessage.warning('起始日期应早于或等于结束日期')
    return
  }
  const next = { ...query.value, keyword: query.value.keyword.trim() }
  if (JSON.stringify(next) !== JSON.stringify(task.value.query)) {
    if (task.value.rules) {
      try {
        await ElMessageBox.confirm('重新查询将替换当前结果及初筛、分析和复核记录。', '替换查询结果', { confirmButtonText: '重新查询', cancelButtonText: '取消' })
      } catch {
        return
      }
    }
    task.value = { query: next, analyzed: [], reviews: {} }
    selectedId.value = ''
    previewRules.value = undefined
    undo.value = undefined
    report.value = undefined
  }
  stage.value = 'search'
}

function preview() {
  if (!Number.isFinite(rules.value.minBudget) || rules.value.minBudget < 0) {
    ElMessage.warning('请输入有效的预算门槛')
    return
  }
  previewRules.value = { ...rules.value }
  categoryFilter.value = ''
}

function confirmRules() {
  if (!previewRules.value) return
  task.value.rules = { ...previewRules.value }
  const ids = new Set(eligible.value.map(item => item.id))
  task.value.analyzed = task.value.analyzed.filter(id => ids.has(id))
  if (task.value.analysisAssistants) {
    task.value.analysisAssistants = Object.fromEntries(
      Object.entries(task.value.analysisAssistants).filter(([id]) => ids.has(id)),
    )
  }
  previewRules.value = undefined
  report.value = undefined
  ElMessage.success('初筛规则已确认')
}

function analyze(ids: string[]) {
  const allowed = new Set(remainingAnalysis.value.map(item => item.id))
  const next = [...new Set(ids)].filter(id => allowed.has(id))
  if (!next.length) return
  const name = assistant.value?.name ?? assistantFallback
  task.value.analysisAssistants ??= {}
  for (const id of next) task.value.analysisAssistants[id] = name
  task.value.analyzed.push(...next)
}

function saveReview() {
  const item = selectedOpportunity.value
  if (!item || !draftDecision.value || !eligible.value.includes(item)) return
  undo.value = { id: item.id, previous: task.value.reviews[item.id] }
  task.value.reviews[item.id] = { decision: draftDecision.value, note: draftNote.value.trim() }
  ElMessage.success('复核意见已保存')
}

function undoReview() {
  if (!undo.value) return
  const { id, previous } = undo.value
  if (previous) task.value.reviews[id] = previous
  else delete task.value.reviews[id]
  undo.value = undefined
  reviewFilter.value = previous ? 'done' : 'pending'
  selectedId.value = id
  draftDecision.value = previous?.decision ?? ''
  draftNote.value = previous?.note ?? ''
}

function printReport() {
  window.print()
}

function makeReport() {
  const confirmed = task.value.rules
  if (!confirmed || !records.value.length) return
  report.value = {
    created: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date()),
    pending: pendingCount.value,
    reviewed: reviewedCount.value,
    rows: records.value.map(item => {
      const { category } = screenOpportunity(item, confirmed)
      const review = task.value.reviews[item.id]
      return [item.id, item.title, item.type, item.region, item.buyer, item.published, item.deadline ?? '未披露',
        item.amount?.toString() ?? '未披露', category, review?.decision ?? (eligible.value.includes(item) ? '待复核' : '—'), review?.note ?? '']
    }),
  }
}

function downloadCsv() {
  if (!report.value) return
  const { created, pending, reviewed, rows } = report.value
  const encode = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"'
  const data = [['报告', '招投标机会复核报告（示例）'], ['生成时间', created], ['交付范围', pending ? '部分交付' : '复核完成'],
    ['已复核', String(reviewed)], ['待复核', String(pending)], reportHeaders, ...rows]
  const url = URL.createObjectURL(new Blob(['\ufeff', data.map(row => row.map(encode).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = '招投标机会复核报告.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="scene-layout tender-workbench">
    <nav class="tender-stages" aria-label="招投标流程">
      <button v-for="item in stages" :key="item.id" type="button" :aria-current="stage === item.id ? 'step' : undefined" @click="stage = item.id">
        <component :is="item.icon" :size="17" aria-hidden="true" />{{ item.label }}
      </button>
    </nav>

    <div class="scene-columns">
      <div class="scene-main">
        <form v-if="stage === 'search'" class="scene-panel scene-pad tender-search" @submit.prevent="runQuery">
          <div class="scene-section-heading"><h2>商机检索</h2><span class="scene-chip">示例数据</span></div>
          <div class="tender-query">
            <label class="tender-keyword">关键词<input v-model="query.keyword" placeholder="项目名称、单位或编号" /></label>
            <label>机会类型<select v-model="query.type"><option value="">全部类型</option><option>招标公告</option><option>拟建项目</option></select></label>
            <label>地区<select v-model="query.region"><option value="">全部地区</option><option v-for="region in regions" :key="region">{{ region }}</option></select></label>
            <label>发布起始日期<input v-model="query.from" type="date" /></label>
            <label>发布结束日期<input v-model="query.to" type="date" /></label>
            <button type="submit" class="scene-primary"><Search :size="14" aria-hidden="true" />查询机会</button>
          </div>
        </form>

        <section v-if="stage === 'rules'" class="scene-panel scene-pad">
          <div class="scene-section-heading"><h2>初筛条件</h2><span v-if="task.rules" class="scene-chip good">已有生效规则</span></div>
          <form class="tender-rules" @submit.prevent="preview">
            <label>公告预算门槛（万元）<input v-model.number="rules.minBudget" type="number" min="0" step="any" required /></label>
            <label>标题排除词<input v-model="rules.exclude" placeholder="多个词用逗号分隔" /></label>
            <button class="scene-secondary" type="submit" :disabled="!records.length">预览规则影响</button>
          </form>
          <div v-if="activeRules" class="tender-impact">
            <div class="tender-counts" role="group" aria-label="按初筛分类筛选">
              <button v-for="{ category, count } in categories" :key="category" type="button" :aria-pressed="categoryFilter === category" @click="categoryFilter = categoryFilter === category ? '' : category">
                <strong>{{ count }}</strong>{{ category }}
              </button>
            </div>
            <div v-if="previewRules" class="scene-form-footer"><p>预览结果。确认后才用于分析和复核。</p><button type="button" class="scene-primary" @click="confirmRules">确认初筛规则</button></div>
          </div>
        </section>

        <section v-if="stage === 'report'" class="scene-panel scene-pad">
          <div class="scene-section-heading"><div><h2>交付范围</h2><p>报告包含查询结果、初筛分类和人工复核意见。</p></div></div>
          <dl class="tender-summary">
            <div><dt>查询结果</dt><dd>{{ records.length }}</dd></div>
            <div><dt>已复核</dt><dd>{{ reviewedCount }}</dd></div>
            <div><dt>待复核</dt><dd>{{ pendingCount }}</dd></div>
          </dl>
          <div class="scene-form-footer">
            <p>{{ !task.rules ? '请先确认初筛规则。' : pendingCount ? '还有机会待复核，报告将标记为部分交付。' : '当前范围内无待复核机会。' }}</p>
            <button type="button" class="scene-primary" :disabled="!task.rules || !records.length" @click="makeReport">生成报告</button>
          </div>
        </section>

        <section v-else class="scene-panel tender-results" aria-label="商机结果">
          <div class="scene-section-heading tender-results-head">
            <h2>{{ stage === 'analysis' ? '待分析与已分析机会' : stage === 'review' ? '复核清单' : '查询结果' }}</h2>
            <span class="scene-object-id">{{ visible.length }} 条机会</span>
            <div v-if="stage === 'review'" class="tender-review-filter" role="group" aria-label="复核状态">
              <button type="button" class="scene-secondary" :aria-pressed="reviewFilter === 'pending'" @click="reviewFilter = 'pending'">待复核 {{ pendingCount }}</button>
              <button type="button" class="scene-secondary" :aria-pressed="reviewFilter === 'done'" @click="reviewFilter = 'done'">已复核 {{ reviewedCount }}</button>
              <button v-if="undo" type="button" class="scene-secondary" @click="undoReview"><Undo2 :size="14" aria-hidden="true" />撤销上次复核</button>
            </div>
          </div>
          <div v-if="visible.length">
            <button v-for="{ item, screening } in visible" :key="item.id" type="button" class="tender-record" :aria-current="selectedOpportunity?.id === item.id ? 'true' : undefined" @click="selectedId = item.id">
              <span class="tender-record-main">
                <small>{{ item.type }} · {{ item.region }} · {{ item.id }}</small>
                <strong>{{ item.title }}</strong>
                <small>{{ item.buyer }} · {{ item.deadline ? '截止 ' + item.deadline : '发布 ' + item.published }}</small>
              </span>
              <span class="tender-record-meta">
                <strong>{{ item.amount === undefined ? '金额未披露' : amountFormat.format(item.amount) + ' 万元' }}</strong>
                <span v-if="stage === 'review' && task.reviews[item.id]" class="scene-chip good">{{ task.reviews[item.id].decision }}</span>
                <span v-else-if="stage === 'analysis' && task.analyzed.includes(item.id)" class="scene-chip good">已分析</span>
                <span v-else-if="screening" class="scene-chip" :class="{ good: screening.category === '纳入', warn: screening.category === '人工复核' }">{{ screening.category }}</span>
              </span>
            </button>
          </div>
          <p v-else class="scene-empty">{{ !task.rules && (stage === 'review' || stage === 'analysis') ? '确认初筛规则后，符合条件的机会会出现在这里。' : '当前范围内没有机会。' }}</p>
        </section>
      </div>

      <aside class="scene-panel scene-assistant tender-insight" aria-label="智能处理">
        <div class="scene-assistant-heading"><span class="scene-assistant-icon"><Sparkles :size="18" aria-hidden="true" /></span><h2>{{ stage === 'report' ? '报告快照' : '招投标助理' }}</h2><span class="scene-demo">本地演示</span></div>
        <WorkbenchAssistantSelect v-if="stage !== 'report'" :fallback-label="assistantFallback" />
        <template v-if="stage === 'report'">
          <div v-if="report" class="tender-insight-body">
            <span class="scene-chip" :class="report.pending ? 'warn' : 'good'">{{ report.pending ? '部分交付' : '复核完成' }}</span>
            <p>已生成 {{ report.rows.length }} 条机会，已复核 {{ report.reviewed }} 条，待复核 {{ report.pending }} 条。</p>
            <p class="scene-object-id">{{ report.created }}</p>
            <div class="tender-actions">
              <button class="scene-primary" type="button" @click="downloadCsv"><Download :size="14" aria-hidden="true" />下载 CSV</button>
              <button class="scene-secondary" type="button" @click="printReport"><Printer :size="14" aria-hidden="true" />打印 / 存为 PDF</button>
            </div>
          </div>
          <p v-else class="scene-empty">生成报告后可下载 CSV，或打印为 PDF。</p>
        </template>
        <template v-else-if="selectedOpportunity">
          <p class="scene-context">{{ selectedOpportunity.id }} · {{ selectedOpportunity.type }} · {{ selectedOpportunity.region }}</p>
          <h3>{{ selectedOpportunity.title }}</h3>
          <div class="tender-insight-body">
            <h4>来源摘要</h4>
            <p>{{ selectedOpportunity.scope }}</p>
            <p v-if="selectedOpportunity.requirement">{{ selectedOpportunity.requirement }}</p>
            <p class="scene-object-id">演示资料 · {{ selectedOpportunity.published }} 发布</p>
            <template v-if="selected?.screening"><h4>{{ previewRules && stage === 'rules' ? '规则预览' : '初筛依据' }} · {{ selected.screening.category }}</h4><p>{{ selected.screening.reason }}</p></template>
            <template v-if="stage === 'analysis' || stage === 'review'">
              <h4>智能分析</h4>
              <div v-if="task.analyzed.includes(selectedOpportunity.id)" class="tender-analysis">
                <p v-if="task.analysisAssistants?.[selectedOpportunity.id]" class="scene-object-id">分析助理 · {{ task.analysisAssistants[selectedOpportunity.id] }}</p>
                <p>{{ tenderAnalysis(selectedOpportunity) }}</p>
              </div>
              <button v-else type="button" class="scene-secondary" @click="analyze([selectedOpportunity.id])">分析当前机会</button>
              <button v-if="stage === 'analysis' && remainingAnalysis.length" type="button" class="scene-secondary" @click="analyze(remainingAnalysis.map(item => item.id))">分析剩余 {{ remainingAnalysis.length }} 条</button>
            </template>
            <form v-if="stage === 'review'" class="tender-review" @submit.prevent="saveReview">
              <label>复核结论<select v-model="draftDecision" required><option value="">请选择结论</option><option v-for="item in decisions" :key="item">{{ item }}</option></select></label>
              <label>复核备注<textarea v-model="draftNote" rows="3" maxlength="1000" placeholder="记录核实依据或下一步" /></label>
              <button type="submit" class="scene-primary" :disabled="!draftDecision">保存人工复核</button>
            </form>
            <button v-if="stage === 'search'" type="button" class="scene-secondary" @click="stage = 'rules'"><ListFilter :size="14" aria-hidden="true" />编辑初筛规则</button>
          </div>
        </template>
        <p v-else class="scene-empty"><FileSearch :size="20" aria-hidden="true" /><br />选择一条机会查看详情。</p>
      </aside>
    </div>
    <Teleport to="body">
      <div v-if="report" class="tender-print">
        <h1>招投标机会复核报告（示例）</h1>
        <p>{{ report.created }} · {{ report.pending ? '部分交付' : '复核完成' }} · 已复核 {{ report.reviewed }} 条 · 待复核 {{ report.pending }} 条</p>
        <table><thead><tr><th v-for="heading in reportHeaders" :key="heading">{{ heading }}</th></tr></thead>
          <tbody><tr v-for="row in report.rows" :key="row[0]"><td v-for="(value, index) in row" :key="index">{{ value }}</td></tr></tbody>
        </table>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tender-workbench { --scene-accent: #365a96; --scene-tint: #edf2fb; container-type: inline-size; }
.scene-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .43fr); gap: 14px; align-items: start; }
.scene-main { display: grid; gap: 12px; min-width: 0; }
.scene-panel { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.scene-pad, .scene-assistant { padding: 15px; }
.scene-section-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.scene-section-heading h2, .scene-assistant-heading h2 { margin: 0; font-size: 15px; font-weight: 680; }
.scene-section-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.scene-chip { display: inline-flex; width: max-content; align-items: center; padding: 3px 7px; border-radius: 5px; background: #eef2fa; color: #4e5e7a; font-size: 11px; font-weight: 620; }
.scene-chip.good { background: #e7f5ef; color: #22654d; }
.scene-chip.warn { background: #fff1e1; color: #8a4e12; }
.scene-object-id { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.scene-primary, .scene-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 33px; padding: 6px 10px; border: 1px solid var(--scene-accent); border-radius: 7px; background: var(--scene-accent); color: white; font-size: 12px; font-weight: 620; }
.scene-secondary { border-color: #d8e1f2; background: white; color: var(--scene-accent); }
.scene-secondary:hover { background: var(--scene-tint); }
.scene-primary:not(:disabled):hover { filter: brightness(.92); }
.scene-primary:disabled { border-color: #e1e6f0; background: #e1e6f0; color: #53607a; }
.scene-form-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; }
.scene-form-footer p { margin: 0; color: var(--muted); font-size: 12px; }
.scene-assistant { position: sticky; top: 0; }
.scene-assistant-heading { display: flex; align-items: center; gap: 8px; }
.tender-insight > .workbench-assistant-select { margin-top: 8px; }
.scene-assistant-icon { display: grid; place-items: center; flex: none; width: 31px; height: 31px; border-radius: 8px; background: var(--scene-tint); color: var(--scene-accent); }
.scene-demo { margin-left: auto; color: var(--muted); font-size: 11px; white-space: nowrap; }
.scene-context { margin: 10px 0; padding: 7px 9px; border-radius: 7px; background: #f3f5fa; color: #52617a; font-size: 12px; }
.scene-empty { padding: 15px; color: var(--muted); font-size: 13px; text-align: center; }
.tender-stages { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 13px; }
.tender-stages button { display: flex; align-items: center; gap: 7px; padding: 9px 13px; border: 1px solid var(--line); border-radius: 8px; background: white; color: #53617b; font-size: 13px; font-weight: 650; }
.tender-stages button[aria-current="step"] { border-color: var(--scene-accent); background: var(--scene-accent); color: white; }
.tender-stages button:not([aria-current]):hover { background: var(--scene-tint); }
.tender-query, .tender-rules { display: flex; flex-wrap: wrap; align-items: end; gap: 9px; }
.tender-query label, .tender-rules label, .tender-review label { display: grid; flex: 1 0 110px; gap: 5px; color: var(--muted); font-size: 12px; }
.tender-query .tender-keyword { flex-basis: 170px; }
.tender-query :is(input, select), .tender-rules input, .tender-review :is(select, textarea) { min-width: 0; width: 100%; min-height: 33px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 7px; background: white; color: var(--text); }
.tender-impact { margin-top: 14px; }
.tender-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 6px; }
.tender-counts button { display: grid; gap: 3px; padding: 7px; border: 1px solid var(--line); border-radius: 7px; background: #f6f8fc; color: #51617c; font-size: 12px; }
.tender-counts button[aria-pressed="true"] { border-color: var(--scene-accent); background: var(--scene-tint); }
.tender-counts strong, .tender-summary dd { font-size: 19px; color: var(--text); }
.tender-results-head { margin: 0; padding: 14px; }
.tender-review-filter { display: flex; flex: 0 0 100%; flex-wrap: wrap; gap: 6px; }
.tender-review-filter [aria-pressed="true"] { background: var(--scene-tint); border-color: var(--scene-accent); }
.tender-record { display: flex; width: 100%; justify-content: space-between; gap: 10px; padding: 12px 14px; border: 0; border-top: 1px solid var(--line); border-left: 3px solid transparent; background: white; text-align: left; color: var(--text); }
.tender-record:last-child { border-radius: 0 0 12px 12px; }
.tender-record[aria-current="true"], .tender-record:hover { border-left-color: var(--scene-accent); background: var(--scene-tint); }
.tender-record-main, .tender-record-meta { display: grid; gap: 5px; min-width: 0; }
.tender-record-main small { color: var(--muted); font-size: 11px; }
.tender-record-main strong { font-size: 14px; }
.tender-record-meta { flex: none; justify-items: end; align-content: center; font-size: 12px; }
.tender-insight > h3 { margin: 0; font-size: 15px; }
.tender-insight-body { display: grid; gap: 7px; margin-top: 10px; }
.tender-insight-body h4 { margin: 4px 0 0; font-size: 12px; }
.tender-insight-body p { margin: 0; color: #52617a; font-size: 13px; line-height: 1.65; }
.tender-insight-body .scene-object-id { font-size: 11px; }
.tender-insight-body > button { justify-self: start; }
.tender-analysis { padding: 8px; border-radius: 6px; background: var(--scene-tint); white-space: pre-wrap; }
.tender-analysis .scene-object-id { margin-bottom: 4px; overflow-wrap: anywhere; }
.tender-review { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
.tender-review label { flex-basis: auto; }
.tender-review textarea { resize: vertical; }
.tender-review button { justify-self: start; }
.tender-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0; }
.tender-summary div { padding: 10px; border-radius: 8px; background: var(--scene-tint); }
.tender-summary dt { color: var(--muted); font-size: 12px; }
.tender-summary dd { margin: 3px 0 0; font-weight: 650; }
.tender-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tender-print { display: none; }
@container (max-width: 725px) {
  .scene-columns { grid-template-columns: minmax(0, 1fr); }
  .scene-assistant { position: static; }
}
@container (max-width: 430px) {
  .tender-record { flex-wrap: wrap; }
  .tender-record-meta { display: flex; align-items: center; gap: 8px; }
}
@media print {
  :global(body:has(.tender-print) > :not(.tender-print)) { display: none !important; }
  .tender-print { display: block; page: tender-report; color: #111; font-size: 10px; }
  .tender-print table { width: 100%; border-collapse: collapse; }
  .tender-print :is(td, th) { padding: 4px; border: 1px solid #aaa; overflow-wrap: anywhere; }
  .tender-print tr { break-inside: avoid; }
}
@page tender-report { size: A4 landscape; margin: 12mm; }
</style>
