<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowUpRight, Cable, Cpu, Pencil, Plus, Power, Search, Server, Zap } from 'lucide-vue-next'
import { adminCapabilityLink } from '@/adminCatalogs'
import { useOrganizationAdminStore, type AdminConnection } from '@/stores/organizationAdmin'

const route = useRoute()
const admin = useOrganizationAdminStore()
const types: AdminConnection['type'][] = ['模型', 'MCP', '业务系统']
const statuses: AdminConnection['status'][] = ['正常', '待检测', '已停用']
const icons = { 模型: Cpu, MCP: Cable, 业务系统: Server }
const statusType = { 正常: 'success', 待检测: 'warning', 已停用: 'info' } as const
const query = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const editorOpen = ref(false)
const editingId = ref<string>()
const confirmOpen = ref(false)
const draft = ref<Pick<AdminConnection, 'name' | 'type' | 'endpoint'>>({
  name: '', type: '模型', endpoint: '',
})
const editorError = ref('')
const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const selected = computed(() => admin.connections.find(connection => connection.id === selectedId.value))

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

const affectedCapabilities = computed(() => {
  if (!selected.value) return []
  const connectionId = selected.value.id
  const ids = new Set(admin.capabilities.filter(capability => capability.connectionId === connectionId).map(capability => capability.id))
  for (const id of ids) {
    for (const capability of admin.capabilities) {
      if (capability.dependencyIds.includes(id)) ids.add(capability.id)
    }
  }
  return admin.capabilities.filter(capability => ids.has(capability.id))
})

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
  }
  editorError.value = ''
  editorOpen.value = true
}

function save() {
  const fields = { name: draft.value.name.trim(), type: draft.value.type, endpoint: draft.value.endpoint.trim() }
  if (!fields.name) {
    editorError.value = '请输入连接名称'
    return
  }
  if (!admin.saveConnection(fields, editingId.value)) {
    editorError.value = '保存失败。请检查名称是否重复，地址是否为完整的 HTTP 或 HTTPS 地址。'
    return
  }
  if (!editingId.value) {
    query.value = ''
    typeFilter.value = ''
    statusFilter.value = ''
  }
  ElMessage.success(editingId.value ? '连接已更新' : '连接已添加')
  editorOpen.value = false
}

function test(connection: AdminConnection) {
  if (admin.testConnection(connection.id)) ElMessage.success('模拟检测完成')
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
  <div class="page">
    <RouterLink v-if="selectedId" class="back-link" to="/admin/connections">
      <ArrowLeft :size="16" aria-hidden="true" />系统接入
    </RouterLink>

    <header class="page-header">
      <div>
        <h1>{{ selected?.name ?? '系统接入' }}</h1>
        <p>{{ selected ? selected.type + '连接' : '管理组织模型、MCP 和业务系统的连接。' }}</p>
      </div>
      <div v-if="selected" class="page-actions">
        <el-button :icon="Pencil" @click="openEditor(selected)">编辑连接</el-button>
        <el-button :icon="Zap" type="primary" :disabled="selected.status === '已停用'" @click="test(selected)">模拟检测</el-button>
      </div>
      <el-button v-else-if="!selectedId" :icon="Plus" type="primary" @click="openEditor()">添加连接</el-button>
    </header>

    <template v-if="selected">
      <div class="connection-detail">
        <section class="panel overview">
          <h2 class="section-title">连接信息</h2>
          <dl class="connection-fields">
            <div><dt>状态</dt><dd><el-tag :type="statusType[selected.status]" effect="light" round>{{ selected.status }}</el-tag></dd></div>
            <div><dt>地址</dt><dd class="endpoint">{{ selected.endpoint }}</dd></div>
            <div><dt>最近模拟检测</dt><dd>{{ selected.lastCheckedAt ? formatDate(selected.lastCheckedAt) : '暂无' }}</dd></div>
          </dl>
          <div class="connection-actions">
            <el-button v-if="selected.status === '已停用'" :icon="Power" @click="toggle(selected)">启用连接</el-button>
            <el-button v-else :icon="Power" @click="confirmOpen = true">停用连接</el-button>
            <RouterLink class="text-link" :to="{ path: '/admin/changes', query: { target: selected.name } }">查看变更记录 <ArrowUpRight :size="14" aria-hidden="true" /></RouterLink>
          </div>
        </section>
        <section class="panel dependencies">
          <div class="section-header">
            <h2 class="section-title">依赖能力</h2>
            <span class="muted">{{ affectedCapabilities.length }} 项</span>
          </div>
          <ul v-if="affectedCapabilities.length" class="dependency-list">
            <li v-for="capability in affectedCapabilities" :key="capability.id">
              <RouterLink :to="adminCapabilityLink(capability)">
                <span class="dependency-title"><strong>{{ capability.name }}</strong><small>{{ capability.type }} · {{ capability.connectionId === selected.id ? '直接使用连接' : '通过资源使用连接' }}</small></span>
                <ArrowUpRight :size="16" aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
          <p v-else class="empty-dependencies muted">暂无能力依赖此连接。</p>
        </section>
      </div>
    </template>

    <el-empty v-else-if="selectedId" class="panel" description="连接不存在">
      <RouterLink class="text-link" to="/admin/connections">返回连接列表</RouterLink>
    </el-empty>

    <section v-else aria-label="系统连接目录">
      <div class="filters">
        <el-input v-model="query" clearable :prefix-icon="Search" aria-label="搜索连接" placeholder="搜索名称或地址" />
        <el-select v-model="typeFilter" clearable aria-label="连接类型" placeholder="全部类型">
          <el-option v-for="type in types" :key="type" :label="type" :value="type" />
        </el-select>
        <el-select v-model="statusFilter" clearable aria-label="连接状态" placeholder="全部状态">
          <el-option v-for="status in statuses" :key="status" :label="status" :value="status" />
        </el-select>
      </div>
      <ul v-if="visibleConnections.length" class="connection-grid">
        <li v-for="connection in visibleConnections" :key="connection.id">
          <RouterLink class="panel connection-card" :to="'/admin/connections/' + encodeURIComponent(connection.id)" :aria-label="'查看' + connection.name">
            <div class="connection-card-header">
              <div class="connection-title">
                <span class="connection-icon"><component :is="icons[connection.type]" :size="17" aria-hidden="true" /></span>
                <div><strong>{{ connection.name }}</strong><small class="muted">{{ connection.type }}</small></div>
              </div>
              <el-tag :type="statusType[connection.status]" effect="light" size="small" disable-transitions>{{ connection.status }}</el-tag>
            </div>
            <p class="connection-card-address endpoint muted">{{ connection.endpoint }}</p>
            <div class="connection-card-footer">
              <span class="muted">直接依赖 {{ directCounts.get(connection.id) ?? 0 }} 项</span>
              <span class="text-link">查看详情 <ArrowUpRight :size="14" aria-hidden="true" /></span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <el-empty v-else class="panel" :description="admin.connections.length ? '没有符合条件的连接' : '还没有系统连接'" :image-size="84" />
    </section>

    <el-dialog v-model="editorOpen" :title="editingId ? '编辑连接' : '添加连接'" width="min(460px, calc(100vw - 28px))" append-to-body>
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
          <p class="field-note">原型只保存演示连接信息，检测由本地模拟。</p>
        </el-form-item>
        <p v-if="editorError" class="form-error" role="alert">{{ editorError }}</p>
      </el-form>
      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
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
.back-link, .text-link { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
.back-link { margin-bottom: 13px; font-size: 13px; }
.back-link:hover, .text-link:hover { text-decoration: underline; }
.page-header h1, .connection-title strong, .dependency-title strong { overflow-wrap: anywhere; }
.page-actions, .connection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.page-actions .el-button + .el-button { margin-left: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.filters .el-input { width: min(100%, 320px); }
.filters .el-select { width: 126px; }
.connection-grid, .dependency-list { list-style: none; margin: 0; padding: 0; }
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
  .page-header { flex-wrap: wrap; }
  .filters .el-input { width: 100%; }
  .filters .el-select { flex: 1 1 100px; }
  .overview, .dependencies { padding: 13px; }
  .connection-fields > div { grid-template-columns: 88px minmax(0, 1fr); }
}
</style>
