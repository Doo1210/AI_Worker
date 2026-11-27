<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { useAdminListQuery } from '@/adminListQuery'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Package, Plus, Search } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import AdminObjectChanges from '@/components/AdminObjectChanges.vue'
import { useUnsavedChanges } from '@/useUnsavedChanges'
import { pluginIssues } from '@/adminDependencies'
import { adminCapabilityLink } from '@/adminCatalogs'

const admin = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const { field } = useAdminListQuery()
const query = field('q', '')
const status = field('status', '')
const selected = computed(() => admin.plugins.find(item => item.id === route.params.id))
const filtered = computed(() => admin.plugins.filter(item => item.name.includes(query.value.trim())
  && (!status.value || status.value === (!item.enabled ? '已停用' : pluginIssues(item.id, admin.plugins).length ? '需关注' : '已加载'))))
const affected = computed(() => selected.value ? admin.affectedByPlugin(selected.value.id) : [])
const issues = computed(() => selected.value ? pluginIssues(selected.value.id, admin.plugins) : [])
const detailTab = field('tab', 'overview')
const version = ref('')
const editor = ref(false)
const confirmation = ref<'state' | 'version' | ''>('')
const draft = reactive({ name: '', description: '', version: '1.0.0', dependencyIds: [] as string[], capabilityIds: [] as string[] })
const editorDirty = computed(() => editor.value && !!(draft.name.trim() || draft.description.trim() || draft.dependencyIds.length || draft.capabilityIds.length || draft.version !== '1.0.0'))
const { beforeClose, confirmDiscard } = useUnsavedChanges(editorDirty)
async function cancelEditor() { if (await confirmDiscard()) editor.value = false }
watch(selected, item => { version.value = item?.version ?? ''; confirmation.value = '' }, { immediate: true })
function create() {
  Object.assign(draft, { name: '', description: '', version: '1.0.0', dependencyIds: [], capabilityIds: [] })
  editor.value = true
}
function save() {
  if (!admin.savePlugin(draft)) return void ElMessage.warning('请核对名称、版本及依赖，版本格式如 1.0.0。')
  editor.value = false
  const created = admin.plugins.find(item => item.name === draft.name.trim())
  if (created) void router.push({ name: 'admin-plugins', params: { id: created.id }, query: { ...route.query, tab: undefined } })
  ElMessage.success('已登记演示插件，可启用后检查加载')
}
function confirm() {
  const item = selected.value
  if (!item) return
  const saved = confirmation.value === 'version' ? admin.setPluginVersion(item.id, version.value) : admin.setPluginEnabled(item.id, !item.enabled)
  if (!saved) return void ElMessage.warning('依赖插件未就绪，请先检查依赖。')
  confirmation.value = ''
  ElMessage.success('插件配置已更新')
}
function check(failed = false) {
  if (!selected.value || !admin.checkPlugin(selected.value.id, failed)) return
  if (selected.value.loadStatus === '加载失败') ElMessage.warning('加载检查失败，请查看原因与依赖')
  else ElMessage.success('模拟加载检查通过')
}
</script>

<template>
  <section class="page page-surface page-with-control-inset" aria-label="插件接入">
    <PageHeader :title="selected?.name ?? '插件接入'">
      <template v-if="route.params.id" #back>
        <RouterLink class="back-link" :to="{ name: 'admin-plugins', query: { ...route.query, tab: undefined } }"><ArrowLeft :size="16" />返回插件接入</RouterLink>
      </template>
      <template #actions>
        <span class="admin-demo">演示接入</span>
        <el-button v-if="!route.params.id" type="primary" :icon="Plus" @click="create">添加插件</el-button>
        <template v-else-if="selected && detailTab === 'overview'">
          <el-button type="primary" :disabled="!selected.enabled" @click="check()">模拟检查加载</el-button>
          <el-dropdown trigger="click"><el-button>更多操作</el-button><template #dropdown><el-dropdown-menu>
            <el-dropdown-item @click="confirmation = 'state'">{{ selected.enabled ? '停用插件' : '启用插件' }}</el-dropdown-item>
            <el-dropdown-item divided :disabled="!selected.enabled" @click="check(true)">演示加载失败</el-dropdown-item>
          </el-dropdown-menu></template></el-dropdown>
        </template>
      </template>
      <nav v-if="selected" class="page-tabs" aria-label="插件详情分组">
        <button class="page-tab" v-for="tab in [{ id: 'overview', name: '启停与版本' }, { id: 'dependencies', name: '依赖与影响' }, { id: 'changes', name: '变更记录' }]" :key="tab.id" type="button" :aria-pressed="detailTab === tab.id" @click="detailTab = tab.id">{{ tab.name }}</button>
      </nav>
      <div v-if="!route.params.id" class="page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters">
          <el-input v-model="query" :prefix-icon="Search" placeholder="搜索插件" aria-label="搜索插件" clearable />
          <el-select v-model="status" placeholder="全部状态" aria-label="插件状态" clearable><el-option v-for="value in ['已加载', '需关注', '已停用']" :key="value" :value="value" /></el-select>
        </div>
      </div>
    </PageHeader>
    <div v-if="selected" class="page-body">
      <p v-if="selected.description" class="admin-note">{{ selected.description }}</p>
      <section v-if="detailTab === 'overview'" class="panel admin-detail-card">
        <el-alert v-if="selected.enabled && issues.length" :title="issues.join('；')" type="warning" :closable="false" show-icon />
        <div class="admin-detail-grid">
          <section><h3>当前运行状态</h3><dl class="admin-facts">
            <div><dt>组织状态</dt><dd>{{ selected.enabled ? '已启用' : '已停用' }}</dd></div>
            <div><dt>加载结果</dt><dd>{{ selected.loadStatus }}</dd></div>
            <div><dt>最近检查</dt><dd>{{ selected.checkedAt ? new Date(selected.checkedAt).toLocaleString('zh-CN') : '尚未检查' }}</dd></div>
          </dl></section>
          <section><h3>生效版本</h3><p>当前版本 {{ selected.version }}</p>
            <el-form label-position="top" @submit.prevent="confirmation = 'version'">
              <el-form-item label="选择已登记版本"><el-select v-model="version" aria-label="插件版本"><el-option v-for="item in selected.versions" :key="item" :value="item" /></el-select></el-form-item>
              <el-button native-type="submit" :disabled="version === selected.version">预览版本变更</el-button>
            </el-form>
          </section>
        </div>
      </section>
      <div v-else-if="detailTab === 'dependencies'" class="admin-detail-grid">
        <section class="panel admin-detail-card"><h2>依赖插件</h2>
          <div v-for="id in selected.dependencyIds" :key="id" class="admin-list-row"><RouterLink :to="{ name: 'admin-plugins', params: { id }, query: { tab: 'overview' } }">{{ admin.plugins.find(item => item.id === id)?.name ?? id }}</RouterLink></div>
          <p v-if="!selected.dependencyIds.length" class="muted">无其他插件依赖</p>
        </section>
        <section class="panel admin-detail-card"><h2>受影响能力 · {{ affected.length }} 项</h2>
          <div v-for="item in affected" :key="item.id" class="admin-list-row"><RouterLink :to="adminCapabilityLink(item)">{{ item.name }}</RouterLink><el-tag size="small" :type="item.ready ? 'success' : 'warning'">{{ item.ready ? '依赖就绪' : '依赖未就绪' }}</el-tag></div>
          <p v-if="!affected.length" class="muted">暂无关联能力</p>
        </section>
      </div>
      <section v-else class="panel admin-detail-card"><AdminObjectChanges :target-id="selected.id" /></section>
    </div>
    <el-empty v-else-if="route.params.id" description="插件不存在" />
    <div v-else class="admin-card-grid page-body">
      <RouterLink v-for="item in filtered" :key="item.id" class="panel admin-detail-card admin-plugin-card" :to="{ name: 'admin-plugins', params: { id: item.id }, query: { ...route.query, tab: undefined } }">
        <div class="admin-card-heading"><Package :size="20" /><h2>{{ item.name }}</h2><el-tag :type="!item.enabled ? 'info' : pluginIssues(item.id, admin.plugins).length ? 'warning' : 'success'" size="small">{{ !item.enabled ? '已停用' : pluginIssues(item.id, admin.plugins).length ? '需关注' : '已加载' }}</el-tag></div><p class="muted">{{ item.description }}</p><div class="admin-list-row"><span>版本 {{ item.version }}</span><span>{{ admin.affectedByPlugin(item.id).length }} 项关联能力</span></div>
      </RouterLink><el-empty v-if="!filtered.length" description="没有符合条件的插件" />
    </div>
    <el-dialog v-model="editor" :before-close="beforeClose" title="添加演示插件" width="min(520px, calc(100vw - 28px))" append-to-body><el-form label-position="top" @submit.prevent="save"><el-form-item label="插件名称" required><el-input v-model="draft.name" aria-label="插件名称" maxlength="60" /></el-form-item><el-form-item label="功能说明"><el-input v-model="draft.description" type="textarea" :rows="2" /></el-form-item><el-form-item label="初始版本" required><el-input v-model="draft.version" aria-label="初始版本" placeholder="1.0.0" /></el-form-item><el-form-item label="依赖插件"><el-select v-model="draft.dependencyIds" multiple aria-label="依赖插件"><el-option v-for="item in admin.plugins" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="提供的能力"><el-select v-model="draft.capabilityIds" multiple filterable aria-label="插件提供的能力"><el-option v-for="item in admin.capabilities" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><div class="admin-actions"><el-button @click="cancelEditor">取消</el-button><el-button type="primary" native-type="submit">保存插件</el-button></div></el-form></el-dialog>
    <el-dialog :model-value="!!confirmation" :title="confirmation === 'version' ? '确认版本变更' : '确认插件启停'" width="min(480px, calc(100vw - 28px))" append-to-body @update:model-value="(value: boolean) => { if (!value) confirmation = '' }"><template v-if="selected"><p>{{ confirmation === 'version' ? `将「${selected.name}」切换到 ${version}，切换后需要重新检查加载。` : `${selected.enabled ? '停用' : '启用'}「${selected.name}」。启用后需要检查加载。` }}</p><p>影响 {{ affected.length }} 项能力，已有使用授权保留。</p><ul><li v-for="item in affected" :key="item.id">{{ item.name }}</li></ul></template><template #footer><el-button @click="confirmation = ''">取消</el-button><el-button type="primary" @click="confirm">确认变更</el-button></template></el-dialog>
  </section>
</template>
