<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, Collection, Connection, Cpu, Plus, Reading, Search, Tools } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { makeId, usePlatformStore } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
type Resource = (typeof platform.resources)[number]
const types: Resource['type'][] = ['模型', '技能', 'MCP', '知识', '工具']
const canDevelop = computed(() => platform.currentUser.role === 'admin' || organization.capabilities.some(item =>
  types.some(type => type === item.type) && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id))))
const scopes: { value: 'all' | Resource['scope']; label: string }[] = [
  { value: 'all', label: '全部来源' },
  { value: 'personal', label: '个人资源' },
  { value: 'organization', label: '组织共享' },
  { value: 'shared', label: '成员共享' },
]
const statuses: Resource['status'][] = ['可用', '未连接', '停用']
const icons = { 模型: Cpu, 技能: Collection, MCP: Connection, 知识: Reading, 工具: Tools }
const typeFilter = ref<'' | Resource['type']>('')
const scopeFilter = ref<'all' | Resource['scope']>('all')
const search = ref('')
const dialogOpen = ref(false)
const detailMode = ref(false)
const resourceId = ref('')
const name = ref('')
const description = ref('')
const resourceType = ref<Resource['type']>('知识')
const resourceStatus = ref<Resource['status']>('可用')

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return platform.visibleResources.filter((resource) =>
    (!typeFilter.value || resource.type === typeFilter.value) &&
    (scopeFilter.value === 'all' || resource.scope === scopeFilter.value) &&
    (!term || (resource.name + ' ' + resource.description).toLowerCase().includes(term)),
  )
})
const title = computed(() => detailMode.value ? '资源详情' : resourceId.value ? '编辑个人资源' : '添加个人资源')

watch(() => platform.currentUser.id, () => {
  dialogOpen.value = false
  typeFilter.value = ''
  scopeFilter.value = 'all'
  search.value = ''
})

function canEdit(resource: Resource) {
  return resource.scope === 'personal' && resource.ownerId === platform.currentUser.id
}

function source(resource: Resource) {
  if (resource.scope === 'personal') return '个人资源'
  if (resource.scope === 'organization') return '组织共享'
  const owner = platform.users.find((user) => user.id === resource.ownerId)
  return owner ? owner.name + '共享' : '成员共享'
}

function open(resource?: Resource) {
  detailMode.value = !!resource && !canEdit(resource)
  resourceId.value = resource?.id ?? ''
  name.value = resource?.name ?? ''
  description.value = resource?.description ?? ''
  resourceType.value = resource?.type ?? (typeFilter.value || '知识')
  resourceStatus.value = resource?.status ?? '可用'
  dialogOpen.value = true
}

function save() {
  if (detailMode.value || !name.value.trim()) return
  const resource = platform.resources.find((item) => item.id === resourceId.value && canEdit(item))
  if (resourceId.value && !resource) {
    ElMessage.error('此资源当前不可编辑')
    return
  }
  const fields = {
    name: name.value.trim(),
    description: description.value.trim(),
    type: resourceType.value,
    status: resourceStatus.value,
  }
  if (resource) Object.assign(resource, fields)
  else {
    platform.resources.push({
      ...fields,
      id: makeId('resource'),
      scope: 'personal',
      ownerId: platform.currentUser.id,
      allowedUserIds: [platform.currentUser.id],
    })
    scopeFilter.value = 'all'
    typeFilter.value = ''
    search.value = ''
  }
  dialogOpen.value = false
  ElMessage.success(resource ? '资源已更新' : '已添加个人资源')
}

function resetFilters() {
  search.value = ''
  typeFilter.value = ''
  scopeFilter.value = 'all'
}
</script>

<template>
  <div class="page resources-page">
    <header class="page-header">
      <div><h1>资源库</h1><p class="muted">管理个人资源，查看组织和其他成员共享给你的能力。</p></div>
      <div class="resource-header-actions">
        <RouterLink v-if="canDevelop" class="el-button" :to="{ name: 'resource-management' }">组织资源维护</RouterLink>
        <el-button type="primary" :icon="Plus" @click="open()">添加资源</el-button>
      </div>
    </header>

    <div class="resource-filters">
      <div class="type-filters" aria-label="按资源类型筛选">
        <button type="button" :aria-pressed="typeFilter === ''" @click="typeFilter = ''">全部</button>
        <button v-for="type in types" :key="type" type="button" :aria-pressed="typeFilter === type" @click="typeFilter = type">{{ type }}</button>
      </div>
      <div class="search-filters">
        <el-select v-model="scopeFilter" class="source-select" aria-label="按来源筛选">
          <el-option v-for="item in scopes" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
        <el-input v-model="search" :prefix-icon="Search" class="resource-search" placeholder="搜索资源" aria-label="搜索资源" clearable />
      </div>
    </div>

    <div v-if="visible.length" class="resource-grid">
      <article v-for="resource in visible" :key="resource.id" class="panel resource-card">
        <div class="card-top">
          <span class="resource-icon" :data-type="resource.type"><el-icon><component :is="icons[resource.type]" /></el-icon></span>
          <el-tag :type="resource.status === '可用' ? 'success' : resource.status === '未连接' ? 'warning' : 'info'" effect="plain" size="small">
            {{ resource.status }}
          </el-tag>
        </div>
        <h2>{{ resource.name }}</h2>
        <p>{{ resource.description || '暂无资源说明' }}</p>
        <div class="card-footer">
          <span>{{ resource.type }} · {{ source(resource) }}</span>
          <el-button text :icon="ArrowRight" @click="open(resource)">{{ canEdit(resource) ? '编辑' : '详情' }}</el-button>
        </div>
      </article>
    </div>
    <div v-else class="panel empty">
      <el-icon><Collection /></el-icon>
      <p>{{ search || typeFilter || scopeFilter !== 'all' ? '没有符合筛选条件的资源' : '当前没有可查看的资源' }}</p>
      <el-button v-if="search || typeFilter || scopeFilter !== 'all'" @click="resetFilters">清除筛选</el-button>
      <el-button v-else :icon="Plus" @click="open()">添加资源</el-button>
    </div>

    <el-dialog v-model="dialogOpen" :title="title" width="min(540px, calc(100vw - 30px))">
      <el-form label-position="top" :disabled="detailMode" @submit.prevent="save">
        <el-form-item label="名称" required><el-input v-model="name" maxlength="60" placeholder="输入资源名称" /></el-form-item>
        <div class="form-row">
          <el-form-item label="类型"><el-select v-model="resourceType"><el-option v-for="type in types" :key="type" :value="type" :label="type" /></el-select></el-form-item>
          <el-form-item label="状态"><el-select v-model="resourceStatus"><el-option v-for="status in statuses" :key="status" :value="status" :label="status" /></el-select></el-form-item>
        </div>
        <el-form-item label="用途说明"><el-input v-model="description" type="textarea" :rows="4" maxlength="400" placeholder="说明这项资源能用于哪些工作。" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">{{ detailMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!detailMode" type="primary" :disabled="!name.trim()" @click="save">保存资源</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.resource-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.resource-header-actions .el-button { margin-left: 0; }
.resource-filters, .type-filters, .search-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.resource-filters { justify-content: space-between; margin-bottom: 15px; }
.type-filters button { border: 1px solid transparent; color: var(--muted); background: transparent; padding: 7px 10px; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; }
.type-filters button[aria-pressed="true"] { color: var(--accent); background: #ecf1ff; border-color: #dfe7ff; font-weight: 600; }
.type-filters button:hover { color: var(--accent); }
.source-select { width: 113px; }
.resource-search { width: 155px; }
.resource-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 13px; }
.resource-card { display: flex; flex-direction: column; padding: 16px; min-width: 0; }
.card-top, .card-footer { display: flex; justify-content: space-between; align-items: center; gap: 7px; }
.resource-icon { display: grid; place-items: center; width: 37px; height: 37px; border-radius: 9px; color: var(--accent); background: #edf2ff; font-size: 17px; }
.resource-icon[data-type="技能"] { background: #f1edfb; color: #7356b1; }
.resource-icon[data-type="知识"] { background: #eaf6ef; color: #287751; }
.resource-icon[data-type="MCP"] { background: #fff3e7; color: #9b5c23; }
.resource-card h2 { font-size: 15px; font-weight: 650; margin: 13px 0 5px; overflow-wrap: anywhere; }
.resource-card p { font-size: 13px; margin: 0 0 14px; flex: 1; color: var(--muted); line-height: 1.55; overflow-wrap: anywhere; }
.card-footer { padding-top: 9px; border-top: 1px solid var(--line); }
.card-footer span { color: var(--muted); font-size: 12px; }
.card-footer .el-button { padding-inline: 5px; color: var(--accent); }
.empty { display: grid; justify-items: center; padding: 34px 16px; color: var(--muted); }
.empty > .el-icon { font-size: 23px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-row .el-select { width: 100%; }
@media (max-width: 560px) {
  .resource-grid { grid-template-columns: 1fr; }
  .type-filters { gap: 3px; }
  .type-filters button { padding-inline: 7px; }
  .search-filters { flex-wrap: nowrap; width: 100%; }
  .resource-search { flex: 1; min-width: 0; }
}
</style>
