<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElTabPane, ElTabs } from 'element-plus'
import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
import { Activity, Bot, ChevronRight } from 'lucide-vue-next'
import EmployeeAutomationPanel from '@/components/EmployeeAutomationPanel.vue'
import { useEmployeePendingTasks } from '@/employeePendingTasks'
import { makeId, usePlatformStore, type Employee, type Resource } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const EmployeeResponsibilityRuns = defineAsyncComponent(() => import('@/components/EmployeeResponsibilityRuns.vue'))

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const { pendingTasks } = useEmployeePendingTasks()
const route = useRoute()
const router = useRouter()
const employeeMode = computed(() => route.name === 'employee-management')
const routeName = computed(() => employeeMode.value ? 'employee-management' : 'resource-management')
const admin = computed(() => platform.currentUser.role === 'admin')
const selectedId = computed(() => String(route.params.id ?? ''))
const fromAdmin = computed(() => employeeMode.value && admin.value && route.query.from === 'admin')
const title = computed(() => employeeMode.value ? selectedId.value ? 'AI 员工配置' : '我的员工分身' : '组织资源维护')
const runtimeMode = computed(() => employeeMode.value && !selectedId.value && route.query.scope === 'runs')
const lifecycleOptions = {
  draft: { label: '草稿', type: 'info' },
  ready: { label: '待启用', type: 'warning' },
  enabled: { label: '已启用', type: 'success' },
  paused: { label: '已停用', type: 'info' },
} as const
type Lifecycle = keyof typeof lifecycleOptions
function lifecycle(status: Employee['status'], hasVersions: boolean): Lifecycle {
  if (status === 'published') return 'enabled'
  if (status === 'paused') return 'paused'
  return hasVersions ? 'ready' : 'draft'
}

const employeeSearch = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => updateEmployeeList({ q: value }),
})
const employeeLifecycle = computed({
  get: () => typeof route.query.lifecycle === 'string' && Object.hasOwn(lifecycleOptions, route.query.lifecycle)
    ? route.query.lifecycle as Lifecycle : '',
  set: (value: Lifecycle | '') => updateEmployeeList({ lifecycle: value }),
})
const employeeListQuery = computed(() => runtimeMode.value ? {} : {
  q: employeeSearch.value || undefined, lifecycle: employeeLifecycle.value || undefined,
})
const responsibleListLocation = computed(() => ({
  name: 'employee-management', params: { id: '' }, query: employeeListQuery.value,
}))
function updateEmployeeList(patch: { q?: string; lifecycle?: Lifecycle | '' }) {
  const filters = { ...employeeListQuery.value, ...patch }
  void router.replace({ ...responsibleListLocation.value, query: {
    q: filters.q || undefined, lifecycle: filters.lifecycle || undefined,
  } })
}
function employeeLocation(id: string, detailTab?: string) {
  return { name: 'employee-management', params: { id }, query: { ...employeeListQuery.value, tab: detailTab } }
}
function runsLocation(employeeId?: string) {
  return { name: 'employee-management', params: { id: '' }, query: { scope: 'runs', employee: employeeId } }
}
const employeeCreation = computed(() => employeeMode.value && admin.value && !selectedId.value && route.query.create === '1')
const employeeBack = computed(() => fromAdmin.value
  ? { name: 'admin-employees', params: { id: selectedId.value } }
  : responsibleListLocation.value)
const employeeGrant = computed(() => organization.myEmployeeMaintenance.get(selectedId.value))
const editable = computed(() => employeeMode.value && !fromAdmin.value
  ? employeeGrant.value?.canConfigure ?? false : organization.canConfigureCapability(selectedId.value))
const canPublish = computed(() => employeeMode.value && !fromAdmin.value
  ? employeeGrant.value?.canPublish ?? false : organization.canPublishCapability(selectedId.value))
const selectedCapability = computed(() => organization.capabilities.find(item => item.id === selectedId.value))
const employee = computed(() => employeeMode.value && (editable.value || canPublish.value)
  ? platform.employees.find(item => item.id === selectedId.value) : undefined)
const resource = computed(() => !employeeMode.value && (editable.value || canPublish.value)
  ? platform.resources.find(item => item.scope === 'organization' && item.id === selectedId.value) : undefined)
const entry = computed(() => employee.value ?? resource.value)
const employeeResponsibles = computed(() => employee.value ? organization.employeeResponsibles(employee.value.id) : [])
const employeeStatus = computed(() => employee.value
  ? lifecycleOptions[lifecycle(employee.value.status, !!selectedCapability.value?.availableVersions.length)] : undefined)
const effectiveVersion = computed(() => employeeMode.value && !selectedCapability.value?.enabled
  ? undefined : selectedCapability.value?.version)
const latestVersion = computed(() => selectedCapability.value?.availableVersions.at(-1))
const historyVersions = computed(() => (selectedCapability.value?.availableVersions ?? [])
  .filter(version => version !== latestVersion.value && version !== effectiveVersion.value).reverse())
const query = ref('')
const tab = ref('configuration')
const createOpen = ref(false)
const draft = reactive({ name: '', role: '', description: '', instructions: '', resourceIds: [] as string[], type: '知识' as Resource['type'] })
const trialSamples = {
  normal: {
    label: '正常样本',
    input: '输入资料完整，按岗位要求检查附件并提交核对结果。',
    expected: '核对输入资料，列出检查结论及依据，并按约定提交结果。',
  },
  handoff: {
    label: '人工接手样本',
    input: '交付材料缺少必要依据，请评估能否继续办理。',
    expected: '标记缺少的资料，暂停交付，转交负责人补充后再继续。',
  },
} as const
const selectedTrialSample = ref<keyof typeof trialSamples>('normal')
const trialInput = ref('')
const trialExpected = ref('')
const trialResult = ref<{ expected: string; output: string; evidence: string }>()
const feedback = ref('')
const types: Resource['type'][] = ['技能', '知识', '工具', '模型', 'MCP']
const pendingCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const task of pendingTasks.value) counts.set(task.employeeId, (counts.get(task.employeeId) ?? 0) + 1)
  return counts
})

const responsibleEmployees = computed(() => {
  const search = employeeSearch.value.trim().toLocaleLowerCase()
  const capabilities = new Map(organization.capabilities.filter(item => item.type === 'AI 员工').map(item => [item.id, item]))
  return platform.employees.flatMap(employee => {
    const grant = organization.myEmployeeMaintenance.get(employee.id)
    const capability = capabilities.get(employee.id)
    if (!capability || !grant) return []

    const members = organization.employeeResponsibles(employee.id)
    if (search && ![employee.name, employee.role, employee.description, ...members.map(member => member.name)]
      .some(value => value.toLocaleLowerCase().includes(search))) return []

    const active = capability.enabled ? capability.version : undefined
    const latest = capability.availableVersions.at(-1)
    const pending = latest !== active ? latest : undefined
    const stage = lifecycle(employee.status, Boolean(latest))
    if (employeeLifecycle.value && stage !== employeeLifecycle.value) return []
    const permissions = [grant.canConfigure ? '配置与培训' : '', grant.canPublish ? '发布版本' : ''].filter(Boolean)
    const status = lifecycleOptions[stage]
    const detail = employeeLocation(employee.id)
    const action = stage === 'enabled'
      ? { label: '查看运行', to: runsLocation(employee.id) }
      : stage === 'ready' || !grant.canConfigure
        ? { label: '查看版本', to: employeeLocation(employee.id, 'versions') }
        : stage === 'paused'
          ? { label: '查看详情', to: detail }
          : employee.instructions.trim()
            ? { label: '开始试用', to: employeeLocation(employee.id, 'trial') }
            : { label: '继续配置', to: detail }
    return [{ employee, members, active, pending, permissions, status, detail, action, todoCount: pendingCounts.value.get(employee.id) ?? 0 }]
  })
})
const resourceList = computed(() => organization.capabilities.filter(item => {
  const matchesType = types.some(type => type === item.type)
  const search = query.value.trim().toLowerCase()
  return matchesType && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id))
    && [item.name, item.description].some(value => value.toLowerCase().includes(search))
}))
const assignableResources = computed(() => platform.resources.filter(item => item.scope === 'organization'
  && (admin.value || platform.visibleResources.some(visible => visible.id === item.id) || draft.resourceIds.includes(item.id))))

function resetDraft() {
  Object.assign(draft, {
    name: entry.value?.name ?? '',
    role: employee.value?.role ?? '',
    description: entry.value?.description ?? '',
    instructions: employee.value?.instructions ?? '',
    resourceIds: [...(employee.value?.resourceIds ?? [])],
    type: resource.value?.type ?? '知识',
  })
}

watch([entry, routeName], () => {
  resetDraft()
  selectTrialSample('normal')
}, { immediate: true })

watch([entry, editable, () => route.query.tab], () => {
  if (!editable.value || route.query.tab === 'versions') tab.value = 'versions'
  else if (employee.value && ['trial', 'automation-runs'].some(value => value === route.query.tab)) tab.value = 'trial'
  else tab.value = 'configuration'
}, { immediate: true })

function create() {
  if (!admin.value) return
  resetDraft()
  createOpen.value = true
}

watch(employeeCreation, (open, wasOpen) => {
  if (open) create()
  else if (wasOpen) createOpen.value = false
}, { immediate: true })

function updateCreateOpen(open: boolean) {
  createOpen.value = open
  if (!open && employeeCreation.value) void router.replace(employeeBack.value)
}

function saveNew() {
  if (!admin.value || !draft.name.trim() || (employeeMode.value && !draft.role.trim())) return
  const id = makeId(employeeMode.value ? 'employee' : 'resource')
  if (employeeMode.value) {
    platform.employees.push({
      id, name: draft.name.trim(), role: draft.role.trim(), description: '', instructions: '',
      ownerId: platform.currentUser.id, publisherIds: [platform.currentUser.id], status: 'draft', allowedUserIds: [], resourceIds: [],
      color: '#315cde', trainingNotes: [],
    })
  } else {
    platform.resources.push({
      id, name: draft.name.trim(), type: draft.type, description: draft.description.trim(), scope: 'organization',
      ownerId: 'org', maintainerId: platform.currentUser.id, status: '停用', allowedUserIds: [], availableVersions: [],
      ...(draft.type === '模型' || draft.type === 'MCP' ? { connectionId: null } : {}),
    })
  }
  ElMessage.success('已创建草稿')
  if (employeeMode.value) {
    const location = {
      name: 'employee-management', params: { id },
      query: fromAdmin.value ? { from: 'admin' } : employeeListQuery.value,
    }
    if (employeeCreation.value) void router.replace(location)
    else {
      createOpen.value = false
      void router.push(location)
    }
  } else {
    createOpen.value = false
    void router.push({ name: 'resource-management', params: { id } })
  }
}

function saveConfiguration() {
  if (!editable.value || !entry.value || !draft.name.trim() || (employee.value && !draft.role.trim())) return false
  organization.prepareCapabilityEdit(selectedId.value)
  entry.value.name = draft.name.trim()
  entry.value.description = draft.description.trim()
  if (employee.value) {
    employee.value.role = draft.role.trim()
    employee.value.instructions = draft.instructions.trim()
    employee.value.resourceIds = draft.resourceIds.filter(id => assignableResources.value.some(item => item.id === id))
  }
  ElMessage.success('配置已保存')
  return true
}

function runTrial() {
  const target = employee.value
  const prompt = trialInput.value.trim()
  if (!editable.value || !target || !prompt) return
  const guidance = target.instructions.trim().split('\n')[0] || '先核对目标、资料和交付要求，再整理待确认项。'
  const previous = [...target.trainingNotes].reverse().find(note => note.startsWith('纠正反馈：'))
  const outcome = selectedTrialSample.value === 'handoff'
    ? '待人工接手。输入缺少必要依据，已记录待补资料，等待业务负责人确认。'
    : '已完成模拟核对。已依据岗位工作方法整理检查结论和交付要点。'
  const output = outcome + '\n' + guidance + (previous ? '\n参考已记录的' + previous : '')
  const expected = trialExpected.value.trim()
  trialResult.value = { expected, output, evidence: prompt }
  target.trainingNotes.push('试用任务：' + prompt + '\n预期结果：' + expected + '\n模拟结果：' + output)
}

function selectTrialSample(sample: keyof typeof trialSamples) {
  selectedTrialSample.value = sample
  trialInput.value = trialSamples[sample].input
  trialExpected.value = trialSamples[sample].expected
  trialResult.value = undefined
  feedback.value = ''
}

function saveFeedback() {
  const note = feedback.value.trim()
  if (!editable.value || !employee.value || !note) return
  employee.value.trainingNotes.push('纠正反馈：' + note)
  feedback.value = ''
  ElMessage.success('已记录纠正反馈')
}

function publish() {
  if (!canPublish.value || !organization.publishCapability(selectedId.value)) {
    ElMessage.warning('当前账号无法发布此版本')
    return
  }
  ElMessage.success('已发布稳定版本，可在管理后台选择启用或更新')
}
</script>

<template>
  <section class="page page-surface page-with-control-inset development-page" :aria-label="entry?.name ?? title">
    <PageHeader v-if="!employeeMode || selectedId || employeeCreation"
      :title="employeeCreation ? '新建 AI 员工' : entry?.name ?? title">
      <template #back>
        <RouterLink class="development-back" :to="employeeMode ? employeeBack : selectedId ? { name: 'resource-management', params: { id: '' } } : '/work/resources'">
          <el-icon><ArrowLeft /></el-icon>{{ employeeMode ? fromAdmin ? '管理后台 · AI 员工' : '我的员工分身' : selectedId ? title : '资源库' }}
        </RouterLink>
      </template>
      <template v-if="employee || (!employeeMode && !selectedId && admin)" #actions>
        <template v-if="employee">
          <el-tag v-if="employeeStatus" :type="employeeStatus.type" effect="light">{{ employeeStatus.label }}</el-tag>
          <el-tag v-if="effectiveVersion" effect="plain">v{{ effectiveVersion }} 生效中</el-tag>
          <RouterLink v-if="employeeGrant" class="responsible-action" :to="runsLocation(employee.id)">
            <Activity :size="15" aria-hidden="true" />查看运行
          </RouterLink>
        </template>
        <el-button v-else type="primary" :icon="Plus" @click="create">新增组织资源</el-button>
      </template>
      <div v-if="!employeeMode && !selectedId" class="page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters">
          <el-input v-model="query" :prefix-icon="Search" placeholder="搜索名称" aria-label="搜索名称" clearable class="development-search" />
        </div>
      </div>
    </PageHeader>
    <PageHeader v-else :title="title">
      <template v-if="admin" #actions>
        <el-button type="primary" :icon="Plus" @click="create">新建 AI 员工</el-button>
      </template>
      <nav class="page-tabs" aria-label="我的员工分身视图">
        <RouterLink :to="responsibleListLocation" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="!runtimeMode ? 'page' : undefined" @click="navigate">
            <Bot :size="16" aria-hidden="true" />员工管理
          </a>
        </RouterLink>
        <RouterLink :to="runtimeMode ? route.fullPath : runsLocation()" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="runtimeMode ? 'page' : undefined" @click="navigate">
            <Activity :size="16" aria-hidden="true" />运行监管
          </a>
        </RouterLink>
      </nav>
      <div v-if="!runtimeMode" class="page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters responsible-list-filters">
          <el-input v-model="employeeSearch" class="responsible-search" :prefix-icon="Search"
            placeholder="搜索员工、岗位或负责人" aria-label="搜索我的员工分身" clearable />
          <select v-model="employeeLifecycle" class="filter-field" aria-label="员工状态">
            <option value="">全部状态</option>
            <option v-for="(status, value) in lifecycleOptions" :key="value" :value="value">{{ status.label }}</option>
          </select>
        </div>
      </div>
    </PageHeader>

    <EmployeeResponsibilityRuns v-if="runtimeMode && !employeeCreation" />
    <section v-else-if="employeeMode && !selectedId && !employeeCreation" class="page-body" aria-label="员工管理">
      <div v-if="responsibleEmployees.length" class="responsible-grid">
        <article v-for="{ employee, members, active, pending, permissions, status, detail, action, todoCount } in responsibleEmployees"
          :key="employee.id" class="panel responsible-card">
          <div class="responsible-identity">
            <span class="responsible-avatar" :style="{ '--employee-color': employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
            <div class="responsible-title">
              <h2>
                <RouterLink class="responsible-name" :to="detail">
                  <span>{{ employee.name }}</span><ChevronRight :size="15" aria-hidden="true" />
                </RouterLink>
              </h2>
              <p>{{ employee.role }}</p>
            </div>
            <el-tag class="responsible-status" :type="status.type" size="small" effect="light">{{ status.label }}</el-tag>
          </div>
          <p v-if="employee.description" class="responsible-description" :title="employee.description">{{ employee.description }}</p>
          <dl class="responsible-summary">
            <div><dt>{{ members.length > 1 ? '共同负责' : '负责人' }}</dt><dd>{{ members.map(member => member.name).join('、') || '—' }}</dd></div>
            <div><dt>我的权限</dt><dd>{{ permissions.join('、') }}</dd></div>
            <div>
              <dt>版本</dt>
              <dd>
                <span v-if="active">v{{ active }} 生效中</span>
                <span v-if="active && pending"> · </span>
                <span v-if="pending">v{{ pending }} {{ employee.status === 'paused' ? '已发布' : '待启用' }}</span>
                <span v-if="!active && !pending">尚未发布</span>
              </dd>
            </div>
          </dl>
          <footer class="responsible-card-footer">
            <RouterLink class="responsible-pending" :class="{ 'has-pending': todoCount > 0 }"
              :to="{ name: 'employee-task-overview', query: { employee: employee.id, scope: 'action' } }"
              :aria-label="`查看${employee.name}的待办，${todoCount} 项`">
              待我处理 <strong>{{ todoCount }}</strong> 项
            </RouterLink>
            <RouterLink class="responsible-action" :to="action.to">{{ action.label }}</RouterLink>
          </footer>
        </article>
      </div>
      <el-empty v-else :description="employeeSearch.trim() || employeeLifecycle ? '没有匹配的 AI 员工' : '暂无负责的 AI 员工'" :image-size="70">
        <el-button v-if="employeeSearch.trim() || employeeLifecycle" text type="primary" @click="updateEmployeeList({ q: '', lifecycle: '' })">清除筛选</el-button>
      </el-empty>
    </section>
    <section v-else-if="!employeeMode && !selectedId" class="page-body" aria-label="负责的对象">
      <RouterLink v-for="item in resourceList" :key="item.id" class="development-row" :to="{ name: routeName, params: { id: item.id } }">
        <div><strong>{{ item.name }}</strong><p class="muted">{{ item.description || item.type }}</p></div>
        <el-tag effect="plain">{{ item.version || '待发布' }}</el-tag>
      </RouterLink>
      <el-empty v-if="!resourceList.length" description="没有符合条件的对象" :image-size="70" />
    </section>

    <section v-else-if="entry" class="page-body">
      <div class="development-record">
        <span class="muted">{{ employee?.role ?? selectedCapability?.type }}</span>
      </div>
      <div v-if="employee" class="development-responsibles">
        <h2 class="section-title">{{ employeeResponsibles.length > 1 ? '共同负责人' : '负责人' }}</h2>
        <ul v-if="employeeResponsibles.length">
          <li v-for="person in employeeResponsibles" :key="person.id">
            <strong>{{ person.name }}</strong>
            <el-tag v-if="person.canConfigure" size="small" effect="plain">配置与培训</el-tag>
            <el-tag v-if="person.canPublish" size="small" effect="plain" type="success">发布版本</el-tag>
          </li>
        </ul>
        <p v-else class="muted">暂无负责人</p>
      </div>
      <ElTabs v-model="tab" class="page-tab-panel">
        <ElTabPane v-if="editable" :label="employee ? '岗位配置' : '配置'" name="configuration">
          <el-form label-position="top" class="development-form" @submit.prevent="saveConfiguration">
            <el-form-item label="名称" required><el-input v-model="draft.name" /></el-form-item>
            <el-form-item v-if="employee" label="岗位职责" required><el-input v-model="draft.role" /></el-form-item>
            <el-form-item label="用途说明"><el-input v-model="draft.description" type="textarea" :rows="3" /></el-form-item>
            <template v-if="employee">
              <el-form-item label="工作方法"><el-input v-model="draft.instructions" type="textarea" :rows="5" /></el-form-item>
              <el-form-item label="组织资源">
                <el-select v-model="draft.resourceIds" multiple filterable>
                  <el-option v-for="item in assignableResources" :key="item.id" :value="item.id" :label="item.name + ' · ' + item.type" />
                </el-select>
              </el-form-item>
            </template>
            <el-button native-type="submit" type="primary">保存配置</el-button>
          </el-form>
          <section v-if="employee" class="development-section">
            <h2 class="section-title">工作规则</h2>
            <EmployeeAutomationPanel :key="employee.id" :employee-id="employee.id" mode="rules" @ran="tab = 'trial'" />
          </section>
        </ElTabPane>
        <ElTabPane v-if="employee && editable" label="试用与培训" name="trial" lazy>
          <div class="trial-samples" role="group" aria-label="试用样本">
            <el-button v-for="(sample, key) in trialSamples" :key="key"
              :type="selectedTrialSample === key ? 'primary' : 'default'" :aria-pressed="selectedTrialSample === key"
              plain @click="selectTrialSample(key)">{{ sample.label }}</el-button>
          </div>
          <el-form label-position="top" class="development-form" @submit.prevent="runTrial">
            <div class="trial-columns">
              <el-form-item label="试用任务">
                <el-input v-model="trialInput" aria-label="试用任务" placeholder="输入一项样例任务" type="textarea" :rows="3" />
              </el-form-item>
              <el-form-item label="预期结果">
                <el-input v-model="trialExpected" aria-label="预期结果" placeholder="填写需要验证的结果" type="textarea" :rows="3" />
              </el-form-item>
            </div>
            <el-button type="primary" native-type="submit" :disabled="!trialInput.trim()">运行模拟试用</el-button>
          </el-form>
          <section v-if="trialResult" class="development-section" aria-label="试用对照">
            <div class="trial-columns" aria-live="polite">
              <div class="development-note"><strong>预期结果</strong><p>{{ trialResult.expected || '未填写预期结果' }}</p></div>
              <div class="development-note"><strong>模拟答复</strong><p>{{ trialResult.output }}</p></div>
            </div>
            <details class="trial-evidence">
              <summary>查看试用依据</summary>
              <p>{{ trialResult.evidence }}</p>
            </details>
            <el-form class="development-form development-trial" @submit.prevent="saveFeedback">
              <el-input v-model="feedback" aria-label="纠正反馈" placeholder="填写纠正意见" />
              <el-button native-type="submit" :disabled="!feedback.trim()">记录反馈</el-button>
            </el-form>
          </section>
          <section class="development-section">
            <h2 class="section-title">试用与反馈记录</h2>
            <div v-if="employee.trainingNotes.length" class="trial-history">
              <p v-for="(note, index) in [...employee.trainingNotes].reverse()" :key="index">{{ note }}</p>
            </div>
            <p v-else class="muted trial-empty">暂无试用或反馈记录。</p>
          </section>
          <section class="development-section">
            <h2 class="section-title">规则试跑记录</h2>
            <EmployeeAutomationPanel :key="employee.id" :employee-id="employee.id" mode="runs" />
          </section>
        </ElTabPane>
        <ElTabPane :label="employee ? '版本管理' : '稳定版本'" name="versions">
          <template v-if="employee">
            <dl class="employee-version-overview">
              <div><dt>当前生效</dt><dd>{{ effectiveVersion ? 'v' + effectiveVersion : '尚未启用' }}</dd></div>
              <div><dt>最新发布</dt><dd>
                {{ latestVersion ? 'v' + latestVersion : '尚未发布' }}
                <el-tag v-if="latestVersion && latestVersion !== effectiveVersion" size="small" type="warning" effect="light">待启用</el-tag>
              </dd></div>
            </dl>
            <div class="responsible-actions version-actions">
              <el-button v-if="canPublish" type="primary" @click="publish">发布已保存的配置</el-button>
              <RouterLink v-if="admin && latestVersion && latestVersion !== effectiveVersion" class="responsible-action"
                :to="{ name: 'admin-employees', params: { id: employee.id } }">前往管理后台启用</RouterLink>
            </div>
            <p v-if="latestVersion && latestVersion !== effectiveVersion" class="muted version-hint">由管理员在后台选择何时启用此版本。</p>
            <section class="development-section">
              <h2 class="section-title">历史版本</h2>
              <div v-if="historyVersions.length" class="development-versions">
                <el-tag v-for="version in historyVersions" :key="version" effect="plain">v{{ version }}</el-tag>
              </div>
              <p v-else class="muted trial-empty">暂无历史版本。</p>
            </section>
          </template>
          <div v-else class="development-form development-trial">
            <p>当前生效版本 · {{ effectiveVersion || '尚未启用' }}</p>
            <div class="development-versions"><el-tag v-for="version in selectedCapability?.availableVersions" :key="version" effect="plain">{{ version }}</el-tag></div>
            <p class="muted">发布会记录一个稳定版本。启用和切换生效版本在管理后台办理。</p>
            <el-button v-if="canPublish" type="primary" @click="publish">发布已保存的配置</el-button>
          </div>
        </ElTabPane>
      </ElTabs>
    </section>
    <el-empty v-else-if="!employeeCreation" description="对象不存在或当前账号无配置权限" />

    <el-dialog :model-value="createOpen" :title="employeeMode ? '新建 AI 员工' : '新增组织资源'" width="min(480px, 94vw)" append-to-body @update:model-value="updateCreateOpen">
      <el-form label-position="top" @submit.prevent="saveNew">
        <el-form-item label="名称" required><el-input v-model="draft.name" /></el-form-item>
        <el-form-item v-if="employeeMode" label="岗位职责" required><el-input v-model="draft.role" /></el-form-item>
        <template v-else>
          <el-form-item label="资源类型"><el-select v-model="draft.type"><el-option v-for="type in types" :key="type" :value="type" :label="type" /></el-select></el-form-item>
          <el-form-item label="用途说明"><el-input v-model="draft.description" type="textarea" /></el-form-item>
        </template>
        <el-button v-if="employeeMode" @click="updateCreateOpen(false)">取消</el-button>
        <el-button type="primary" native-type="submit" :disabled="!draft.name.trim() || (employeeMode && !draft.role.trim())">创建草稿</el-button>
      </el-form>
    </el-dialog>
  </section>
</template>

<style scoped>
.development-back { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); font-size: 13px; }
.responsible-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.responsible-search { width: 215px; max-width: 100%; min-width: 0; }
.responsible-list-filters select { width: 112px; }
.responsible-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(255px, 100%), 1fr)); gap: 14px; }
.responsible-card { display: flex; flex-direction: column; gap: 11px; min-width: 0; padding: 14px; }
.responsible-identity { display: flex; align-items: flex-start; gap: 9px; }
.responsible-avatar {
  display: grid; place-items: center; flex: 0 0 40px; height: 40px; border-radius: 10px;
  color: var(--employee-color, var(--accent)); background: var(--soft);
  background: color-mix(in srgb, var(--employee-color, var(--accent)) 13%, var(--surface));
  font-size: 16px; font-weight: 700;
}
.responsible-title { flex: 1; min-width: 0; }
.responsible-identity h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.responsible-name { display: inline-flex; align-items: center; gap: 4px; }
.responsible-name svg { flex: none; color: var(--muted); }
.responsible-name:hover, .responsible-name:hover svg { color: var(--accent); }
.responsible-identity p { margin: 3px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.responsible-status { flex: none; }
.responsible-description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; margin: 0; overflow: hidden; overflow-wrap: anywhere; color: var(--muted); font-size: 13px; line-height: 1.5; }
.responsible-summary { display: grid; gap: 6px; margin: 0; font-size: 12px; }
.responsible-summary > div { display: grid; grid-template-columns: 4.5em minmax(0, 1fr); gap: 6px; line-height: 1.4; }
.responsible-summary dt { color: var(--muted); }
.responsible-summary dd { margin: 0; overflow-wrap: anywhere; }
.responsible-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 9px; border-top: 1px solid var(--line); }
.responsible-action { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border-radius: 6px; color: var(--accent); font-size: 13px; font-weight: 600; }
.responsible-action:hover { background: var(--soft); }
.responsible-pending { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border-radius: 6px; background: var(--canvas); color: var(--muted); font-size: 12px; font-weight: 600; }
.responsible-pending:hover { text-decoration: underline; }
.responsible-pending.has-pending { background: #fff1dc; color: #825012; }
.development-search { width: 215px; max-width: 100%; min-width: 0; }
.development-record {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 1px solid var(--line); font-size: 13px; overflow-wrap: anywhere;
}
.development-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 4px; border-bottom: 1px solid var(--line); }
.development-row:hover { color: var(--accent); }
.development-row p { margin: 4px 0 0; }
.development-form { max-width: 680px; }
.development-trial { display: grid; justify-items: start; gap: 11px; }
.development-trial p { margin: 0; }
.development-section { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.development-section .section-title { margin: 0 0 10px; font-size: 14px; }
.development-note { padding: 12px; min-width: 0; background: var(--canvas); border-radius: 8px; font-size: 13px; }
.development-note p, .trial-evidence p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0 0; line-height: 1.6; }
.trial-samples { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.trial-samples .el-button { margin-left: 0; }
.trial-columns, .employee-version-overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.trial-evidence { margin: 10px 0; color: var(--muted); font-size: 13px; }
.trial-evidence summary { cursor: pointer; }
.trial-history { display: grid; gap: 8px; }
.trial-history p { margin: 0; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.trial-empty, .version-hint { margin: 8px 0 0; font-size: 13px; }
.employee-version-overview { margin: 0 0 12px; }
.employee-version-overview > div { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
.employee-version-overview dt { color: var(--muted); font-size: 12px; }
.employee-version-overview dd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0 0; font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
.development-responsibles { margin-bottom: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.development-responsibles .section-title { margin-bottom: 8px; }
.development-responsibles ul { display: flex; flex-wrap: wrap; gap: 7px 14px; margin: 0; padding: 0; list-style: none; }
.development-responsibles li { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; font-size: 13px; }
.development-responsibles strong { overflow-wrap: anywhere; }
.development-responsibles p { margin: 0; font-size: 13px; }
.development-versions { display: flex; flex-wrap: wrap; gap: 7px; }
@media (max-width: 550px) {
  .trial-columns { grid-template-columns: minmax(0, 1fr); gap: 7px; }
  .responsible-search, .development-search { flex: 1 1 120px; }
  .responsible-list-filters select { width: 96px; }
}
</style>
