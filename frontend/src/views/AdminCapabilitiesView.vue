<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowUpRight, BookOpen, Bot, Cpu, LayoutGrid, Plug, Search, Sparkles, Wrench,
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { adminCatalogs, adminCapabilityLink, type AdminCatalogName } from '@/adminCatalogs'
import { useOrganizationAdminStore, type AdminCapability, type AdminConnection } from '@/stores/organizationAdmin'
import { usePlatformStore } from '@/stores/platform'

const route = useRoute()
const router = useRouter()
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const isAdmin = computed(() => platform.currentUser.role === 'admin')

const typeIcons = {
  组织助理: Sparkles, 数字员工: Bot, 工作台: LayoutGrid, 模型: Cpu,
  技能: Wrench, MCP: Plug, 知识: BookOpen, 工具: Wrench,
}
const connectionTypes: Partial<Record<AdminCapability['type'], AdminConnection['type']>> = {
  模型: '模型', MCP: 'MCP', 工作台: '业务系统',
}

const search = ref('')
const statusFilter = ref('')
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
const listLink = computed(() => ({
  name: catalogName.value,
  params: { id: '' },
  query: route.query.type !== undefined || catalogName.value === 'admin-resources'
    ? { type: route.query.type }
    : { type: selected.value?.type === '组织助理' ? '组织助理' : undefined },
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
const availableConfigurators = computed(() => platform.users.filter(member => member.id !== selected.value?.maintainerId
  && (member.status !== 'disabled' || selected.value?.configuratorIds.includes(member.id))))
const developmentLink = computed(() => {
  const item = selected.value
  if (!item || !organization.canConfigureCapability(item.id)) return undefined
  if (item.type === '组织助理') return { path: '/work/assistants/manage', query: { assistant: item.id } }
  if (item.type === '数字员工') return { path: '/employees/manage/' + encodeURIComponent(item.id) }
  if (item.type !== '工作台') return { path: '/work/resources/manage/' + encodeURIComponent(item.id) }
})

function memberName(id?: string) {
  return platform.users.find(member => member.id === id)?.name
}

function employeeRole(id: string) {
  return platform.employees.find(employee => employee.id === id)?.role
}

function selectType(type: AdminCapability['type'] | '') {
  void router.replace({ ...listLink.value, query: { type: type || undefined } })
}

function displayStatus(item: AdminCapability) {
  if (!item.availableVersions.length) return '待发布'
  return item.enabled ? '已启用' : '已停用'
}

function hasConnectionIssue(item: AdminCapability) {
  return !!item.availableVersions.length && !item.ready
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

watch(() => route.params.id, () => { activationOpen.value = false })
watch(catalogName, () => {
  search.value = ''
  statusFilter.value = ''
})
watch(newPairedMemberCount, count => { if (!count) includePair.value = true })
watch([selected, () => platform.currentUser.id], ([item, userId], [previous, previousUserId]) => {
  const changedItem = item?.id !== previous?.id || userId !== previousUserId
  if (changedItem || item?.memberIds.join() !== previous?.memberIds.join()) memberDraft.value = [...(item?.memberIds ?? [])]
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

function saveMembers() {
  if (!selected.value) return
  if (organization.setCapabilityMembers(selected.value.id, memberDraft.value, includePair.value && newPairedMemberCount.value > 0)) {
    includePair.value = true
    ElMessage.success('已更新使用授权')
  } else {
    ElMessage.error('授权保存失败，请刷新后重试')
  }
}

function savePair() {
  if (!selected.value) return
  if (organization.setCapabilityPair(selected.value.id, pairDraft.value)) ElMessage.success('已更新配套关系')
  else ElMessage.error('配套关系保存失败，请刷新后重试')
}

function saveMaintainer() {
  if (!selected.value) return
  if (organization.setCapabilityMaintainer(selected.value.id, maintainerDraft.value)) ElMessage.success('已更新负责人')
  else ElMessage.error('负责人保存失败，请刷新后重试')
}

function saveConfigurators() {
  if (!selected.value) return
  if (organization.setEmployeeConfigurators(selected.value.id, configuratorDraft.value)) ElMessage.success('已更新共同负责人')
  else ElMessage.error('共同负责人保存失败，请刷新后重试')
}

function savePublishers() {
  if (!selected.value) return
  if (organization.setCapabilityPublishers(selected.value.id, publisherDraft.value)) ElMessage.success('已更新发布权限')
  else ElMessage.error('发布权限保存失败，请刷新后重试')
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
  <div class="page capabilities-page">
    <el-empty v-if="!isAdmin" class="panel" description="当前账号没有管理权限" />
    <template v-else-if="!route.params.id">
      <header class="page-header">
        <div>
          <h1>{{ catalog.title }}</h1>
          <p>{{ catalog.description }}</p>
        </div>
        <RouterLink v-if="catalogName === 'admin-employees'" :to="{ name: 'employee-management', params: { id: '' }, query: { create: '1' } }" class="capability-link">
          新建数字员工 <ArrowUpRight :size="14" />
        </RouterLink>
      </header>
      <section :aria-label="`${catalog.title}目录`">
        <div class="list-toolbar">
          <div v-if="typeOptions.length > 1" class="type-tabs" role="group" :aria-label="`${catalog.title}分类`">
            <button v-if="catalogName === 'admin-resources'" type="button" :aria-pressed="!typeFilter" @click="selectType('')">全部</button>
            <button v-for="type in typeOptions" :key="type" type="button" :aria-pressed="typeFilter === type" @click="selectType(type)">
              {{ type }}
            </button>
          </div>
          <div class="list-filters">
            <el-input v-model="search" :prefix-icon="Search" placeholder="搜索名称、说明或负责人" :aria-label="`搜索${catalog.title}`" clearable />
            <el-select v-model="statusFilter" placeholder="全部状态" aria-label="状态筛选" clearable>
              <el-option v-for="status in ['已启用', '已停用', '待发布', '接入未就绪']" :key="status" :label="status" :value="status" />
            </el-select>
          </div>
        </div>
        <ul v-if="filtered.length" class="capability-grid">
          <li v-for="item in filtered" :key="item.id">
            <RouterLink class="panel capability-card" :to="{ ...adminCapabilityLink(item), query: { type: route.query.type } }" :aria-label="`查看${item.name}详情`">
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
              <dl class="capability-card-metrics">
                <div><dt>生效版本</dt><dd>{{ item.version ?? '—' }}</dd></div>
                <div><dt>授权成员</dt><dd>{{ item.memberIds.length ? item.memberIds.length + ' 人' : '未分配' }}</dd></div>
                <div>
                  <dt>近 7 天用量 · 演示</dt>
                  <dd v-if="item.usage">{{ item.usage.value }} <small>{{ item.usage.label }}</small></dd>
                  <dd v-else>暂无数据</dd>
                </div>
              </dl>
              <div class="capability-card-footer">
                <span v-if="hasConnectionIssue(item)" class="status-note">接入未就绪</span>
                <span class="capability-link">查看详情 <ArrowUpRight :size="14" aria-hidden="true" /></span>
              </div>
            </RouterLink>
          </li>
        </ul>
        <el-empty v-else class="panel" description="没有符合条件的记录" :image-size="84" />
      </section>
    </template>
    <template v-else-if="selected">
      <RouterLink :to="listLink" class="back-link"><ArrowLeft :size="15" /> 返回{{ catalog.title }}</RouterLink>
      <header class="page-header detail-header">
        <div class="detail-name">
          <span class="capability-icon" :data-type="selected.type" aria-hidden="true">
            <component :is="typeIcons[selected.type]" :size="22" />
          </span>
          <div>
            <div class="detail-title">
              <h1>{{ selected.name }}</h1>
              <el-tag size="small" type="info" effect="plain">{{ selected.type }}</el-tag>
            </div>
            <p v-if="selected.description">{{ selected.description }}</p>
          </div>
        </div>
        <div class="detail-links">
          <RouterLink v-if="developmentLink" class="capability-link" :to="developmentLink">
            前往工作门户配置 <ArrowUpRight :size="14" />
          </RouterLink>
          <RouterLink v-if="selected.type === '数字员工' && developmentLink" class="capability-link" :to="{ ...developmentLink, query: { tab: 'automation-runs' } }">
            查看运行记录 <ArrowUpRight :size="14" />
          </RouterLink>
          <RouterLink class="capability-link" :to="{ path: '/admin/changes', query: { target: selected.name } }">
            查看变更记录 <ArrowUpRight :size="14" />
          </RouterLink>
        </div>
      </header>

      <dl class="panel detail-overview">
        <div>
          <dt>组织启用</dt>
          <dd>
            <el-tag size="small" :type="statusTone(selected)">{{ displayStatus(selected) }}</el-tag>
            <span v-if="hasConnectionIssue(selected)" class="status-note">接入未就绪</span>
          </dd>
        </div>
        <div><dt>生效版本</dt><dd>{{ selected.version ?? '—' }}</dd></div>
        <div><dt>授权成员</dt><dd>{{ affectedMembers.length }} 人</dd></div>
        <div>
          <dt>近 7 天用量 <span class="muted">演示</span></dt>
          <dd v-if="selected.usage">{{ selected.usage.value }} <small>{{ selected.usage.label }}</small></dd>
          <dd v-else class="muted">暂无数据</dd>
        </div>
      </dl>

      <div class="detail-grid">
        <section class="panel detail-card" aria-labelledby="capability-member-title">
          <div class="card-heading">
            <h2 id="capability-member-title">{{ selected.type === '数字员工' ? '服务范围与负责人' : '授权与负责人' }}</h2>
            <span class="muted">{{ affectedMembers.length }} 人</span>
          </div>
          <el-form label-position="top" @submit.prevent="saveMembers">
            <el-form-item label="授权成员">
              <el-select v-model="memberDraft" multiple filterable clearable placeholder="按姓名或部门选择成员" aria-label="授权成员">
                <el-option v-for="member in platform.users" :key="member.id" :label="`${member.name} · ${member.department}`" :value="member.id" />
              </el-select>
            </el-form-item>
            <el-checkbox v-if="paired && newPairedMemberCount" v-model="includePair" class="paired-grant">
              同时分配「{{ paired.name }}」<span class="muted"> · {{ newPairedMemberCount }} 人</span>
            </el-checkbox>
            <div class="form-actions">
              <el-button type="primary" native-type="submit" :disabled="!differentMembers(memberDraft, selected.memberIds)">保存授权</el-button>
            </div>
          </el-form>
          <div class="card-divider"></div>
          <el-form label-position="top" @submit.prevent="saveMaintainer">
            <el-form-item :label="selected.type === '数字员工' ? '主要负责人' : '维护负责人'">
              <el-select v-model="maintainerDraft" filterable clearable :value-on-clear="''" placeholder="选择负责人" :aria-label="selected.type === '数字员工' ? '主要负责人' : '维护负责人'">
                <el-option v-for="member in platform.users" :key="member.id" :label="`${member.name} · ${member.department}`" :value="member.id" />
              </el-select>
            </el-form-item>
            <div class="form-actions">
              <el-button native-type="submit" :disabled="maintainerDraft === (selected.maintainerId ?? '')">保存负责人</el-button>
            </div>
          </el-form>
          <template v-if="selected.type === '数字员工'">
            <div class="card-divider"></div>
            <el-form label-position="top" @submit.prevent="saveConfigurators">
              <el-form-item label="共同负责人">
                <el-select v-model="configuratorDraft" multiple filterable clearable placeholder="选择可共同配置和培训的成员" aria-label="共同负责人">
                  <el-option v-for="member in availableConfigurators" :key="member.id" :label="`${member.name} · ${member.department}`" :value="member.id" />
                </el-select>
              </el-form-item>
              <div class="form-actions">
                <el-button native-type="submit" :disabled="!differentMembers(configuratorDraft, selected.configuratorIds)">保存共同负责人</el-button>
              </div>
            </el-form>
          </template>
          <template v-if="selected.type !== '工作台'">
            <div class="card-divider"></div>
            <el-form label-position="top" @submit.prevent="savePublishers">
              <el-form-item label="发布权限">
                <el-select v-model="publisherDraft" multiple filterable clearable placeholder="选择有权发布版本的成员" aria-label="发布权限">
                  <el-option v-for="member in platform.users" :key="member.id" :label="`${member.name} · ${member.department}`" :value="member.id" />
                </el-select>
              </el-form-item>
              <div class="form-actions">
                <el-button native-type="submit" :disabled="!differentMembers(publisherDraft, selected.publisherIds ?? [])">保存发布权限</el-button>
              </div>
            </el-form>
          </template>
        </section>

        <section v-if="pairedType" class="panel detail-card" aria-labelledby="capability-pair-title">
          <div class="card-heading">
            <h2 id="capability-pair-title">配套关系</h2>
            <RouterLink v-if="paired" :to="adminCapabilityLink(paired)" class="capability-link">
              {{ paired.name }} <ArrowUpRight :size="14" />
            </RouterLink>
          </div>
          <el-form label-position="top" @submit.prevent="savePair">
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

        <section class="panel detail-card" aria-labelledby="capability-version-title">
          <div class="card-heading"><h2 id="capability-version-title">启停与版本</h2></div>
          <div class="control-row">
            <div>
              <strong>组织启用状态</strong>
              <p class="muted">{{ selected.ready ? '启用后，获授权成员可从工作门户访问。' : displayStatus(selected) === '待发布' ? '有已发布版本后可启用。' : '接入就绪后可启用。' }}</p>
            </div>
            <el-button :disabled="!selected.enabled && !selected.ready" @click="activationOpen = true">
              {{ selected.enabled ? '停用' : '启用' }}
            </el-button>
          </div>
          <div class="card-divider"></div>
          <el-form v-if="selected.availableVersions.length" label-position="top" @submit.prevent="saveVersion">
            <el-form-item label="生效版本">
              <el-select v-model="versionDraft" aria-label="生效版本">
                <el-option v-for="version in selected.availableVersions" :key="version" :label="version" :value="version" />
              </el-select>
            </el-form-item>
            <div class="form-actions">
              <el-button native-type="submit" :disabled="!versionDraft || versionDraft === selected.version">切换版本</el-button>
            </div>
          </el-form>
          <p v-else class="muted empty-note">暂无可用版本。</p>
        </section>

        <section v-if="supportedConnectionType || dependencies.length || dependents.length" class="panel detail-card" aria-labelledby="capability-connection-title">
          <div class="card-heading"><h2 id="capability-connection-title">接入与依赖</h2></div>
          <template v-if="supportedConnectionType">
            <div v-if="linkedConnection" class="connection-row">
              <RouterLink :to="'/admin/connections/' + encodeURIComponent(linkedConnection.id)" class="capability-link">
                {{ linkedConnection.name }} <ArrowUpRight :size="14" />
              </RouterLink>
              <el-tag size="small" :type="linkedConnection.status === '正常' ? 'success' : 'warning'">{{ linkedConnection.status }}</el-tag>
            </div>
            <p v-else class="muted empty-note">尚未关联接入。</p>
            <el-form label-position="top" @submit.prevent="saveConnection">
              <el-form-item label="关联接入">
                <el-select v-model="connectionDraft" clearable :value-on-clear="''" placeholder="选择系统接入" aria-label="关联接入">
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

        <section class="panel detail-card" aria-labelledby="capability-usage-title">
          <div class="card-heading"><h2 id="capability-usage-title">用量</h2><span class="muted">近 7 天 · 演示</span></div>
          <template v-if="selected.usage">
            <p class="usage-value">{{ selected.usage.value }} <span>{{ selected.usage.label }}</span></p>
            <p v-if="selected.usage.detail" class="muted">{{ selected.usage.detail }}</p>
          </template>
          <p v-else class="muted empty-note">暂无用量数据。</p>
        </section>
      </div>

      <el-dialog v-model="activationOpen" :title="`${selected.enabled ? '停用' : '启用'}${selected.type}`" width="480px">
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
    <el-empty v-else class="panel" description="未找到此记录">
      <RouterLink :to="listLink" class="capability-link">返回{{ catalog.title }}</RouterLink>
    </el-empty>
  </div>
</template>

<style scoped>
.capabilities-page { container-type: inline-size; }
.list-toolbar { display: grid; gap: 12px; margin-bottom: 16px; }
.type-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.type-tabs button {
  min-height: 30px;
  padding: 4px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
}
.type-tabs button:hover, .type-tabs button[aria-pressed="true"] { background: var(--soft); color: var(--accent); }
.type-tabs button[aria-pressed="true"] { font-weight: 650; }
.list-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.list-filters .el-input { width: min(100%, 300px); }
.list-filters .el-select { width: 126px; }
.capability-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 265px), 1fr)); gap: 14px;
  list-style: none; margin: 0; padding: 0;
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
.capability-card-metrics dt, .capability-card-metrics small { color: var(--muted); font-size: 11px; }
.capability-card-metrics dd { margin: 4px 0 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.capability-card-metrics small { font-weight: 450; }
.capability-card-footer { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.capability-card-footer .status-note { margin-top: 0; }
.capability-card-footer .capability-link { margin-left: auto; }
.detail-name, .detail-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
.capability-icon {
  display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px;
  border-radius: 8px; background: var(--soft); color: var(--accent);
}
.capability-icon[data-type="知识"], .capability-icon[data-type="工作台"] { background: #eaf6ef; color: #287751; }
.capability-icon[data-type="技能"], .capability-icon[data-type="工具"] { background: #fff2e6; color: #955922; }
.capability-icon[data-type="数字员工"], .capability-icon[data-type="MCP"] { background: #f1edfb; color: #7356b1; }
.name-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.name-text h2 { margin: 0; font-size: 15px; line-height: 1.35; }
.name-text p { margin: 4px 0 0; font-size: 12px; }
.status-note { display: block; margin-top: 4px; color: #955922; font-size: 11px; font-weight: 450; white-space: nowrap; }
.capability-link, .back-link { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
.capability-link:hover, .back-link:hover { color: var(--accent-hover); text-decoration: underline; }
.back-link { margin-bottom: 13px; font-size: 13px; }
.detail-header { align-items: center; margin-bottom: 17px; }
.detail-name .capability-icon { width: 42px; height: 42px; flex-basis: 42px; }
.detail-title { flex-wrap: wrap; }
.detail-title h1 { margin: 0; overflow-wrap: anywhere; }
.detail-name p { margin-top: 3px; }
.detail-links { display: flex; flex-wrap: wrap; gap: 6px 13px; font-size: 13px; white-space: nowrap; }
.detail-overview {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 14px;
}
.detail-overview > div { padding: 12px 15px; border-right: 1px solid var(--line); }
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
  .detail-name .capability-icon { display: none; }
  .detail-header { flex-wrap: wrap; align-items: flex-start; }
  .detail-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-overview > div:nth-child(2) { border-right: 0; }
  .detail-overview > div:nth-child(n+3) { border-top: 1px solid var(--line); }
}
</style>
