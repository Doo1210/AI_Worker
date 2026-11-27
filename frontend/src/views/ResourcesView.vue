<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Collection, Plus, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { resourceLibraryLocation, resourceScopeFromQuery, resourceTypeFromQuery, resourceTypeItems, resourceTypes, type ResourceScopeFilter } from '@/resourceNavigation'
import { resourceUnavailableReason } from '@/resourceAvailability'
import { makeId, usePlatformStore, type Resource } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const route = useRoute()
const router = useRouter()
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const canDevelop = computed(() => platform.currentUser.role === 'admin' || organization.capabilities.some(item =>
  resourceTypes.some(type => type === item.type) && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id))))
const scopes: { value: ResourceScopeFilter; label: string }[] = [
  { value: 'all', label: '全部资源' },
  { value: 'own', label: '我的资源' },
  { value: 'shared', label: '共享资源' },
]
const statuses: Resource['status'][] = ['可用', '未连接', '停用']
const icons = new Map(resourceTypeItems.map(({ type, icon }) => [type, icon]))
const typeFilter = computed(() => resourceTypeFromQuery(route.query))
const scopeFilter = computed(() => resourceScopeFromQuery(route.query))
const search = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => {
    void router.replace(resourceLibraryLocation({ ...route.query, q: value || null }, typeFilter.value))
  },
})
const dialogOpen = ref(false)
const detailMode = ref(false)
const resourceId = ref('')
const name = ref('')
const description = ref('')
const resourceType = ref<Resource['type']>('知识')
const resourceStatus = ref<Resource['status']>('可用')
const selectedResource = computed(() => platform.visibleResources.find(resource => resource.id === resourceId.value))
const ownerLabel = computed(() => {
  const resource = selectedResource.value
  if (!resource) return ''
  if (resource.scope === 'organization') return '本组织'
  if (isOwnResource(resource)) return `${platform.currentUser.name}（我）`
  return platform.users.find(user => user.id === resource.ownerId)?.name ?? '其他成员'
})
const accessLabel = computed(() => {
  const resource = selectedResource.value
  if (!resource) return ''
  if (canEdit(resource)) return '归我所有，可编辑'
  if (isOwnResource(resource)) return '归我所有，已共享'
  return '已获共享使用权'
})
const reason = computed(() => resourceUnavailableReason(selectedResource.value))
const dependencies = computed(() => {
  const id = selectedResource.value?.id
  if (!id) return []
  return [
    ...platform.visibleAssistants
      .filter(assistant => assistant.resourceIds.includes(id))
      .map(assistant => ({
        id: assistant.id,
        name: assistant.name,
        kind: '助理',
        to: platform.myAssistants.some(item => item.id === assistant.id)
          ? { name: 'personal-assistant-configuration', params: { id: assistant.id }, query: { scope: 'own' } }
          : { path: '/work/assistants', query: { scope: 'shared' } },
      })),
    ...platform.visibleEmployees
      .filter(employee => employee.resourceIds.includes(id))
      .map(employee => ({
        id: employee.id,
        name: employee.name,
        kind: 'AI 员工',
        to: { name: 'employee-contact', params: { id: employee.id } },
      })),
  ]
})

const scopedResources = computed(() => platform.visibleResources.filter(resource =>
  (!typeFilter.value || resource.type === typeFilter.value) &&
  (scopeFilter.value === 'all' || (scopeFilter.value === 'own' ? isOwnResource(resource) : !isOwnResource(resource))),
))
const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return scopedResources.value.filter(resource =>
    !term || (resource.name + ' ' + resource.description).toLowerCase().includes(term),
  )
})
const title = computed(() => detailMode.value ? '资源详情' : resourceId.value ? '编辑个人资源' : '添加个人资源')
const emptyMessage = computed(() => {
  if (search.value.trim()) return '没有符合搜索条件的资源'
  if (scopeFilter.value === 'own') return '你还没有添加此类资源'
  if (scopeFilter.value === 'shared') return '暂无共享的此类资源'
  return '暂无可查看的此类资源'
})

watch(() => platform.currentUser.id, () => {
  dialogOpen.value = false
})

function selectScope(scope: ResourceScopeFilter) {
  void router.push(resourceLibraryLocation({ ...route.query, scope }, typeFilter.value))
}

function isOwnResource(resource: Resource) {
  return resource.scope !== 'organization' && resource.ownerId === platform.currentUser.id
}

function canEdit(resource: Resource) {
  return resource.scope === 'personal' && isOwnResource(resource)
}

function source(resource: Resource) {
  if (resource.scope === 'personal') return '个人资源'
  if (resource.scope === 'organization') return '组织共享'
  if (isOwnResource(resource)) return '个人资源 · 已共享'
  const owner = platform.users.find((user) => user.id === resource.ownerId)
  return owner ? owner.name + '共享' : '成员共享'
}

function open(resource?: Resource) {
  detailMode.value = !!resource && !canEdit(resource)
  resourceId.value = resource?.id ?? ''
  name.value = resource?.name ?? ''
  description.value = resource?.description ?? ''
  resourceType.value = resource?.type ?? typeFilter.value ?? '知识'
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
    void router.replace(resourceLibraryLocation({
      ...route.query,
      scope: scopeFilter.value === 'shared' ? 'own' : scopeFilter.value,
      q: null,
    }, resourceType.value))
  }
  dialogOpen.value = false
  ElMessage.success(resource ? '资源已更新' : '已添加个人资源')
}

</script>

<template>
  <section class="page-surface page-with-control-inset resources-page" :aria-label="typeFilter ?? '资源库'">
    <PageHeader :title="typeFilter ?? '资源库'">
      <template #actions>
        <RouterLink v-if="canDevelop" class="el-button" :to="{ name: 'resource-management' }">组织资源维护</RouterLink>
        <el-button type="primary" :icon="Plus" @click="open()">添加资源</el-button>
      </template>
      <div class="page-toolbar page-tab-toolbar resource-toolbar">
        <el-select :model-value="scopeFilter" class="filter-field filter-select" aria-label="资源范围"
          popper-class="filter-options" @update:model-value="selectScope">
          <el-option v-for="item in scopes" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
        <el-input v-model="search" :prefix-icon="Search" class="filter-field resource-search" placeholder="搜索资源" aria-label="搜索资源" clearable />
      </div>
    </PageHeader>

    <div v-if="visible.length" class="page-body resource-grid">
      <article v-for="resource in visible" :key="resource.id" class="panel resource-card">
        <div class="card-top">
          <span class="resource-icon" :data-type="resource.type" aria-hidden="true"><component :is="icons.get(resource.type)" :size="19" /></span>
          <el-tag :type="resource.status === '可用' ? 'success' : resource.status === '未连接' ? 'warning' : 'info'" effect="plain" size="small">
            {{ resource.status }}
          </el-tag>
        </div>
        <h2>{{ resource.name }}</h2>
        <p>{{ resource.description || '暂无资源说明' }}</p>
        <div class="card-footer">
          <span>{{ resource.type }} · {{ source(resource) }}</span>
          <el-button text :icon="ArrowRight" :aria-label="'查看资源 ' + resource.name" @click="open(resource)">
            {{ canEdit(resource) ? '编辑' : '详情' }}
          </el-button>
        </div>
      </article>
    </div>
    <div v-else class="empty">
      <el-icon><Collection /></el-icon>
      <p>{{ emptyMessage }}</p>
      <el-button v-if="search.trim()" @click="search = ''">清除搜索</el-button>
      <el-button v-else-if="scopeFilter !== 'shared'" :icon="Plus" @click="open()">添加资源</el-button>
    </div>

    <el-dialog v-model="dialogOpen" :title="title" width="min(540px, calc(100vw - 30px))">
      <div class="resource-dialog-body">
        <section v-if="selectedResource" class="resource-summary" aria-label="资源来源与授权">
          <h2 v-if="detailMode">{{ selectedResource.name }}</h2>
          <dl>
            <div><dt>来源</dt><dd>{{ ownerLabel }}</dd></div>
            <div><dt>我的权限</dt><dd>{{ accessLabel }}</dd></div>
            <div><dt>资源类型</dt><dd>{{ selectedResource.type }}</dd></div>
            <div><dt>当前状态</dt><dd>{{ selectedResource.status }}</dd></div>
          </dl>
          <p v-if="reason" class="resource-unavailable">{{ reason }}</p>
          <p v-if="detailMode && selectedResource.description" class="muted resource-description">{{ selectedResource.description }}</p>
        </section>
        <el-form v-if="!detailMode" label-position="top" @submit.prevent="save">
          <el-form-item label="名称" required><el-input v-model="name" maxlength="60" placeholder="输入资源名称" /></el-form-item>
          <div class="form-row">
            <el-form-item label="类型"><el-select v-model="resourceType"><el-option v-for="type in resourceTypes" :key="type" :value="type" :label="type" /></el-select></el-form-item>
            <el-form-item label="状态"><el-select v-model="resourceStatus"><el-option v-for="status in statuses" :key="status" :value="status" :label="status" /></el-select></el-form-item>
          </div>
          <el-form-item label="用途说明"><el-input v-model="description" type="textarea" :rows="4" maxlength="400" placeholder="说明这项资源能用于哪些工作。" /></el-form-item>
        </el-form>
        <section v-if="selectedResource" class="resource-dependencies" aria-label="配置引用">
          <h3>配置引用</h3>
          <ul v-if="dependencies.length">
            <li v-for="item in dependencies" :key="item.kind + item.id">
              <span>{{ item.kind }}</span>
              <RouterLink :to="item.to" @click="dialogOpen = false">{{ item.name }}</RouterLink>
            </li>
          </ul>
          <p v-else class="muted">你可查看的助理和 AI 员工中，暂无配置引用。</p>
        </section>
      </div>
      <template #footer>
        <el-button @click="dialogOpen = false">{{ detailMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!detailMode" type="primary" :disabled="!name.trim()" @click="save">保存资源</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.resource-toolbar { flex-wrap: nowrap; justify-content: flex-start; gap: 10px; }
.resource-search { flex: 0 1 184px; min-width: 0; }
.resource-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 13px; }
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
.resource-dialog-body { max-height: 65dvh; overflow-y: auto; padding: 0 4px; }
.resource-summary { border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 13px; }
.resource-summary h2 { margin: 0 0 10px; font-size: 17px; overflow-wrap: anywhere; }
.resource-summary dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 0; }
.resource-summary dl div { min-width: 0; }
.resource-summary dt { margin-bottom: 3px; color: var(--muted); font-size: 12px; }
.resource-summary dd { margin: 0; color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.resource-unavailable { padding: 7px 9px; border-radius: 6px; background: #fff7e8; color: #815218; }
.resource-description { margin-bottom: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.resource-dependencies h3 { margin: 0 0 7px; font-size: 14px; }
.resource-dependencies p { margin: 0; font-size: 13px; }
.resource-dependencies ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.resource-dependencies li { display: flex; align-items: baseline; gap: 8px; }
.resource-dependencies li span { flex: none; border-radius: 4px; padding: 2px 5px; color: var(--muted); background: var(--soft); font-size: 11px; }
.resource-dependencies a { color: var(--accent); overflow-wrap: anywhere; }
</style>
