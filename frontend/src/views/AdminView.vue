<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElTabPane, ElTabs } from 'element-plus'
import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
import { Settings2 } from 'lucide-vue-next'
import EmployeeAutomationPanel from '@/components/EmployeeAutomationPanel.vue'
import { makeId, usePlatformStore, type Resource } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const employeeMode = computed(() => route.name === 'employee-management')
const routeName = computed(() => employeeMode.value ? 'employee-management' : 'resource-management')
const admin = computed(() => platform.currentUser.role === 'admin')
const selectedId = computed(() => String(route.params.id ?? ''))
const title = computed(() => employeeMode.value ? selectedId.value ? '数字员工配置' : '我负责的员工' : '组织资源维护')
const employeeSearch = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => {
    void router.replace({ name: 'employee-management', params: { id: '' }, query: { q: value || undefined } })
  },
})
const employeeListQuery = computed(() => ({ q: employeeSearch.value || undefined }))
const responsibleListLocation = computed(() => ({
  name: 'employee-management', params: { id: '' }, query: employeeListQuery.value,
}))
const employeeCreation = computed(() => employeeMode.value && admin.value && !selectedId.value && route.query.create === '1')
const editable = computed(() => organization.canConfigureCapability(selectedId.value))
const canPublish = computed(() => organization.canPublishCapability(selectedId.value))
const selectedCapability = computed(() => organization.capabilities.find(item => item.id === selectedId.value))
const employee = computed(() => employeeMode.value && (editable.value || canPublish.value)
  ? platform.employees.find(item => item.id === selectedId.value) : undefined)
const resource = computed(() => !employeeMode.value && (editable.value || canPublish.value)
  ? platform.resources.find(item => item.scope === 'organization' && item.id === selectedId.value) : undefined)
const entry = computed(() => employee.value ?? resource.value)
const employeeResponsibles = computed(() => employee.value ? organization.employeeResponsibles(employee.value.id) : [])
const employeeStatus = computed(() => {
  if (!employee.value) return
  if (employee.value.status === 'published') return { label: '已启用', type: 'success' } as const
  if (employee.value.status === 'paused') return { label: '已停用', type: 'info' } as const
  if (selectedCapability.value?.availableVersions.length) return { label: '已发布 · 待启用', type: 'warning' } as const
  return { label: '草稿', type: 'info' } as const
})
const effectiveVersion = computed(() => employeeMode.value && !selectedCapability.value?.enabled
  ? undefined : selectedCapability.value?.version)
const query = ref('')
const tab = ref('configuration')
const createOpen = ref(false)
const draft = reactive({ name: '', role: '', description: '', instructions: '', resourceIds: [] as string[], type: '知识' as Resource['type'] })
const trialInput = ref('')
const trialOutput = ref('')
const feedback = ref('')
const types: Resource['type'][] = ['技能', '知识', '工具', '模型', 'MCP']

const responsibleEmployees = computed(() => {
  const search = employeeSearch.value.trim().toLocaleLowerCase()
  const capabilities = new Map(organization.capabilities.filter(item => item.type === '数字员工').map(item => [item.id, item]))
  return platform.employees.flatMap(employee => {
    const capability = capabilities.get(employee.id)
    const editable = organization.canConfigureCapability(employee.id)
    if (!capability || (!editable && !organization.canPublishCapability(employee.id))) return []

    const members = organization.employeeResponsibles(employee.id)
    if (search && ![employee.name, employee.role, employee.description, ...members.map(member => member.name)]
      .some(value => value.toLocaleLowerCase().includes(search))) return []

    const active = capability.enabled ? capability.version : undefined
    const latest = capability.availableVersions.at(-1)
    const pending = latest !== active ? latest : undefined
    return [{ employee, editable, members, active, pending }]
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
const personalTasks = computed(() => platform.tasks.filter(task =>
  task.employeeId === employee.value?.id && task.userId === platform.currentUser.id))

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
  tab.value = employee.value && editable.value && route.query.tab === 'automation-runs'
    ? 'automation-runs' : editable.value ? 'configuration' : 'versions'
  trialInput.value = ''
  trialOutput.value = ''
  feedback.value = ''
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
  if (!open && employeeCreation.value) void router.replace(responsibleListLocation.value)
}

function saveNew() {
  if (!admin.value || !draft.name.trim() || (employeeMode.value && !draft.role.trim())) return
  const id = makeId(employeeMode.value ? 'employee' : 'resource')
  if (employeeMode.value) {
    platform.employees.push({
      id, name: draft.name.trim(), role: draft.role.trim(), description: '', instructions: '',
      ownerId: platform.currentUser.id, status: 'draft', allowedUserIds: [], resourceIds: [],
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
    const location = { name: 'employee-management', params: { id }, query: employeeListQuery.value }
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
  const guidance = draft.instructions.trim().split('\n')[0] || '先核对目标、资料和交付要求，再整理待确认项。'
  const previous = [...target.trainingNotes].reverse().find(note => note.startsWith('纠正反馈：'))
  trialOutput.value = '收到样例「' + prompt + '」。' + guidance + (previous ? '\n参考已记录的' + previous : '')
  target.trainingNotes.push('试用任务：' + prompt + '\n模拟结果：' + trialOutput.value)
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
  <div class="page development-page">
    <RouterLink v-if="!employeeMode || selectedId || employeeCreation" class="development-back" :to="employeeMode ? responsibleListLocation : selectedId ? { name: 'resource-management', params: { id: '' } } : '/work/resources'">
      <el-icon><ArrowLeft /></el-icon>{{ employeeMode ? '我负责的员工' : selectedId ? title : '资源库' }}
    </RouterLink>
    <header v-if="!employeeCreation" class="page-header" :class="{ 'responsible-header': employeeMode && !selectedId }">
      <div>
        <h1>{{ entry?.name ?? title }}</h1>
        <p v-if="entry">{{ selectedCapability?.type }}</p>
        <p v-else-if="employeeMode && !selectedId" aria-live="polite">{{ employeeSearch.trim() ? '找到' : '共' }} {{ responsibleEmployees.length }} 位员工</p>
      </div>
      <el-tag v-if="employeeStatus" :type="employeeStatus.type" effect="plain">{{ employeeStatus.label }}</el-tag>
      <div v-if="employeeMode && !selectedId" class="responsible-actions">
        <el-input v-model="employeeSearch" :prefix-icon="Search" placeholder="搜索员工、岗位或负责人" aria-label="搜索我负责的员工" clearable />
        <el-button v-if="admin" type="primary" :icon="Plus" @click="create">新建数字员工</el-button>
      </div>
      <el-button v-else-if="admin && !employeeMode && !selectedId" type="primary" :icon="Plus" @click="create">新增组织资源</el-button>
    </header>

    <section v-if="employeeMode && !selectedId && !employeeCreation" aria-label="负责的数字员工">
      <div v-if="responsibleEmployees.length" class="responsible-grid">
        <article v-for="{ employee, editable, members, active, pending } in responsibleEmployees" :key="employee.id" class="panel responsible-card">
          <div class="responsible-identity">
            <span class="responsible-avatar" :style="{ '--employee-color': employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
            <div><h2>{{ employee.name }}</h2><p>{{ employee.role }}</p></div>
          </div>
          <p class="responsible-description">{{ employee.description || '暂未填写岗位说明。' }}</p>
          <div class="responsible-versions">
            <el-tag v-if="active" type="success" size="small" effect="light">v{{ active }} 生效中</el-tag>
            <el-tag v-else-if="employee.status === 'paused'" type="info" size="small" effect="light">已停用</el-tag>
            <el-tag v-else-if="!pending" type="info" size="small" effect="light">草稿</el-tag>
            <el-tag v-if="pending" :type="employee.status === 'paused' ? 'info' : 'warning'" size="small" effect="light">
              v{{ pending }} {{ employee.status === 'paused' ? '已发布' : active ? '待启用' : '已发布 · 待启用' }}
            </el-tag>
          </div>
          <p class="responsible-members">
            <span class="muted">{{ members.length > 1 ? '共同负责' : '负责人' }}</span>
            <span>{{ members.length ? members.map(member => member.name).join('、') : '暂无负责人' }}</span>
          </p>
          <RouterLink class="responsible-link" :to="{ name: 'employee-management', params: { id: employee.id }, query: employeeListQuery }" :aria-label="(editable ? '配置员工' : '查看版本') + ' · ' + employee.name">
            <Settings2 :size="15" aria-hidden="true" />{{ editable ? '配置员工' : '查看版本' }}
          </RouterLink>
        </article>
      </div>
      <el-empty v-else class="panel" :description="employeeSearch.trim() ? '没有匹配的数字员工' : '暂无负责的数字员工'" :image-size="70">
        <el-button v-if="employeeSearch.trim()" text type="primary" @click="employeeSearch = ''">清除搜索</el-button>
      </el-empty>
    </section>
    <section v-else-if="!employeeMode && !selectedId" class="panel development-panel" aria-label="负责的对象">
      <el-input v-model="query" :prefix-icon="Search" placeholder="搜索名称" aria-label="搜索名称" clearable class="development-search" />
      <RouterLink v-for="item in resourceList" :key="item.id" class="development-row" :to="{ name: routeName, params: { id: item.id } }">
        <div><strong>{{ item.name }}</strong><p class="muted">{{ item.description || item.type }}</p></div>
        <el-tag effect="plain">{{ item.version || '待发布' }}</el-tag>
      </RouterLink>
      <el-empty v-if="!resourceList.length" description="没有符合条件的对象" :image-size="70" />
    </section>

    <section v-else-if="entry" class="panel development-panel">
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
      <ElTabs v-model="tab">
        <ElTabPane v-if="editable" label="配置" name="configuration">
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
        </ElTabPane>
        <ElTabPane v-if="employee && editable" label="试用与培训" name="trial">
          <form class="development-form development-trial" @submit.prevent="runTrial">
            <el-input v-model="trialInput" aria-label="试用任务" placeholder="输入一项样例任务" type="textarea" :rows="3" />
            <el-button type="primary" native-type="submit" :disabled="!trialInput.trim()">运行模拟试用</el-button>
            <div v-if="trialOutput" class="development-note">
              <strong>模拟答复</strong><p>{{ trialOutput }}</p>
              <el-input v-model="feedback" aria-label="纠正反馈" placeholder="填写纠正意见" />
              <el-button :disabled="!feedback.trim()" @click="saveFeedback">记录反馈</el-button>
            </div>
          </form>
        </ElTabPane>
        <ElTabPane v-if="employee && editable" label="员工工作空间" name="workspace">
          <div class="development-note"><strong>岗位工作方法</strong><p>{{ employee.instructions || '尚未添加工作方法' }}</p></div>
          <h2 class="section-title">培训记录</h2>
          <div v-for="(note, index) in [...employee.trainingNotes].reverse()" :key="index" class="development-note"><p>{{ note }}</p></div>
          <p v-if="!employee.trainingNotes.length" class="muted">暂无培训记录。</p>
          <h2 class="section-title">我的交办记录</h2>
          <RouterLink v-for="task in personalTasks" :key="task.id" class="development-row" :to="{ name: 'employee-task', params: { taskId: task.id } }"><strong>{{ task.title }}</strong><span>{{ task.status }}</span></RouterLink>
          <p v-if="!personalTasks.length" class="muted">暂无交办记录。</p>
        </ElTabPane>
        <ElTabPane v-if="employee && editable" label="工作规则" name="automation-rules" lazy>
          <EmployeeAutomationPanel :key="employee.id" :employee-id="employee.id" mode="rules" @ran="tab = 'automation-runs'" />
        </ElTabPane>
        <ElTabPane v-if="employee && editable" label="运行记录" name="automation-runs" lazy>
          <EmployeeAutomationPanel :key="employee.id" :employee-id="employee.id" mode="runs" />
        </ElTabPane>
        <ElTabPane label="稳定版本" name="versions">
          <div class="development-form development-trial">
            <p>当前生效版本 · {{ effectiveVersion || '尚未启用' }}</p>
            <div class="development-versions"><el-tag v-for="version in selectedCapability?.availableVersions" :key="version" effect="plain">{{ version }}</el-tag></div>
            <p class="muted">发布会记录一个稳定版本。启用和切换生效版本在管理后台办理。</p>
            <el-button v-if="canPublish" type="primary" @click="publish">发布已保存的配置</el-button>
          </div>
        </ElTabPane>
      </ElTabs>
    </section>
    <el-empty v-else-if="!employeeCreation" class="panel" description="对象不存在或当前账号无配置权限" />

    <el-dialog :model-value="createOpen" :title="employeeMode ? '新建数字员工' : '新增组织资源'" width="min(480px, 94vw)" @update:model-value="updateCreateOpen">
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
  </div>
</template>

<style scoped>
.development-back { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 13px; color: var(--accent); font-size: 13px; }
.responsible-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 100%; }
.responsible-actions .el-input { width: 245px; max-width: 100%; }
.responsible-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(255px, 100%), 1fr)); gap: 14px; }
.responsible-card { display: flex; flex-direction: column; min-width: 0; padding: 16px; }
.responsible-identity { display: flex; align-items: center; gap: 10px; }
.responsible-avatar {
  display: grid; place-items: center; flex: 0 0 40px; height: 40px; border-radius: 10px;
  color: var(--employee-color, var(--accent)); background: var(--soft);
  background: color-mix(in srgb, var(--employee-color, var(--accent)) 13%, var(--surface));
  font-size: 16px; font-weight: 700;
}
.responsible-identity h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.responsible-identity p { margin: 3px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.responsible-description { flex: 1; margin: 11px 0; color: var(--muted); line-height: 1.6; font-size: 13px; overflow-wrap: anywhere; }
.responsible-versions { display: flex; flex-wrap: wrap; gap: 6px; }
.responsible-members { display: flex; align-items: baseline; gap: 6px; margin: 8px 0 11px; font-size: 12px; }
.responsible-members > :first-child { flex: 0 0 auto; }
.responsible-members > :last-child { overflow-wrap: anywhere; }
.responsible-link { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; color: var(--accent); background: var(--soft); font-size: 12px; font-weight: 600; }
.responsible-link:hover { text-decoration: underline; }
.development-panel { padding: 16px; }
.development-search { max-width: 340px; margin-bottom: 10px; }
.development-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 4px; border-bottom: 1px solid var(--line); }
.development-row:hover { color: var(--accent); }
.development-row p { margin: 4px 0 0; }
.development-form { max-width: 680px; }
.development-trial { display: grid; justify-items: start; gap: 11px; }
.development-trial p { margin: 0; }
.development-note { width: 100%; padding: 12px; margin-bottom: 13px; background: var(--canvas); border-radius: 8px; }
.development-note p { white-space: pre-wrap; margin: 6px 0; }
.development-note .el-button { margin-top: 8px; }
.development-responsibles { margin-bottom: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.development-responsibles .section-title { margin-bottom: 8px; }
.development-responsibles ul { display: flex; flex-wrap: wrap; gap: 7px 14px; margin: 0; padding: 0; list-style: none; }
.development-responsibles li { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; font-size: 13px; }
.development-responsibles strong { overflow-wrap: anywhere; }
.development-responsibles p { margin: 0; font-size: 13px; }
.development-versions { display: flex; flex-wrap: wrap; gap: 7px; }
@media (max-width: 700px) { .responsible-header { flex-wrap: wrap; } }
@media (max-width: 550px) { .development-page .page-header { flex-wrap: wrap; } .development-panel { padding: 12px; } }
</style>
