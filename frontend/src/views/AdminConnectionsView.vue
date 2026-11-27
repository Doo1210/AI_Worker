<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { useAdminListQuery } from '@/adminListQuery'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowUpRight, Cable, Cpu, Pencil, Plus, Power, Search, Server, Zap } from 'lucide-vue-next'
import AdminObjectChanges from '@/components/AdminObjectChanges.vue'
import { useUnsavedChanges } from '@/useUnsavedChanges'
import { connectionCredentialLabel } from '@/adminDependencies'
import { usePlatformStore } from '@/stores/platform'
import { adminCapabilityLink } from '@/adminCatalogs'
import { useOrganizationAdminStore, type AdminConnection } from '@/stores/organizationAdmin'
import { useScenarioTaskStore } from '@/stores/scenarioTasks'

const route = useRoute()
const router = useRouter()
const { field } = useAdminListQuery()
const admin = useOrganizationAdminStore()
const runtime = useScenarioTaskStore()
const platform = usePlatformStore()
const activeMembers = computed(() => platform.users.filter(item => item.status !== 'disabled'))
const types: AdminConnection['type'][] = ['模型', 'MCP', '业务 API', '业务系统', '企业消息']
const statuses: AdminConnection['status'][] = ['正常', '待检测', '异常', '已停用']
const icons = { 模型: Cpu, MCP: Cable, 业务系统: Server, '业务 API': Cable, 企业消息: Server }
const statusType = { 正常: 'success', 待检测: 'warning', 异常: 'danger', 已停用: 'info' } as const
const query = field('q', '')
const typeFilter = field('type', '')
const statusFilter = field('status', '')
const editorOpen = ref(false)
const editingId = ref<string>()
const confirmOpen = ref(false)
const draft = ref<Pick<AdminConnection, 'name' | 'type' | 'endpoint'> & { credentialMode: NonNullable<AdminConnection['credentialMode']>; credentialValue: string; credentialMemberId: string }>({
  name: '', type: '模型', endpoint: '', credentialMode: 'environment', credentialValue: '', credentialMemberId: '',
})
const editorError = ref('')
const detailTab = field('tab', 'overview')
const draftSnapshot = ref('')
const editorDirty = computed(() => editorOpen.value && JSON.stringify(draft.value) !== draftSnapshot.value)
const { beforeClose, confirmDiscard } = useUnsavedChanges(editorDirty)
async function cancelEditor() { if (await confirmDiscard()) editorOpen.value = false }
const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const selected = computed(() => admin.connections.find(connection => connection.id === selectedId.value))
const dependentTasks = computed(() => runtime.adminTasks.filter(task => task.attempts.some(attempt => attempt.connectionId === selectedId.value)))

watch(selectedId, () => {
  editorOpen.value = false
  confirmOpen.value = false
})

const visibleConnections = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return admin.connections.filter(connection =>
    (!typeFilter.value || typeFilter.value === connection.type)
    && (!statusFilter.value || statusFilter.value === connection.status)
    && [connection.name, connection.endpoint].some(value => value.toLocaleLowerCase().includes(keyword)),
  )
})

const directCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const { connectionId } of admin.capabilities) {
    if (connectionId) counts.set(connectionId, (counts.get(connectionId) ?? 0) + 1)
  }
  return counts
})

const affectedCapabilities = computed(() => selected.value ? admin.affectedByConnection(selected.value.id) : [])

const returnTo = computed(() => typeof route.query.returnTo === 'string' && /^\/admin\/(overview|activity|usage)(?:\?|$)/.test(route.query.returnTo) ? route.query.returnTo : '/admin/overview')
watch(() => draft.value.credentialMode, () => { draft.value.credentialValue = '' })
watch(editorOpen, open => { if (!open) draft.value.credentialValue = '' })

const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date)
}

function openEditor(connection?: AdminConnection) {
  editingId.value = connection?.id
  draft.value = {
    name: connection?.name ?? '',
    type: connection?.type ?? '模型',
    endpoint: connection?.endpoint ?? '',
    credentialMode: connection?.credentialMode ?? 'environment', credentialValue: '', credentialMemberId: '',
  }
  editorError.value = ''
  draftSnapshot.value = JSON.stringify(draft.value)
  editorOpen.value = true
}

function save() {
  const fields = { ...draft.value, name: draft.value.name.trim(), endpoint: draft.value.endpoint.trim() }
  if (!fields.name) {
    editorError.value = '请输入连接名称'
    return
  }
  if (!admin.saveConnection(fields, editingId.value)) {
    editorError.value = '保存失败。请检查名称是否重复，地址是否为完整的 HTTP 或 HTTPS 地址。'
    return
  }
  ElMessage.success(editingId.value ? '连接已更新' : '连接已添加')
  editorOpen.value = false
  if (!editingId.value) {
    const created = admin.connections.find(item => item.name === fields.name)
    if (created) void router.push({ name: 'admin-connections', params: { id: created.id }, query: { ...route.query, tab: undefined } })
  }
}

function test(connection: AdminConnection, failed = false) {
  if (admin.testConnection(connection.id, failed)) { if (connection.status === '异常') ElMessage.warning('模拟检测异常，请查看原因与影响范围'); else ElMessage.success('模拟检测通过') }
  else ElMessage.warning('当前连接无法检测')
}

function toggle(connection: AdminConnection) {
  const enabled = connection.status === '已停用'
  if (admin.setConnectionEnabled(connection.id, enabled)) {
    confirmOpen.value = false
    ElMessage.success(enabled ? '连接已启用，可进行模拟检测' : '连接已停用')
  } else {
    ElMessage.warning('连接状态未能更新')
  }
}
</script>

<template>
  <div class="page page-surface page-with-control-inset">
    <PageHeader v-if="selectedId" :title="selected?.name ?? '系统连接'">
      <template #back>
        <RouterLink class="back-link" :to="{ name: 'admin-connections', query: { ...route.query, tab: undefined, returnTo: undefined } }">
          <ArrowLeft :size="16" aria-hidden="true" />返回系统连接
        </RouterLink>
      </template>
      <template v-if="selected" #actions>
        <RouterLink v-if="admin.canViewRuns && route.query.returnTo" class="text-link" :to="returnTo">返回运行监管</RouterLink>
        <el-button :icon="Pencil" @click="openEditor(selected)">编辑连接</el-button>
        <el-button :icon="Zap" type="primary" :disabled="selected.status === '已停用'" @click="test(selected)">模拟检测</el-button>
        <el-dropdown trigger="click"><el-button>更多操作</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="selected.status === '已停用' ? toggle(selected) : confirmOpen = true">{{ selected.status === '已停用' ? '启用连接' : '停用连接' }}</el-dropdown-item><el-dropdown-item divided :disabled="selected.status === '已停用'" @click="test(selected, true)">演示连接异常</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </template>
      <nav v-if="selected" class="page-tabs" aria-label="连接详情分组">
        <button class="page-tab" v-for="tab in [{ id: 'overview', name: '连接与凭据' }, { id: 'impact', name: '影响范围' }, { id: 'checks', name: '检测记录' }, { id: 'changes', name: '变更记录' }]" :key="tab.id" type="button" :aria-pressed="detailTab === tab.id" @click="detailTab = tab.id">{{ tab.name }}</button>
      </nav>
    </PageHeader>

    <div v-if="selected" class="page-body">
      <section v-if="detailTab === 'overview'" class="panel admin-detail-card">
        <el-alert v-if="selected.lastError" :title="selected.lastError" type="warning" :closable="false" show-icon />
        <div class="admin-detail-grid">
          <section><h3>连接信息</h3><dl class="admin-facts">
            <div><dt>连接类型</dt><dd>{{ selected.type }}</dd></div>
            <div><dt>连接地址</dt><dd>{{ selected.endpoint }}</dd></div>
            <div><dt>当前状态</dt><dd><el-tag :type="statusType[selected.status]">{{ selected.status }}</el-tag></dd></div>
            <div><dt>最近检测</dt><dd>{{ selected.lastCheckedAt ? formatDate(selected.lastCheckedAt) : '尚未检测' }}</dd></div>
          </dl></section>
          <section><h3>调用身份与凭据</h3><dl class="admin-facts">
            <div><dt>凭据状态</dt><dd>{{ connectionCredentialLabel(selected) }}</dd></div>
            <div v-if="selected.credentialRef"><dt>凭据引用</dt><dd><details><summary>查看引用标识</summary>{{ selected.credentialRef }}</details></dd></div>
          </dl>
          <template v-if="selected.credentialMode === 'member'">
            <div v-for="(reference, memberId) in selected.memberCredentialRefs" :key="memberId" class="admin-list-row"><span>{{ platform.users.find(item => item.id === memberId)?.name ?? memberId }}</span><span class="muted">已绑定</span></div>
            <p v-if="!Object.keys(selected.memberCredentialRefs ?? {}).length" class="muted">尚无成员绑定调用凭据</p>
          </template></section>
        </div>
      </section>
      <section v-else-if="detailTab === 'impact'" class="panel admin-detail-card">
        <h2>受影响能力 · {{ affectedCapabilities.length }} 项</h2>
        <div v-for="capability in affectedCapabilities" :key="capability.id" class="admin-list-row">
          <RouterLink :to="adminCapabilityLink(capability)">{{ capability.name }}</RouterLink>
          <span class="muted">{{ capability.type }} · {{ capability.connectionId === selected.id ? '直接使用连接' : '通过资源使用连接' }}</span>
        </div>
        <p v-if="!affectedCapabilities.length" class="muted">暂无能力引用此连接</p>
        <RouterLink v-if="dependentTasks.length && admin.canViewRuns" class="admin-history-link" :to="{ name: 'admin-scenario-runs', query: { connection: selected.id } }">查看 {{ dependentTasks.length }} 项关联任务</RouterLink>
      </section>
      <section v-else-if="detailTab === 'checks'" class="panel admin-detail-card">
        <h2>检测记录</h2>
        <ol v-if="selected.checks?.length" class="connection-checks"><li v-for="(check, index) in selected.checks" :key="index"><el-tag :type="statusType[check.status]" size="small">{{ check.status }}</el-tag> · {{ formatDate(check.at) }}<p>{{ check.message }}</p></li></ol>
        <el-empty v-else description="尚无检测记录" :image-size="60" />
      </section>
      <section v-else class="panel admin-detail-card"><AdminObjectChanges :target-id="selected.id" /></section>
    </div>

    <el-empty v-else-if="selectedId" description="连接不存在">
      <RouterLink class="text-link" :to="{ name: 'admin-connections', query: { ...route.query, tab: undefined, returnTo: undefined } }">返回连接列表</RouterLink>
    </el-empty>

    <section v-else aria-label="系统连接目录">
      <PageHeader title="系统连接">
        <template #actions>
          <el-button :icon="Plus" type="primary" @click="openEditor()">添加连接</el-button>
        </template>
        <div class="page-toolbar page-tab-toolbar filters">
          <div class="page-toolbar-filters">
            <el-input v-model="query" clearable :prefix-icon="Search" aria-label="搜索连接" placeholder="搜索名称或地址" />
            <el-select v-model="typeFilter" popper-class="filter-options" clearable aria-label="连接类型" placeholder="全部类型">
              <el-option v-for="type in types" :key="type" :label="type" :value="type" />
            </el-select>
            <el-select v-model="statusFilter" popper-class="filter-options" clearable aria-label="连接状态" placeholder="全部状态">
              <el-option v-for="status in statuses" :key="status" :label="status" :value="status" />
            </el-select>
          </div>
        </div>
      </PageHeader>
      <ul v-if="visibleConnections.length" class="connection-grid page-body">
        <li v-for="connection in visibleConnections" :key="connection.id">
          <RouterLink class="panel connection-card" :to="{ name: 'admin-connections', params: { id: connection.id }, query: route.query }" :aria-label="'查看' + connection.name">
            <div class="connection-card-header">
              <div class="connection-title">
                <span class="connection-icon"><component :is="icons[connection.type]" :size="17" aria-hidden="true" /></span>
                <div><strong>{{ connection.name }}</strong><small class="muted">{{ connection.type }}</small></div>
              </div>
              <el-tag :type="statusType[connection.status]" effect="light" size="small" disable-transitions>{{ connection.status }}</el-tag>
            </div>
            <p class="connection-card-address endpoint muted">{{ connection.endpoint }}</p>
            <div class="connection-card-footer">
              <span class="muted">影响 {{ admin.affectedByConnection(connection.id).length }} 项能力</span>
              <span class="text-link">查看详情 <ArrowUpRight :size="14" aria-hidden="true" /></span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <el-empty v-else :description="admin.connections.length ? '没有符合条件的连接' : '还没有系统连接'" :image-size="84" />
    </section>

    <el-dialog v-model="editorOpen" :before-close="beforeClose" :title="editingId ? '编辑连接' : '添加连接'" width="min(460px, calc(100vw - 28px))" append-to-body>
      <el-form id="connection-editor" label-position="top" @submit.prevent="save">
        <el-form-item label="连接名称" required>
          <el-input v-model="draft.name" aria-label="连接名称" placeholder="例如企业模型服务" maxlength="60" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="draft.type" aria-label="编辑连接类型" :disabled="!!(editingId && directCounts.get(editingId))">
            <el-option v-for="type in types" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="连接地址" required>
          <el-input v-model="draft.endpoint" aria-label="连接地址" placeholder="https://service.example/v1" />
          <p class="field-note">连接由本地模拟检测，不会向地址发出真实请求。</p>
        </el-form-item>
        <el-form-item label="调用身份与凭据"><el-select v-model="draft.credentialMode" aria-label="凭据方式"><el-option label="环境变量回退（演示）" value="environment" /><el-option label="组织共享凭据" value="organization" /><el-option label="成员本人凭据" value="member" /><el-option label="无需凭据" value="none" /></el-select></el-form-item>
        <el-form-item v-if="draft.credentialMode === 'member'" label="绑定成员"><el-select v-model="draft.credentialMemberId" filterable aria-label="凭据绑定成员" placeholder="选择本次绑定的成员"><el-option v-for="member in activeMembers" :key="member.id" :value="member.id" :label="member.name" /></el-select></el-form-item>
        <el-form-item v-if="['organization', 'member'].includes(draft.credentialMode)" label="演示凭据（只写）"><el-input v-model="draft.credentialValue" type="password" show-password autocomplete="new-password" aria-label="演示凭据" placeholder="留空保留已有引用" /><p class="field-note">请使用虚构值。仅保存演示凭据引用，输入值不会保存或回显；真实加密存储待接入。成员凭据只对指定成员的调用生效。</p></el-form-item>
        <p v-if="editorError" class="form-error" role="alert">{{ editorError }}</p>
      </el-form>
      <template #footer>
        <el-button @click="cancelEditor">取消</el-button>
        <el-button type="primary" native-type="submit" form="connection-editor">保存连接</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="confirmOpen" title="停用连接" width="min(420px, calc(100vw - 28px))" append-to-body>
      <p v-if="selected">停用「{{ selected.name }}」后，依赖它的 {{ affectedCapabilities.length }} 项能力将无法通过此连接调用服务。</p>
      <ul v-if="affectedCapabilities.length" class="confirm-impacts">
        <li v-for="capability in affectedCapabilities" :key="capability.id">{{ capability.name }}</li>
      </ul>
      <template #footer>
        <el-button @click="confirmOpen = false">取消</el-button>
        <el-button v-if="selected" type="danger" @click="toggle(selected)">确认停用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.connection-checks { padding-left: 20px; font-size: 14px; line-height: 1.7; }.connection-checks p { color: var(--muted); margin: 3px 0 10px; }
.back-link, .text-link { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
.back-link { font-size: 13px; }
.back-link:hover, .text-link:hover { text-decoration: underline; }
.connection-title strong, .dependency-title strong, .connection-fields dd { overflow-wrap: anywhere; }
.connection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filters .el-input { width: min(100%, 190px); }
.filters .el-select { width: 112px; }
.connection-grid, .dependency-list { list-style: none; margin: 0; }
.dependency-list { padding: 0; }
.connection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 265px), 1fr)); gap: 14px; }
.connection-grid > li { min-width: 0; }
.connection-card {
  display: flex; flex-direction: column; gap: 12px; height: 100%;
  padding: 16px; transition: border-color .15s, background .15s;
}
.connection-card:hover { border-color: #bdccf5; background: #fcfdff; }
.connection-card-header, .connection-card-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.connection-card-header { align-items: flex-start; }
.connection-card-header .el-tag { flex: none; }
.connection-card-address { margin: 0; font-size: 13px; line-height: 1.5; }
.connection-card-footer { margin-top: auto; padding-top: 11px; border-top: 1px solid var(--line); font-size: 12px; }
.connection-card-footer .text-link { flex: none; }
.connection-card:hover .text-link { text-decoration: underline; }
.dependency-list li + li { border-top: 1px solid var(--line); }
.connection-title { display: flex; align-items: center; gap: 11px; min-width: 0; }
.connection-title > div { min-width: 0; }
.connection-title small { display: block; margin-top: 3px; }
.connection-icon { display: grid; place-items: center; flex: 0 0 34px; height: 34px; border-radius: 8px; background: var(--soft); color: var(--accent); }
.endpoint { overflow-wrap: anywhere; }
.section-header > span { font-size: 13px; color: var(--muted); }
.connection-detail { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.overview, .dependencies { min-width: 0; padding: 18px; }
.connection-fields { margin: 0; }
.connection-fields > div { display: grid; grid-template-columns: 105px minmax(0, 1fr); align-items: baseline; gap: 8px; padding: 10px 0; }
.connection-fields > div + div { border-top: 1px solid var(--line); }
.connection-fields dt { font-size: 13px; color: var(--muted); }
.connection-fields dd { min-width: 0; margin: 0; }
.connection-actions { justify-content: space-between; border-top: 1px solid var(--line); padding-top: 12px; }
.section-header { display: flex; justify-content: space-between; gap: 8px; }
.dependency-list li > a { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 0; }
.dependency-list li > a:hover { color: var(--accent); }
.dependency-list li > a > svg { color: var(--accent); flex-shrink: 0; }
.dependency-title { min-width: 0; }
.dependency-title small { display: block; margin-top: 3px; font-size: 12px; color: var(--muted); }
.empty-dependencies { margin: 6px 0 0; }
.field-note { margin: 3px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.form-error { margin: 0; color: var(--el-color-danger); font-size: 13px; }
.confirm-impacts { max-height: 180px; overflow: auto; padding-left: 20px; line-height: 1.8; }

@media (max-width: 900px) {
  .connection-detail { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .overview, .dependencies { padding: 13px; }
  .connection-fields > div { grid-template-columns: 88px minmax(0, 1fr); }
}
</style>
