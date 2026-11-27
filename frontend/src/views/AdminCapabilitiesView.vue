<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { useAdminListQuery } from '@/adminListQuery'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowUpRight, BookOpen, Bot, Cpu, LayoutGrid, Plug, Search, Sparkles, Wrench,
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { adminCatalogs, adminCapabilityLink, type AdminCatalogName } from '@/adminCatalogs'
import { useOrganizationAdminStore, type AdminCapability, type AdminConnection } from '@/stores/organizationAdmin'
import AdminObjectChanges from '@/components/AdminObjectChanges.vue'
import { useUnsavedChanges } from '@/useUnsavedChanges'
import { usePlatformStore } from '@/stores/platform'

const route = useRoute()
const { field } = useAdminListQuery()
const router = useRouter()
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const isAdmin = computed(() => platform.currentUser.role === 'admin')
const showsUsage = (item: AdminCapability) => organization.canViewRuns && ['工作台', '组织助理', '模型'].includes(item.type)

const typeIcons = {
  组织助理: Sparkles, 'AI 员工': Bot, 工作台: LayoutGrid, 模型: Cpu,
  技能: Wrench, MCP: Plug, 知识: BookOpen, 工具: Wrench,
}
const connectionTypes: Partial<Record<AdminCapability['type'], AdminConnection['type']>> = {
  模型: '模型', MCP: 'MCP', 工作台: '业务系统', 工具: '业务 API',
}

const search = field('q', '')
const statusFilter = field('status', '')
const memberDraft = ref<string[]>([])
const includePair = ref(true)
const pairDraft = ref('')
const maintainerDraft = ref('')
const configuratorDraft = ref<string[]>([])
const publisherDraft = ref<string[]>([])
const versionDraft = ref('')
const connectionDraft = ref('')
const activationOpen = ref(false)

const catalogName = computed(() => route.name as AdminCatalogName)
const catalog = computed(() => adminCatalogs[catalogName.value] ?? adminCatalogs['admin-workbenches'])
const typeOptions = computed<readonly AdminCapability['type'][]>(() => catalog.value.types)
const typeFilter = computed(() => typeOptions.value.find(type => type === route.query.type)
  ?? (catalogName.value === 'admin-resources' ? '' : typeOptions.value[0]))
const selected = computed(() => organization.capabilities.find(item => item.id === route.params.id && typeOptions.value.includes(item.type)))
const isWorkbench = computed(() => selected.value?.type === '工作台')
const workbench = computed(() => isWorkbench.value ? platform.workbenches.find(item => item.id === selected.value?.id) : undefined)
const workbenchDraft = ref({ name: '', description: '', dependencyIds: [] as string[] })
const dependenciesChecked = ref(false)
const authorizationTitle = computed(() => isWorkbench.value ? '使用授权' : isAdmin.value ? '授权与职责' : '职责信息')
const listLink = computed(() => ({
  name: catalogName.value,
  params: { id: '' },
  query: { ...route.query, tab: undefined, returnTo: undefined, type: typeFilter.value || undefined },
}))
const paired = computed(() => organization.capabilities.find(item => item.id === selected.value?.pairedId))
const pairedType = computed(() => selected.value?.type === '工作台' ? '组织助理'
  : selected.value?.type === '组织助理' ? '工作台' : undefined)
const pairOptions = computed(() => organization.capabilities.filter(item => item.type === pairedType.value
  && (!item.pairedId || item.pairedId === selected.value?.id)))
const newPairedMemberCount = computed(() => {
  if (!selected.value || !paired.value) return 0
  const primaryMembers = selected.value.memberIds
  const pairedMembers = paired.value.memberIds
  return memberDraft.value.filter(id => !primaryMembers.includes(id) && !pairedMembers.includes(id)).length
})
const linkedConnection = computed(() => organization.connections.find(connection => connection.id === selected.value?.connectionId))
const supportedConnectionType = computed(() => selected.value && connectionTypes[selected.value.type])
const availableConnections = computed(() => organization.connections.filter(connection => connection.type === supportedConnectionType.value))
const dependencies = computed(() => organization.capabilities.filter(item => selected.value?.dependencyIds.includes(item.id)))
const dependents = computed(() => organization.capabilities.filter(item => selected.value && item.dependencyIds.includes(selected.value.id)))
const affectedMembers = computed(() => platform.users.filter(member => selected.value?.memberIds.includes(member.id)))
const directMemberIds = computed(() => platform.users.filter(member => selected.value
  && organization.directCapabilityIds(member.id).includes(selected.value.id)).map(member => member.id))
const availableConfigurators = computed(() => platform.users.filter(member => member.id !== selected.value?.maintainerId
  && (member.status !== 'disabled' || selected.value?.configuratorIds.includes(member.id))))
const developmentLink = computed(() => {
  const item = selected.value
  if (!item || !organization.canConfigureCapability(item.id) && !organization.canPublishCapability(item.id)) return undefined
  if (item.type === '组织助理') return { path: '/work/assistants/manage', query: { assistant: item.id } }
  if (item.type === 'AI 员工') return { name: 'employee-management', params: { id: item.id }, query: { from: 'admin' } }
  if (item.type === '工作台') return undefined
  return { path: '/work/resources/manage/' + encodeURIComponent(item.id) }
})


const detailTab = computed({
  get: () => ['authorization', 'release', 'dependencies', 'changes', ...(isWorkbench.value ? ['configuration'] : [])].includes(String(route.query.tab)) ? String(route.query.tab) : 'authorization',
  set: tab => { void router.replace({ query: { ...route.query, tab } }) },
})
const detailTabs = computed(() => [
  { id: 'authorization', name: authorizationTitle.value },
  ...(isWorkbench.value ? [{ id: 'configuration', name: '工作台配置' }] : []),
  { id: 'release', name: isWorkbench.value ? '启停' : '启停与版本' },
  { id: 'dependencies', name: '接入与配套' },
  { id: 'changes', name: '变更记录' },
])
const configurationDirty = computed(() => isAdmin.value && !!workbench.value && (
  workbenchDraft.value.name !== workbench.value.name || workbenchDraft.value.description !== workbench.value.description
  || differentMembers(workbenchDraft.value.dependencyIds, workbench.value.dependencyIds ?? [])))
const configurationIssues = computed(() => workbench.value ? organization.workbenchConfigurationIssues(workbench.value.id, workbenchDraft.value.dependencyIds) : [])
const personnelDirty = computed(() => !!selected.value && (
  differentMembers(memberDraft.value, directMemberIds.value) || maintainerDraft.value !== (selected.value.maintainerId ?? '')
  || differentMembers(configuratorDraft.value, selected.value.configuratorIds) || differentMembers(publisherDraft.value, selected.value.publisherIds)))
const dirty = computed(() => !!selected.value && (personnelDirty.value || pairDraft.value !== (selected.value.pairedId ?? '') || connectionDraft.value !== (selected.value.connectionId ?? '') || configurationDirty.value))
useUnsavedChanges(dirty)
const memberOptions = computed(() => platform.users.filter(member => member.status !== 'disabled' || selected.value?.memberIds.includes(member.id)))
const staffOptions = computed(() => platform.users.filter(member => member.status !== 'disabled' || member.id === selected.value?.maintainerId || selected.value?.publisherIds.includes(member.id)))
function resetPersonnel() {
  memberDraft.value = [...directMemberIds.value]
  maintainerDraft.value = selected.value?.maintainerId ?? ''
  configuratorDraft.value = [...(selected.value?.configuratorIds ?? [])]
  publisherDraft.value = [...(selected.value?.publisherIds ?? [])]
}
function savePersonnel() {
  if (!selected.value) return
  if (organization.setCapabilityPersonnel(selected.value.id, { memberIds: [...memberDraft.value], maintainerId: maintainerDraft.value, configuratorIds: [...configuratorDraft.value], publisherIds: [...publisherDraft.value], includePair: includePair.value && newPairedMemberCount.value > 0 })) ElMessage.success(`已保存${authorizationTitle.value}`)
  else ElMessage.error('请核对成员状态和职责分配')
}
const versionOpen = ref(false)

function memberName(id?: string) {
  return platform.users.find(member => member.id === id)?.name
}

function employeeRole(id: string) {
  return platform.employees.find(employee => employee.id === id)?.role
}

function selectType(type: AdminCapability['type'] | '') {
  void router.replace({ ...listLink.value, query: { ...route.query, type: type || undefined } })
}

function displayStatus(item: AdminCapability) {
  if (item.type !== '工作台' && !item.availableVersions.length) return '待发布'
  return item.enabled ? '已启用' : '已停用'
}

function hasConnectionIssue(item: AdminCapability) {
  return (item.type === '工作台' || !!item.availableVersions.length) && !item.ready
}

function linkedPlugins(item: AdminCapability) {
  return organization.plugins.filter(plugin => plugin.capabilityIds.includes(item.id))
}

function versionLabel(item: AdminCapability) {
  return item.type === '工作台' ? linkedPlugins(item).map(plugin => plugin.version).join('、') || '未关联插件' : item.version ?? '—'
}

function statusTone(item: AdminCapability) {
  const status = displayStatus(item)
  if (status === '已启用') return 'success'
  if (status === '已停用') return 'info'
  return 'warning'
}

const filtered = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return organization.capabilities.filter(item => {
    if (!typeOptions.value.includes(item.type)) return false
    if (typeFilter.value && item.type !== typeFilter.value) return false
    if (statusFilter.value === '接入未就绪' && !hasConnectionIssue(item)) return false
    if (statusFilter.value && statusFilter.value !== '接入未就绪' && displayStatus(item) !== statusFilter.value) return false
    const configuratorNames = item.configuratorIds.map(id => memberName(id) ?? '')
    return [item.name, item.description, item.type, employeeRole(item.id) ?? '', memberName(item.maintainerId) ?? '', ...configuratorNames]
      .some(value => value.toLocaleLowerCase().includes(keyword))
  })
})

function differentMembers(draft: string[], saved: string[]) {
  return draft.length !== saved.length || draft.some(id => !saved.includes(id))
}

function resetWorkbenchConfiguration() {
  const item = workbench.value
  workbenchDraft.value = { name: item?.name ?? '', description: item?.description ?? '', dependencyIds: [...(item?.dependencyIds ?? [])] }
  dependenciesChecked.value = false
}

watch(() => [workbench.value?.id, workbench.value?.name, workbench.value?.description, workbench.value?.dependencyIds?.join(), platform.currentUser.id], () => {
  resetWorkbenchConfiguration()
}, { immediate: true })
watch(workbenchDraft, () => { dependenciesChecked.value = false }, { deep: true })

function saveWorkbenchConfiguration() {
  if (!workbench.value) return
  if (organization.saveWorkbenchConfiguration(workbench.value.id, workbenchDraft.value)) {
    resetWorkbenchConfiguration()
    ElMessage.success('工作台配置已保存并生效')
  } else if (workbench.value.status === 'active' && configurationIssues.value.length
    && differentMembers(workbenchDraft.value.dependencyIds, workbench.value.dependencyIds ?? [])) {
    dependenciesChecked.value = true
    ElMessage.error('资源依赖不可用，请检查后再保存')
  } else ElMessage.error('请核对工作台名称、资源依赖和管理权限')
}

watch(() => route.params.id, () => { activationOpen.value = false })

watch(newPairedMemberCount, count => { if (!count) includePair.value = true })
watch([selected, () => platform.currentUser.id, directMemberIds], ([item, userId], [previous, previousUserId]) => {
  const changedItem = item?.id !== previous?.id || userId !== previousUserId
  memberDraft.value = [...directMemberIds.value]
  if (changedItem || item?.pairedId !== previous?.pairedId) {
    pairDraft.value = item?.pairedId ?? ''
    includePair.value = true
  }
  if (changedItem || item?.publisherIds?.join() !== previous?.publisherIds?.join()) publisherDraft.value = [...(item?.publisherIds ?? [])]
  if (changedItem || differentMembers(item?.configuratorIds ?? [], previous?.configuratorIds ?? [])) {
    configuratorDraft.value = [...(item?.configuratorIds ?? [])]
  }
  if (changedItem || item?.maintainerId !== previous?.maintainerId) maintainerDraft.value = item?.maintainerId ?? ''
  if (changedItem || item?.version !== previous?.version) versionDraft.value = item?.version ?? ''
  if (changedItem || item?.connectionId !== previous?.connectionId) connectionDraft.value = item?.connectionId ?? ''
}, { immediate: true })

function savePair() {
  if (!selected.value) return
  if (organization.setCapabilityPair(selected.value.id, pairDraft.value)) ElMessage.success('已更新配套关系')
  else ElMessage.error('配套关系保存失败，请刷新后重试')
}

function saveVersion() {
  if (!selected.value) return
  if (organization.setCapabilityVersion(selected.value.id, versionDraft.value)) ElMessage.success('已切换生效版本')
  else ElMessage.error('当前版本无法切换')
}

function saveConnection() {
  if (!selected.value) return
  if (organization.setCapabilityConnection(selected.value.id, connectionDraft.value)) ElMessage.success('已更新接入关联')
  else ElMessage.error('接入关联保存失败，请刷新后重试')
}

function saveActivation() {
  if (!selected.value) return
  const enabled = !selected.value.enabled
  if (organization.setCapabilityEnabled(selected.value.id, enabled)) {
    activationOpen.value = false
    ElMessage.success(enabled ? '已启用' : '已停用')
  } else {
    ElMessage.error('状态变更失败，请检查发布和接入状态')
  }
}
</script>

<template>
  <div class="page page-surface page-with-control-inset capabilities-page">
    <template v-if="!organization.canViewCapabilities">
      <PageHeader :title="catalog.title" />
      <el-empty description="当前账号没有查看权限" />
    </template>
    <template v-else-if="!route.params.id">
      <section :aria-label="`${catalog.title}目录`">
        <PageHeader :title="catalog.title">
          <template v-if="catalogName === 'admin-employees'" #actions>
            <RouterLink :to="{ name: 'employee-management', params: { id: '' }, query: { from: 'admin', create: '1' } }" class="el-button el-button--primary">
              新建 AI 员工 <ArrowUpRight :size="14" />
            </RouterLink>
          </template>
          <div v-if="typeOptions.length > 1" class="page-tabs" role="group" :aria-label="`${catalog.title}分类`">
            <button v-if="catalogName === 'admin-resources'" class="page-tab" type="button"
              :aria-pressed="!typeFilter" @click="selectType('')">全部</button>
            <button v-for="type in typeOptions" :key="type" class="page-tab" type="button"
              :aria-pressed="typeFilter === type" @click="selectType(type)">
              {{ type }}
            </button>
          </div>
          <div class="page-toolbar page-tab-toolbar">
            <div class="page-toolbar-filters list-filters">
              <el-input v-model="search" :prefix-icon="Search" placeholder="搜索名称、说明或负责人" :aria-label="`搜索${catalog.title}`" clearable />
              <el-select v-model="statusFilter" popper-class="filter-options" placeholder="全部状态" aria-label="状态筛选" clearable>
                <el-option v-for="status in ['已启用', '已停用', ...(typeFilter === '工作台' ? [] : ['待发布']), '接入未就绪']" :key="status" :label="status" :value="status" />
              </el-select>
            </div>
          </div>
        </PageHeader>
        <ul v-if="filtered.length" class="capability-grid page-body">
          <li v-for="item in filtered" :key="item.id">
            <RouterLink class="panel capability-card" :to="{ ...adminCapabilityLink(item), query: { ...route.query, tab: undefined } }" :aria-label="`查看${item.name}详情`">
              <div class="capability-card-top">
                <span class="capability-icon" :data-type="item.type" aria-hidden="true">
                  <component :is="typeIcons[item.type]" :size="18" />
                </span>
                <div class="name-text">
                  <h2>{{ item.name }}</h2>
                  <p class="muted">{{ employeeRole(item.id) || item.type }}<template v-if="memberName(item.maintainerId)"> · {{ memberName(item.maintainerId) }}</template></p>
                </div>
                <el-tag size="small" :type="statusTone(item)" effect="light" disable-transitions>{{ displayStatus(item) }}</el-tag>
              </div>
              <dl class="capability-card-metrics" :class="{ 'without-usage': !showsUsage(item) }">
                <div><dt>{{ item.type === '工作台' ? '插件版本' : '生效版本' }}</dt><dd>{{ versionLabel(item) }}</dd></div>
                <div><dt>授权成员</dt><dd>{{ item.memberIds.length ? item.memberIds.length + ' 人' : '未分配' }}</dd></div>
                <div v-if="showsUsage(item)">
                  <dt>近 7 天用量 · 演示</dt>
                  <dd v-if="item.usage">{{ item.usage.value }} <small>{{ item.usage.label }}</small></dd>
                  <dd v-else>暂无数据</dd>
                </div>
              </dl>
              <div class="capability-card-footer"><span v-if="item.availableVersions.length > 1 && item.availableVersions.at(-1) !== item.version" class="muted">有可用版本更新</span>
                <span v-if="hasConnectionIssue(item)" class="status-note">接入未就绪</span>
                <span class="capability-link">查看详情 <ArrowUpRight :size="14" aria-hidden="true" /></span>
              </div>
            </RouterLink>
          </li>
        </ul>
        <el-empty v-else description="没有符合条件的记录" :image-size="84" />
      </section>
    </template>
    <template v-else-if="selected">
      <PageHeader :title="selected.name">
        <template #back>
          <RouterLink :to="listLink" class="back-link"><ArrowLeft :size="15" aria-hidden="true" /> 返回{{ catalog.title }}</RouterLink>
        </template>
        <template #actions>
          <RouterLink v-if="organization.canViewRuns && ['组织助理', '工作台'].includes(selected.type)" class="capability-link" :to="{ name: 'admin-activity', query: { target: selected.id } }">查看运行</RouterLink><RouterLink v-if="organization.canViewRuns && ['组织助理', '工作台', '模型'].includes(selected.type)" class="capability-link" :to="{ name: 'admin-usage', query: selected.type === '模型' ? { model: selected.id } : { target: selected.id } }">查看用量</RouterLink><RouterLink v-if="typeof route.query.returnTo === 'string' && route.query.returnTo.startsWith('/admin/activity')" class="capability-link" :to="route.query.returnTo">返回运行记录</RouterLink>
          <RouterLink v-if="developmentLink" class="capability-link" :to="developmentLink">
            前往工作门户配置 <ArrowUpRight :size="14" />
          </RouterLink>
          <RouterLink v-if="selected.type === 'AI 员工' && organization.canViewRuns" class="capability-link" :to="{ name: 'admin-scenario-runs', query: { employee: selected.id } }">
            查看运行监管 <ArrowUpRight :size="14" />
          </RouterLink>
          <RouterLink v-if="selected.type === 'AI 员工' && developmentLink" class="capability-link" :to="{ ...developmentLink, query: { ...developmentLink.query, tab: 'automation-runs' } }">
            查看规则试跑 <ArrowUpRight :size="14" />
          </RouterLink>
        </template>
        <nav class="page-tabs" aria-label="能力详情分组">
          <button class="page-tab" v-for="tab in detailTabs" :key="tab.id" type="button" :aria-pressed="detailTab === tab.id" @click="detailTab = tab.id">{{ tab.name }}</button>
        </nav>
      </PageHeader>

      <dl class="panel detail-overview" :class="{ 'without-usage': !showsUsage(selected) }">
        <div class="detail-identity"><dt>类型</dt><dd>{{ selected.type }}</dd></div>
        <div>
          <dt>组织启用</dt>
          <dd>
            <el-tag size="small" :type="statusTone(selected)">{{ displayStatus(selected) }}</el-tag>
            <span v-if="hasConnectionIssue(selected)" class="status-note">接入未就绪</span>
          </dd>
        </div>
        <div><dt>{{ isWorkbench ? '插件版本' : '生效版本' }}</dt><dd>{{ versionLabel(selected) }}</dd></div>
        <div><dt>授权成员</dt><dd>{{ affectedMembers.length }} 人</dd></div>
        <div v-if="showsUsage(selected)">
          <dt>近 7 天用量 <span class="muted">演示</span></dt>
          <dd v-if="selected.usage">{{ selected.usage.value }} <small>{{ selected.usage.label }}</small></dd>
          <dd v-else class="muted">暂无数据</dd>
        </div>
      </dl>

      <div class="detail-grid page-body" :class="{ 'single-section': detailTab !== 'dependencies' }">
        <section v-if="detailTab === 'authorization'" class="panel detail-card personnel-card" aria-labelledby="capability-member-title">
          <h2 id="capability-member-title">{{ authorizationTitle }}</h2>
          <el-form v-if="isAdmin" label-position="top" @submit.prevent="savePersonnel">
            <h3>成员使用权</h3>
            <el-form-item label="直接授权成员">
              <el-select v-model="memberDraft" multiple filterable clearable placeholder="选择成员" aria-label="授权成员">
                <el-option v-for="member in memberOptions" :key="member.id" :label="`${member.name} · ${member.department}`" :value="member.id" :disabled="member.status === 'disabled'" />
              </el-select>
            </el-form-item>
            <p class="muted status-note">角色授予的使用权在角色分配中调整，其他有效来源继续生效。</p>
            <el-checkbox v-if="paired && newPairedMemberCount" v-model="includePair">同时分配「{{ paired.name }}」 · {{ newPairedMemberCount }} 人</el-checkbox>
            <h3 v-if="!isWorkbench">维护与发布职责</h3>
            <div v-if="!isWorkbench" class="admin-form-grid">
              <el-form-item :label="selected.type === 'AI 员工' ? '主要负责人' : '维护负责人'">
                <el-select v-model="maintainerDraft" filterable clearable :value-on-clear="''" aria-label="维护负责人">
                  <el-option v-for="member in staffOptions" :key="member.id" :label="member.name" :value="member.id" :disabled="member.status === 'disabled'" />
                </el-select>
              </el-form-item>
              <el-form-item label="版本发布人员">
                <el-select v-model="publisherDraft" multiple filterable clearable aria-label="发布权限">
                  <el-option v-for="member in staffOptions" :key="member.id" :label="member.name" :value="member.id" :disabled="member.status === 'disabled'" />
                </el-select>
              </el-form-item>
              <el-form-item v-if="selected.type === 'AI 员工'" label="共同负责人" class="full-width">
                <el-select v-model="configuratorDraft" multiple filterable clearable aria-label="共同负责人">
                  <el-option v-for="member in availableConfigurators" :key="member.id" :label="member.name" :value="member.id" :disabled="member.status === 'disabled'" />
                </el-select>
              </el-form-item>
            </div>
            <div class="admin-save-bar"><span>{{ personnelDirty ? '有未保存的修改' : `${authorizationTitle}已保存` }}</span><el-button :disabled="!personnelDirty" @click="resetPersonnel">撤销修改</el-button><el-button type="primary" native-type="submit" :disabled="!personnelDirty">保存{{ authorizationTitle }}</el-button></div>
          </el-form>
          <p v-else-if="isWorkbench" class="muted">工作台由管理员配置和分配使用权。</p>
          <dl v-else class="admin-facts"><div><dt>维护负责人</dt><dd>{{ memberName(selected.maintainerId) || '未设置' }}</dd></div><div><dt>发布人员</dt><dd>{{ selected.publisherIds.map(id => memberName(id)).join('、') || '未设置' }}</dd></div></dl>
          <section v-if="isAdmin" class="effective-members" aria-label="有效授权来源">
            <h3>有效授权成员 · {{ affectedMembers.length }} 人</h3>
            <div v-for="member in affectedMembers" :key="member.id" class="connection-row"><RouterLink :to="{ name: 'admin-members', params: { id: member.id } }">{{ member.name }}</RouterLink><span class="muted">{{ organization.grantSources(member.id, selected.id).join('、') }}{{ member.status === 'disabled' ? ' · 账号已停用' : '' }}</span></div>
            <p v-if="!affectedMembers.length" class="muted">尚未分配成员使用权</p>
          </section>
        </section>

        <section v-if="detailTab === 'configuration' && workbench" class="panel detail-card" aria-labelledby="workbench-configuration-title">
          <h2 id="workbench-configuration-title">工作台配置</h2>
          <p class="muted">保存配置后立即生效，功能版本在「插件接入」中管理。</p>
          <el-form v-if="isAdmin" label-position="top" @submit.prevent="saveWorkbenchConfiguration">
            <el-form-item label="工作台名称" required><el-input v-model="workbenchDraft.name" aria-label="工作台名称" maxlength="60" /></el-form-item>
            <el-form-item label="用途说明"><el-input v-model="workbenchDraft.description" type="textarea" :rows="3" aria-label="工作台用途说明" /></el-form-item>
            <el-form-item label="资源依赖"><el-select v-model="workbenchDraft.dependencyIds" multiple filterable aria-label="工作台资源依赖"><el-option v-for="resource in platform.resources.filter(item => item.scope === 'organization')" :key="resource.id" :value="resource.id" :label="resource.name" /></el-select></el-form-item>
            <div class="admin-save-bar"><span>{{ configurationDirty ? '有未保存的修改，保存后立即生效' : '当前配置已生效' }}</span><el-button :disabled="!configurationDirty" @click="resetWorkbenchConfiguration">撤销修改</el-button><el-button type="primary" native-type="submit" :disabled="!configurationDirty || !workbenchDraft.name.trim()">保存配置</el-button></div>
            <div class="form-actions"><el-button @click="dependenciesChecked = true">检查资源依赖</el-button></div>
            <el-alert v-if="dependenciesChecked" :title="configurationIssues.length ? configurationIssues.join('；') : '资源依赖就绪。'" :type="configurationIssues.length ? 'warning' : 'success'" :closable="false" show-icon />
          </el-form>
          <dl v-else class="admin-facts"><div><dt>工作台名称</dt><dd>{{ selected.name }}</dd></div><div><dt>用途说明</dt><dd>{{ selected.description || '未填写' }}</dd></div></dl>
          <div v-if="platform.visibleWorkbenches.some(item => item.id === selected!.id)" class="form-actions"><RouterLink class="capability-link" :to="{ name: 'workbench', params: { id: selected.id } }">打开当前工作台 <ArrowUpRight :size="14" /></RouterLink></div>
        </section>

        <section v-if="pairedType && detailTab === 'dependencies'" class="panel detail-card" aria-labelledby="capability-pair-title">
          <div class="card-heading">
            <h2 id="capability-pair-title">配套关系</h2>
            <RouterLink v-if="paired" :to="adminCapabilityLink(paired)" class="capability-link">
              {{ paired.name }} <ArrowUpRight :size="14" />
            </RouterLink>
          </div>
          <el-form v-if="isAdmin" label-position="top" @submit.prevent="savePair">
            <el-form-item :label="`配套${pairedType}`">
              <el-select v-model="pairDraft" clearable filterable :value-on-clear="''" placeholder="选择配套项（可选）" :aria-label="`配套${pairedType}`">
                <el-option v-for="item in pairOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
            <div class="form-actions">
              <el-button native-type="submit" :disabled="pairDraft === (selected.pairedId ?? '')">保存配套关系</el-button>
            </div>
          </el-form>
        </section>

        <section v-if="detailTab === 'release'" class="panel detail-card" aria-labelledby="capability-version-title">
          <div class="card-heading"><h2 id="capability-version-title">{{ isWorkbench ? '启停' : '启停与版本' }}</h2></div>
          <div class="control-row">
            <div>
              <strong>组织启用状态</strong>
              <p class="muted">{{ selected.ready ? '启用后，获授权成员可从工作门户访问。' : displayStatus(selected) === '待发布' ? '有已发布版本后可启用。' : '接入就绪后可启用。' }}</p>
            </div>
            <el-button v-if="isAdmin" :disabled="!selected.enabled && !selected.ready" @click="activationOpen = true">
              {{ selected.enabled ? '停用' : '启用' }}
            </el-button>
          </div>
          <template v-if="!isWorkbench">
          <div class="card-divider"></div>
          <el-form v-if="isAdmin && selected.availableVersions.length" label-position="top" @submit.prevent="versionOpen = true">
            <el-form-item label="生效版本">
              <el-select v-model="versionDraft" aria-label="生效版本">
                <el-option v-for="version in selected.availableVersions" :key="version" :label="version" :value="version" />
              </el-select>
            </el-form-item>
            <div class="form-actions">
              <el-button native-type="submit" :disabled="!versionDraft || versionDraft === selected.version">切换版本</el-button>
            </div>
          </el-form>
          <p v-else class="muted empty-note">已发布版本 {{ selected.availableVersions.join('、') || '暂无' }}</p>
          </template>
        </section>

        <section v-if="detailTab === 'dependencies'" class="panel detail-card" aria-labelledby="capability-connection-title">
          <div class="card-heading"><h2 id="capability-connection-title">接入与依赖</h2></div>
          <el-alert v-if="selected.issues.length" :title="selected.issues.join('；')" type="warning" :closable="false" show-icon />
          <div v-for="plugin in linkedPlugins(selected)" :key="plugin.id" class="connection-row"><RouterLink v-if="organization.canManagePlatform" :to="{ name: 'admin-plugins', params: { id: plugin.id } }">{{ plugin.name }} · {{ plugin.version }}</RouterLink><span v-else>{{ plugin.name }} · {{ plugin.version }}</span><el-tag size="small">{{ plugin.enabled ? plugin.loadStatus : '已停用' }}</el-tag></div>
          <template v-if="supportedConnectionType">
            <div v-if="linkedConnection" class="connection-row">
              <RouterLink v-if="organization.canManagePlatform" :to="{ name: 'admin-connections', params: { id: linkedConnection.id }, query: { returnTo: typeof route.query.returnTo === 'string' ? route.query.returnTo : undefined } }" class="capability-link">
                {{ linkedConnection.name }} <ArrowUpRight :size="14" />
              </RouterLink><span v-else>{{ linkedConnection.name }}</span>
              <el-tag size="small" :type="linkedConnection.status === '正常' ? 'success' : 'warning'">{{ linkedConnection.status }}</el-tag>
            </div>
            <p v-else class="muted empty-note">尚未关联接入。</p>
            <el-form v-if="isAdmin" label-position="top" @submit.prevent="saveConnection">
              <el-form-item label="关联接入">
                <el-select v-model="connectionDraft" clearable :value-on-clear="''" placeholder="选择系统连接" aria-label="关联接入">
                  <el-option v-for="connection in availableConnections" :key="connection.id" :label="`${connection.name} · ${connection.status}`" :value="connection.id" />
                </el-select>
              </el-form-item>
              <div class="form-actions">
                <el-button native-type="submit" :disabled="connectionDraft === (selected.connectionId ?? '')">保存关联</el-button>
              </div>
            </el-form>
          </template>
          <dl v-if="dependencies.length || dependents.length" class="dependency-list">
            <template v-if="dependencies.length">
              <dt>依赖的资源</dt>
              <dd>
                <RouterLink v-for="item in dependencies" :key="item.id" :to="adminCapabilityLink(item)" class="capability-link">{{ item.name }}</RouterLink>
              </dd>
            </template>
            <template v-if="dependents.length">
              <dt>使用此资源的能力</dt>
              <dd>
                <RouterLink v-for="item in dependents" :key="item.id" :to="adminCapabilityLink(item)" class="capability-link">{{ item.name }}</RouterLink>
              </dd>
            </template>
          </dl>
        </section>

        <section v-if="detailTab === 'changes'" class="panel detail-card"><AdminObjectChanges :target-id="selected.id" /></section>
      </div>

      <el-dialog v-if="!isWorkbench" v-model="versionOpen" title="切换生效版本" width="min(480px, calc(100vw - 28px))" append-to-body>
        <p>将「{{ selected.name }}」从 {{ selected.version ?? '未生效' }} 切换为 {{ versionDraft }}。</p>
        <p>影响 {{ affectedMembers.length }} 位授权成员及 {{ dependents.length }} 项直接依赖能力。切换前将检查目标版本依赖。</p>
        <template #footer><el-button @click="versionOpen = false">取消</el-button><el-button type="primary" @click="saveVersion(); versionOpen = false">确认切换</el-button></template>
      </el-dialog>
      <el-dialog v-model="activationOpen" :title="`${selected.enabled ? '停用' : '启用'}${selected.type}`" width="min(480px, calc(100vw - 28px))" append-to-body>
        <p class="activation-intro">{{ selected.enabled ? '停用' : '启用' }}「{{ selected.name }}」</p>
        <dl class="impact-list">
          <dt>已授权成员（{{ affectedMembers.length }} 人）</dt>
          <dd>{{ affectedMembers.map(member => member.name).join('、') || '无' }}</dd>
          <template v-if="dependents.length">
            <dt>依赖此资源的能力（{{ dependents.length }} 项）</dt>
            <dd>{{ dependents.map(item => item.name).join('、') }}</dd>
          </template>
        </dl>
        <p v-if="selected.enabled" class="muted">停用后原授权记录保留。</p>
        <template #footer>
          <el-button @click="activationOpen = false">取消</el-button>
          <el-button :type="selected.enabled ? 'danger' : 'primary'" @click="saveActivation">{{ selected.enabled ? '确认停用' : '确认启用' }}</el-button>
        </template>
      </el-dialog>
    </template>
    <template v-else>
      <PageHeader :title="catalog.title" />
      <el-empty description="未找到此记录">
        <RouterLink :to="listLink" class="capability-link">返回{{ catalog.title }}</RouterLink>
      </el-empty>
    </template>
  </div>
</template>

<style scoped>
.effective-members { margin: 12px 0; font-size: 14px; }
.effective-members summary { cursor: pointer; color: var(--accent); }
.single-section { grid-template-columns: 1fr !important; }.personnel-card h3 { font-size: 14px; margin: 22px 0 12px; }.personnel-card .el-select { width: 100%; }
.capabilities-page { container-type: inline-size; }
.list-filters .el-input { width: min(100%, 204px); }
.list-filters .el-select { width: 112px; }
.capability-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 265px), 1fr)); gap: 14px;
  list-style: none; margin: 0;
}
.capability-grid > li { min-width: 0; }
.capability-card {
  display: flex; flex-direction: column; gap: 13px; height: 100%; min-width: 0; padding: 16px;
  transition: border-color .15s, background .15s;
}
.capability-card:hover { border-color: #bdccf5; background: #fcfdff; }
.capability-card-top { display: flex; align-items: flex-start; gap: 9px; }
.capability-card-top .el-tag { flex: none; }
.capability-card-metrics {
  display: grid; grid-template-columns: .85fr .85fr 1.3fr; gap: 8px; margin: auto 0 0;
  padding-top: 11px; border-top: 1px solid var(--line);
}
.capability-card-metrics > div { min-width: 0; }
.capability-card-metrics.without-usage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.capability-card-metrics dt, .capability-card-metrics small { color: var(--muted); font-size: 11px; }
.capability-card-metrics dd { margin: 4px 0 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.capability-card-metrics small { font-weight: 450; }
.capability-card-footer { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.capability-card-footer .status-note { margin-top: 0; }
.capability-card-footer .capability-link { margin-left: auto; }
.capability-icon {
  display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px;
  border-radius: 8px; background: var(--soft); color: var(--accent);
}
.capability-icon[data-type="知识"], .capability-icon[data-type="工作台"] { background: #eaf6ef; color: #287751; }
.capability-icon[data-type="技能"], .capability-icon[data-type="工具"] { background: #fff2e6; color: #955922; }
.capability-icon[data-type="AI 员工"], .capability-icon[data-type="MCP"] { background: #f1edfb; color: #7356b1; }
.name-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.name-text h2 { margin: 0; font-size: 15px; line-height: 1.35; }
.name-text p { margin: 4px 0 0; font-size: 12px; }
.status-note { display: block; margin-top: 4px; color: #955922; font-size: 11px; font-weight: 450; white-space: nowrap; }
.capability-link, .back-link { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
.capability-link:hover, .back-link:hover { color: var(--accent-hover); text-decoration: underline; }
.back-link { font-size: 13px; white-space: nowrap; }
.detail-overview {
  display: grid; grid-template-columns: minmax(0, 1.25fr) repeat(4, minmax(0, 1fr)); margin: var(--page-body-start) var(--page-control-inline) 0;
}
.detail-overview > div { padding: 12px 15px; border-right: 1px solid var(--line); }
.detail-overview.without-usage { grid-template-columns: minmax(0, 1.25fr) repeat(3, minmax(0, 1fr)); }
.detail-overview > div:last-child { border-right: 0; }
.detail-overview dt { color: var(--muted); font-size: 12px; }
.detail-overview dt span { margin-left: 3px; font-size: 11px; }
.detail-overview dd { margin: 5px 0 0; font-weight: 650; overflow-wrap: anywhere; }
.detail-overview small { font-weight: 450; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 14px; }
.detail-card { min-width: 0; padding: 15px; }
.card-heading, .connection-row, .control-row {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
}
.card-heading { margin-bottom: 12px; }
.card-heading h2 { margin: 0; font-size: 16px; }
.card-heading .muted { font-size: 12px; }
.detail-card .el-select { width: 100%; }
.detail-card :deep(.el-form-item) { margin-bottom: 10px; }
.paired-grant { max-width: 100%; height: auto; min-height: 30px; margin: 0 0 8px; white-space: normal; }
.paired-grant :deep(.el-checkbox__label) { overflow-wrap: anywhere; }
.form-actions { display: flex; justify-content: flex-end; }
.card-divider { border-top: 1px solid var(--line); margin: 14px 0; }
.control-row p { margin: 4px 0 0; font-size: 13px; }
.empty-note { margin: 4px 0; }
.connection-row { margin-bottom: 10px; }
.dependency-list { display: grid; gap: 5px; margin: 12px 0 0; }
.dependency-list dt { font-size: 13px; color: var(--muted); }
.dependency-list dd { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 0; }
.usage-value { margin: 0; font-size: 24px; font-weight: 680; }
.usage-value span { color: var(--muted); font-size: 13px; font-weight: 500; }
.activation-intro { margin-top: 0; font-weight: 650; }
.impact-list { padding: 12px; border-radius: 8px; background: var(--canvas); }
.impact-list dd { margin: 3px 0 8px; overflow-wrap: anywhere; }
.impact-list dd:last-child { margin-bottom: 0; }
@container (max-width: 610px) {
  .detail-grid { grid-template-columns: 1fr; }
}
@container (max-width: 460px) {
  .detail-overview, .detail-overview.without-usage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-overview > .detail-identity { grid-column: 1 / -1; }
  .detail-overview > div:nth-child(odd) { border-right: 0; }
  .detail-overview > div:nth-child(n+2) { border-top: 1px solid var(--line); }
}
</style>
