<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Document, Grid, MagicStick, Search } from '@element-plus/icons-vue'
import { DraftingCompass, FileSearch } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import CostWorkbench from '@/components/CostWorkbench.vue'
import EtDesignWorkbench from '@/components/EtDesignWorkbench.vue'
import ProjectWorkbench from '@/components/ProjectWorkbench.vue'
import TenderWorkbench from '@/components/TenderWorkbench.vue'
import TradeWorkbench from '@/components/TradeWorkbench.vue'
import WorkbenchAssistantSelect from '@/components/WorkbenchAssistantSelect.vue'
import { nowIso, usePlatformStore } from '@/stores/platform'
import { DESIGN_STUDIO_WORKBENCH_ID } from '@/stores/designStudio'
import { PROJECT_WORKBENCH_ID } from '@/stores/projectWorkbench'
import { ET_DESIGN_WORKBENCH_ID } from '@/stores/sample'
import { TENDER_WORKBENCH_ID } from '@/stores/tenderSample'
import { COST_WORKBENCH_ID, TRADE_WORKBENCH_ID } from '@/stores/workbenchScenarios'
import { provideWorkbenchAssistant } from '@/workbenchAssistant'

const DesignStudioWorkbench = defineAsyncComponent(() => import('@/components/DesignStudioWorkbench.vue'))
const store = usePlatformStore()
const route = useRoute()
const router = useRouter()
const statuses = ['待处理', '处理中', '已完成'] as const
type RecordStatus = typeof statuses[number]

const workbenchId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const workbench = computed(() => store.visibleWorkbenches.find(item => item.id === workbenchId.value))
const { assistant } = provideWorkbenchAssistant(workbench)
const record = computed(() => workbench.value?.records.find(item => item.id === route.query.record))
const isDesignCanvas = computed(() => workbench.value?.id === ET_DESIGN_WORKBENCH_ID && !record.value)
const isDesignStudio = computed(() => workbench.value?.id === DESIGN_STUDIO_WORKBENCH_ID)
const isCostWorkbench = computed(() => workbench.value?.id === COST_WORKBENCH_ID)
const isTradeWorkbench = computed(() => workbench.value?.id === TRADE_WORKBENCH_ID)
const isProjectWorkbench = computed(() => workbench.value?.id === PROJECT_WORKBENCH_ID)
const searchText = ref('')
const statusFilter = ref<RecordStatus | ''>('')
const categoryFilter = ref('')
const categories = computed(() => [...new Set(workbench.value?.records.map(item => item.category).filter(Boolean) ?? [])])
const filteredRecords = computed(() => {
  const query = searchText.value.trim().toLocaleLowerCase()
  return (workbench.value?.records ?? []).filter(item =>
    (!statusFilter.value || item.status === statusFilter.value)
    && (!categoryFilter.value || item.category === categoryFilter.value)
    && (!query || [item.title, item.category, item.id, item.detail].some(field => field.toLocaleLowerCase().includes(query))))
})

const formatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : formatter.format(date)
}

function workbenchIcon(icon: string) {
  const key = icon.toLowerCase()
  if (key.includes('design') || key.includes('brush') || key.includes('pen') || key.includes('设计')) return DraftingCompass
  if (key === 'file-search') return FileSearch
  if (key.includes('document') || key.includes('file')) return Document
  return Grid
}

function showRecord(id: string) {
  if (!workbench.value?.records.some(item => item.id === id)) return
  void router.replace({ name: 'workbench', params: { id: workbench.value.id }, query: { record: id } })
}

function closeRecord() {
  if (workbench.value) void router.replace({ name: 'workbench', params: { id: workbench.value.id } })
}

function changeStatus(value: RecordStatus, id = record.value?.id) {
  if (!workbench.value || !id || !statuses.includes(value)) return
  const editableRecord = workbench.value.records.find(item => item.id === id)
  if (!editableRecord || editableRecord.status === value) return
  editableRecord.status = value
  editableRecord.updatedAt = nowIso()
  ElMessage.success('已更新记录状态')
}

function openAssistant(id = record.value?.id) {
  if (!workbench.value?.records.some(item => item.id === id)) return
  void router.push({
    path: '/work/chat',
    query: { workbench: workbench.value.id, record: id, assistant: assistant.value?.id },
  })
}

watch([workbenchId, () => store.currentUser?.id], () => {
  searchText.value = ''
  statusFilter.value = ''
  categoryFilter.value = ''
})
</script>

<template>
  <section class="page workbench-page" :class="{ 'design-page': isDesignCanvas, 'cost-page': isCostWorkbench }">
    <template v-if="workbench">
      <header v-if="!isCostWorkbench && !isTradeWorkbench && !isDesignStudio && !isProjectWorkbench" class="page-header">
        <div class="workbench-heading">
          <span class="app-icon" :style="{ '--app-color': workbench.color }">
            <el-icon><component :is="workbenchIcon(workbench.icon)" /></el-icon>
          </span>
          <div>
            <h1>{{ workbench.name }}</h1>
            <p class="muted">{{ workbench.description }}</p>
          </div>
        </div>
      </header>

      <EtDesignWorkbench v-if="isDesignCanvas" />
      <DesignStudioWorkbench v-else-if="isDesignStudio" :key="store.currentUser.id" :user-id="store.currentUser.id" />
      <CostWorkbench v-else-if="isCostWorkbench" />
      <TenderWorkbench v-else-if="workbench.id === TENDER_WORKBENCH_ID" :key="store.currentUser.id" :user-id="store.currentUser.id" />
      <TradeWorkbench v-else-if="isTradeWorkbench" />
      <ProjectWorkbench v-else-if="isProjectWorkbench" :key="store.currentUser.id" :user-id="store.currentUser.id" />
      <div v-else class="records-layout" :class="{ 'has-detail': record }">
        <section class="panel records-panel" aria-label="业务记录">
          <div class="records-header">
            <div>
              <h2 class="section-title">业务记录</h2>
              <span class="record-count">{{ filteredRecords.length }} 条记录</span>
            </div>
            <div class="record-filters">
              <el-input v-model="searchText" :prefix-icon="Search" placeholder="搜索业务记录" aria-label="搜索业务记录" clearable />
              <el-select v-model="statusFilter" aria-label="按状态筛选" placeholder="全部状态" clearable>
                <el-option v-for="status in statuses" :key="status" :label="status" :value="status" />
              </el-select>
              <el-select v-if="categories.length > 1" v-model="categoryFilter" aria-label="按分类筛选" placeholder="全部分类" clearable>
                <el-option v-for="category in categories" :key="category" :label="category" :value="category" />
              </el-select>
            </div>
          </div>

          <div v-if="filteredRecords.length" class="records-table-wrap">
            <table class="records-table">
              <thead><tr><th scope="col">记录</th><th scope="col">分类</th><th scope="col">状态</th><th scope="col">最近更新</th></tr></thead>
              <tbody>
                <tr
                  v-for="item in filteredRecords"
                  :key="item.id"
                  :class="{ 'record-selected': item.id === record?.id }"
                  @click="showRecord(item.id)"
                >
                  <th scope="row">
                    <button type="button" class="record-link" :aria-current="item.id === record?.id ? 'true' : undefined" @click.stop="showRecord(item.id)">
                      {{ item.title }}
                    </button>
                  </th>
                  <td>{{ item.category || '—' }}</td>
                  <td>
                    <el-tag
                      size="small"
                      :type="item.status === '已完成' ? 'success' : item.status === '处理中' ? 'primary' : 'warning'"
                    >{{ item.status }}</el-tag>
                  </td>
                  <td><time :datetime="item.updatedAt">{{ formatDate(item.updatedAt) }}</time></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="workbench-empty">
            <el-icon><Search /></el-icon>
            <p>{{ workbench.records.length ? '没有符合条件的记录。' : '此工作台暂无业务记录。' }}</p>
          </div>
        </section>

        <aside v-if="record" class="panel record-details" aria-label="记录详情">
          <div class="record-detail-bar">
            <h2 class="section-title">记录详情</h2>
            <el-button :icon="Close" circle text aria-label="关闭记录详情" @click="closeRecord" />
          </div>
          <h3>{{ record.title }}</h3>
          <dl class="record-fields">
            <div><dt>记录编号</dt><dd>{{ record.id }}</dd></div>
            <div><dt>分类</dt><dd>{{ record.category || '—' }}</dd></div>
            <div><dt>最近更新</dt><dd>{{ formatDate(record.updatedAt) }}</dd></div>
            <div>
              <dt><label for="record-status">状态</label></dt>
              <dd>
                <el-select id="record-status" :model-value="record.status" @change="changeStatus">
                  <el-option v-for="status in statuses" :key="status" :label="status" :value="status" />
                </el-select>
              </dd>
            </div>
          </dl>
          <div class="record-description">{{ record.detail || '暂无记录详情。' }}</div>
          <div class="record-assistant-actions">
            <WorkbenchAssistantSelect fallback-label="默认助理" />
            <el-button type="primary" :icon="MagicStick" @click="openAssistant()">用所选助理处理</el-button>
          </div>
        </aside>
      </div>
    </template>

    <template v-else>
      <header class="page-header"><h1>工作台</h1></header>
      <div class="panel workbench-empty">
        <el-icon aria-hidden="true"><Grid /></el-icon>
        <h2>{{ workbenchId ? '此工作台未向当前账号开放' : '暂无可用工作台' }}</h2>
      </div>
    </template>
  </section>
</template>

<style scoped>
.workbench-page { width: 100%; }
.cost-page { min-width: 0; }
.design-page .page-header { margin-bottom: 14px; }
.design-page .page-header h1 { margin-bottom: 3px; font-size: clamp(21px, 2.5vw, 26px); }
.design-page .page-header p { font-size: 13px; }
.app-icon {
  display: grid; place-items: center; flex: 0 0 auto; width: 46px; height: 46px; border-radius: 10px;
  color: var(--app-color, var(--accent)); background: #edf2ff; font-size: 22px;
  background: color-mix(in srgb, var(--app-color, var(--accent)) 12%, white);
}
.workbench-heading { display: flex; align-items: center; gap: 13px; }
.records-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.records-layout.has-detail { grid-template-columns: minmax(0, 1fr) minmax(230px, 300px); }
.records-panel { min-width: 0; overflow: hidden; }
.records-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 15px; }
.records-header > div:first-child { display: flex; align-items: baseline; gap: 8px; }
.records-header .section-title { margin: 0; }
.record-count { color: var(--muted); font-size: 12px; }
.record-filters { display: flex; flex-wrap: wrap; gap: 7px; }
.record-filters .el-input { width: min(180px, 100%); }
.record-filters .el-select { width: 108px; }
.records-table-wrap { overflow-x: auto; }
.records-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.records-table th, .records-table td { padding: 10px 13px; border-top: 1px solid var(--line); }
.records-table thead th { background: var(--soft); color: var(--muted); font-size: 12px; font-weight: 600; white-space: nowrap; }
.records-table td { color: var(--muted); white-space: nowrap; }
.records-table tbody tr { cursor: pointer; }
.records-table tbody tr:hover, .records-table tbody .record-selected { background: #edf2ff; }
.record-link { padding: 0; border: 0; background: transparent; color: var(--text); text-align: left; font: inherit; font-weight: 650; cursor: pointer; }
.record-link:hover, .record-link[aria-current="true"] { color: var(--accent); }
.record-details { min-width: 0; padding: 14px; }
.record-detail-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.record-detail-bar .section-title { margin: 0; }
.record-details h3 { margin: 8px 0 13px; font-size: 16px; overflow-wrap: anywhere; }
.record-fields { display: grid; gap: 9px; margin: 0; font-size: 13px; }
.record-fields > div { display: grid; align-items: center; grid-template-columns: 66px minmax(0, 1fr); gap: 9px; }
.record-fields dt { color: var(--muted); }
.record-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.record-description { margin: 14px 0; border-top: 1px solid var(--line); padding: 13px 0 2px; color: var(--muted); font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-assistant-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.workbench-empty { display: grid; place-items: center; gap: 7px; padding: 36px 15px; text-align: center; }
.workbench-empty .el-icon { color: var(--accent); font-size: 25px; }
.workbench-empty h2 { margin: 0; font-size: 15px; }
@media (max-width: 1020px) {
  .records-layout.has-detail { grid-template-columns: minmax(0, 1fr); }
  .record-details { order: -1; }
}
</style>
