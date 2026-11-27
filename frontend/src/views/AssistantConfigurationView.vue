<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, User } from '@element-plus/icons-vue'
import { ElMessage, ElOptionGroup } from 'element-plus'
import { ArrowLeft } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { resourceUnavailableReason } from '@/resourceAvailability'
import { usePlatformStore, type Assistant, type AssistantDraft, type Resource } from '@/stores/platform'
import { useUnsavedChanges } from '@/useUnsavedChanges'

type Section = 'information' | 'instructions' | 'sharing' | Resource['type']
type BindingPicker = { kind: 'resource'; type: Resource['type']; replacing?: string } | { kind: 'member' }

const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
const resourceOrder: Resource['type'][] = ['模型', '技能', '知识', '工具', 'MCP']
const sectionGroups: { label: string; items: { id: Section; label: string }[] }[] = [
  { label: '助理设定', items: [{ id: 'information', label: '基本信息' }, { id: 'instructions', label: '工作指令' }] },
  { label: '模型与资源', items: resourceOrder.map(type => ({ id: type, label: type })) },
  { label: '使用权限', items: [{ id: 'sharing', label: '共享成员' }] },
]
const sections = sectionGroups.flatMap(group => group.items)
const section = ref<Section>('information')
const sectionTitle = computed(() => sections.find(item => item.id === section.value)?.label)
const resourceType = computed(() => resourceOrder.find(type => type === section.value))
const resourceSource: Record<Resource['scope'], string> = { personal: '个人资源', shared: '成员共享', organization: '组织分配' }
const listLocation = computed(() => ({
  name: 'personal-assistants', query: { scope: route.query.scope, q: route.query.q },
}))
const assistant = computed(() => platform.myAssistants.find(item => item.id === route.params.id))
const sharedAssistant = computed(() => platform.sharedAssistants.find(item => item.id === route.params.id))
const sharedBindings = computed(() => sharedAssistant.value ? platform.assistantResourceBindings(sharedAssistant.value.id) : [])
const skippedBindings = computed(() => sharedBindings.value.filter(binding => binding.status !== '可用').length)
const draft = ref<AssistantDraft>(copyDraft())
const savedDraft = ref('')
const nameError = ref('')
const dirty = computed(() => !!assistant.value && JSON.stringify(draft.value) !== savedDraft.value)
useUnsavedChanges(dirty)

const members = computed(() => platform.users.filter(user => user.id !== platform.currentUser.id))
const sharedMembers = computed(() => members.value.filter(user => draft.value.allowedUserIds.includes(user.id)))
const resourcesById = computed(() => new Map(platform.visibleResources.map(resource => [resource.id, resource])))
const boundResources = computed(() => draft.value.resourceIds.flatMap(id => {
  const resource = resourcesById.value.get(id)
  return resource ? [resource] : []
}))
const sectionResources = computed(() => boundResources.value.filter(resource => resource.type === resourceType.value))
const inaccessibleResources = computed(() => draft.value.resourceIds.filter(id => !resourcesById.value.has(id)))
const sectionCounts = computed(() => {
  const counts: Partial<Record<Section, number>> = { sharing: sharedMembers.value.length }
  for (const resource of boundResources.value) counts[resource.type] = (counts[resource.type] ?? 0) + 1
  return counts
})
const availableResources = computed(() => platform.visibleResources.filter(resource =>
  resource.status === '可用' && !draft.value.resourceIds.includes(resource.id)))
const availableMembers = computed(() => members.value.filter(user => !draft.value.allowedUserIds.includes(user.id)))
const picker = ref<BindingPicker>()
const pickerSelection = ref<string | string[]>([])
const replacing = computed(() => picker.value?.kind === 'resource' && !!picker.value.replacing)
const pickerTitle = computed(() => {
  const current = picker.value
  if (!current) return ''
  if (current.kind === 'member') return '添加成员'
  return `${current.replacing ? '替换' : '添加'}${current.type}`
})
const pickerOptions = computed(() => {
  const current = picker.value
  if (current?.kind === 'member') {
    return availableMembers.value.map(user => ({ id: user.id, label: user.name, meta: user.department }))
  }
  return availableResources.value.filter(resource => resource.type === current?.type)
    .map(resource => ({ id: resource.id, label: resource.name, meta: resourceSource[resource.scope] }))
})
const selectedIds = computed(() => typeof pickerSelection.value === 'string'
  ? [pickerSelection.value].filter(Boolean) : pickerSelection.value)

watch(assistant, item => {
  section.value = 'information'
  picker.value = undefined
  loadDraft(item)
}, { immediate: true })
watch(() => draft.value.name, () => { nameError.value = '' })

function copyDraft(item?: Assistant): AssistantDraft {
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    instructions: item?.instructions ?? '',
    resourceIds: [...(item?.resourceIds ?? [])],
    allowedUserIds: [...(item?.allowedUserIds ?? [])],
  }
}

function loadDraft(item?: Assistant) {
  draft.value = copyDraft(item)
  savedDraft.value = JSON.stringify(draft.value)
  nameError.value = ''
}

function replaceBinding(id: string, replacementId?: string) {
  draft.value.resourceIds = draft.value.resourceIds.filter(current => current !== id)
  if (replacementId && !draft.value.resourceIds.includes(replacementId)) draft.value.resourceIds.push(replacementId)
}

function openPicker(next: BindingPicker) {
  pickerSelection.value = next.kind === 'resource' && next.replacing ? '' : []
  picker.value = next
}

function applyPickerSelection() {
  const current = picker.value
  const ids = selectedIds.value.filter(id => pickerOptions.value.some(option => option.id === id))
  if (!current || !ids.length) return
  if (current.kind === 'member') draft.value.allowedUserIds.push(...ids)
  else if (current.replacing) replaceBinding(current.replacing, ids[0])
  else draft.value.resourceIds.push(...ids)
  picker.value = undefined
}

function save() {
  if (!assistant.value) return false
  if (!draft.value.name.trim()) {
    section.value = 'information'
    nameError.value = '请输入助理名称'
    return false
  }

  const saved = platform.savePersonalAssistant({
    ...draft.value,
    allowedUserIds: draft.value.allowedUserIds.filter(id => members.value.some(member => member.id === id)),
  }, assistant.value.id)
  if (!saved) {
    ElMessage.error('保存失败，请检查助理配置后重试')
    return false
  }

  loadDraft(saved)
  ElMessage.success('助理配置已保存')
  return true
}

function tryAssistant() {
  const id = assistant.value?.id
  if (!id || (dirty.value && !save())) return
  void router.push({ path: '/work/chat', query: { assistant: id } })
}

function copyAssistant() {
  const source = sharedAssistant.value
  if (!source) return
  const skipped = skippedBindings.value
  const copy = platform.copySharedAssistant(source.id)
  if (!copy) {
    ElMessage.warning('此共享助理当前不可复制')
    return
  }
  ElMessage.success(skipped ? `已创建副本，${skipped} 项资源待补齐` : '已复制为我的助理')
  void router.push({ name: 'personal-assistant-configuration', params: { id: copy.id }, query: { scope: 'own' } })
}
</script>

<template>
  <section class="page-surface page-with-control-inset" aria-label="配置助理">
    <PageHeader :title="assistant?.name ?? sharedAssistant?.name ?? '配置助理'">
      <template #back>
        <RouterLink :to="listLocation" class="assistant-back"><ArrowLeft :size="15" aria-hidden="true" />我的助理</RouterLink>
      </template>
      <template #actions>
        <template v-if="assistant">
          <span class="save-status muted" aria-live="polite">{{ dirty ? '有未保存的修改' : '已保存' }}</span>
          <el-button @click="tryAssistant">{{ dirty ? '保存并试用' : '试用' }}</el-button>
          <el-button type="primary" native-type="submit" form="assistant-configuration-form" :disabled="!dirty">保存配置</el-button>
        </template>
        <template v-else-if="sharedAssistant">
          <RouterLink :to="{ path: '/work/chat', query: { assistant: sharedAssistant.id } }" class="el-button">对话</RouterLink>
          <el-button type="primary" @click="copyAssistant">复制为我的助理</el-button>
        </template>
      </template>
    </PageHeader>

    <div v-if="assistant" class="page-body assistant-editor">
      <nav class="assistant-sections" aria-label="配置分区">
        <div v-for="group in sectionGroups" :key="group.label" class="assistant-section-group" role="group" :aria-label="group.label">
          <p class="assistant-section-label" aria-hidden="true">{{ group.label }}</p>
          <button v-for="item in group.items" :key="item.id" type="button" class="side-link"
            :class="{ active: section === item.id }" :aria-current="section === item.id ? 'true' : undefined"
            @click="section = item.id">
            <span>{{ item.label }}</span><span v-if="sectionCounts[item.id]" class="section-count">{{ sectionCounts[item.id] }}</span>
          </button>
        </div>
      </nav>
      <el-select v-model="section" class="filter-field assistant-section-select" aria-label="配置分区" popper-class="filter-options">
        <ElOptionGroup v-for="group in sectionGroups" :key="group.label" :label="group.label">
          <el-option v-for="item in group.items" :key="item.id" :label="item.label" :value="item.id" />
        </ElOptionGroup>
      </el-select>

      <el-form id="assistant-configuration-form" class="panel assistant-config-form" label-position="top" @submit.prevent="save">
        <div class="section-header">
          <h2 class="section-title">{{ sectionTitle }}</h2>
          <el-button v-if="resourceType" :icon="Plus" size="small" @click="openPicker({ kind: 'resource', type: resourceType })">添加{{ resourceType }}</el-button>
          <el-button v-else-if="section === 'sharing'" :icon="Plus" size="small" @click="openPicker({ kind: 'member' })">添加成员</el-button>
        </div>
        <div v-if="section === 'information'" class="profile-layout">
          <aside class="panel assistant-profile-preview" aria-label="助理卡片预览">
            <span class="assistant-config-icon" aria-hidden="true"><el-icon><User /></el-icon></span>
            <div class="profile-preview-details">
              <strong>{{ draft.name.trim() || '助理名称' }}</strong>
              <p v-if="draft.description.trim()">{{ draft.description }}</p>
              <small>{{ sharedMembers.length ? `已共享给 ${sharedMembers.length} 人` : '个人创建' }}</small>
            </div>
          </aside>
          <div>
            <el-form-item label="名称" :error="nameError" required>
              <el-input v-model="draft.name" maxlength="36" placeholder="例如：项目周报助理" />
            </el-form-item>
            <el-form-item label="用途简介">
              <el-input v-model="draft.description" type="textarea" :rows="3" maxlength="120" placeholder="说明这个助理能帮你完成什么工作" />
            </el-form-item>
          </div>
        </div>
        <div v-else-if="section === 'instructions'" class="instructions-layout">
          <el-input v-model="draft.instructions" aria-label="工作指令" type="textarea" :rows="12" maxlength="2000" show-word-limit
            placeholder="说明助理应采用的步骤、结果格式和需要向你确认的情况。" />
          <details class="instruction-example">
            <summary>查看示例</summary>
            <dl>
              <dt>职责</dt><dd>整理本周进展，起草项目周报。</dd>
              <dt>工作步骤</dt><dd>先汇总已完成事项，再列出风险和下一步。</dd>
              <dt>确认条件</dt><dd>缺少数据时标记待补充，并向我确认。</dd>
            </dl>
          </details>
        </div>
        <template v-else-if="resourceType">
          <ul v-if="sectionResources.length" class="binding-list" :aria-label="`已绑定的${resourceType}`">
            <li v-for="resource in sectionResources" :key="resource.id" class="binding-row">
              <div class="binding-info">
                <strong>{{ resource.name }}</strong>
                <p v-if="resource.description">{{ resource.description }}</p>
                <p v-if="resource.status !== '可用'" class="binding-warning">{{ resourceUnavailableReason(resource) }}</p>
                <span class="binding-meta">{{ resourceSource[resource.scope] }}</span>
              </div>
              <div class="binding-actions">
                <el-tag size="small" effect="plain" :type="resource.status === '可用' ? 'success' : 'warning'">{{ resource.status }}</el-tag>
                <el-button link type="primary" :aria-label="`替换 ${resource.name}`"
                  @click="openPicker({ kind: 'resource', type: resource.type, replacing: resource.id })">替换</el-button>
                <el-button link :aria-label="`移除 ${resource.name}`" @click="replaceBinding(resource.id)">移除</el-button>
              </div>
            </li>
          </ul>
          <p v-else class="binding-empty">尚未绑定{{ resourceType }}</p>
          <ul v-if="inaccessibleResources.length" class="binding-list unavailable-bindings" aria-label="失去访问权的资源">
            <li v-for="id in inaccessibleResources" :key="id" class="binding-row">
              <div class="binding-info">
                <strong>已失去访问权的资源</strong>
                <p class="binding-warning">{{ resourceUnavailableReason() }}</p>
              </div>
              <el-button link @click="replaceBinding(id)">移除引用</el-button>
            </li>
          </ul>
        </template>
        <template v-else>
          <ul v-if="sharedMembers.length" class="binding-list" aria-label="已共享成员">
            <li v-for="member in sharedMembers" :key="member.id" class="binding-row">
              <div class="binding-info">
                <strong>{{ member.name }}</strong>
                <span class="binding-meta">{{ member.department }}</span>
              </div>
              <div class="binding-actions">
                <el-tag size="small" effect="plain" type="info">可使用</el-tag>
                <el-button link :aria-label="`移除 ${member.name}`"
                  @click="draft.allowedUserIds = draft.allowedUserIds.filter(id => id !== member.id)">移除</el-button>
              </div>
            </li>
          </ul>
          <p v-else class="binding-empty">暂无共享成员</p>
          <p class="sharing-note muted">所选成员可以使用此助理。移除成员并保存后收回使用权限。</p>
        </template>
      </el-form>
    </div>
    <div v-else-if="sharedAssistant" class="page-body">
      <section class="panel assistant-config-form shared-assistant-details" aria-label="只读助理配置">
        <div class="section-header">
          <h2 class="section-title">共享助理配置</h2>
          <el-tag effect="plain" type="info">只读</el-tag>
        </div>
        <p v-if="sharedAssistant.description" class="muted">{{ sharedAssistant.description }}</p>
        <h3 class="section-title">工作指令</h3>
        <p class="shared-instructions">{{ sharedAssistant.instructions || '未设置工作指令' }}</p>
        <h3 class="section-title">模型与资源</h3>
        <ul v-if="sharedBindings.length" class="binding-list">
          <li v-for="(binding, index) in sharedBindings" :key="index" class="binding-row">
            <div class="binding-info">
              <strong>{{ binding.resource?.name ?? binding.type ?? '资源' }}</strong>
              <span v-if="binding.resource" class="binding-meta">{{ binding.type }} · {{ resourceSource[binding.resource.scope] }}</span>
            </div>
            <el-tag size="small" effect="plain" :type="binding.status === '可用' ? 'success' : 'warning'">{{ binding.status }}</el-tag>
          </li>
        </ul>
        <p v-else class="muted">未绑定资源</p>
        <p class="sharing-note muted">{{ skippedBindings ? `复制会跳过 ${skippedBindings} 项未授权或失效的资源，可在副本中添加本人可用的资源。` : '复制后可在个人副本中独立修改配置。' }}</p>
      </section>
    </div>
    <div v-else class="page-body">
      <el-empty description="该助理不存在或当前账号没有配置权限" :image-size="84">
        <RouterLink :to="listLocation" class="el-button">返回我的助理</RouterLink>
      </el-empty>
    </div>

    <el-dialog :model-value="!!picker" :title="pickerTitle" width="min(440px, calc(100vw - 26px))" append-to-body
      @update:model-value="(open: boolean) => { if (!open) picker = undefined }">
      <el-select v-if="picker" :key="pickerTitle" v-model="pickerSelection" :multiple="!replacing" clearable filterable class="config-select"
        :aria-label="pickerTitle" :placeholder="picker.kind === 'member' ? '搜索或选择成员' : '搜索或选择资源'"
        :no-data-text="picker.kind === 'member' ? '暂无可添加的成员' : '暂无可选资源'">
        <el-option v-for="option in pickerOptions" :key="option.id" :value="option.id" :label="option.label">
          <span>{{ option.label }}</span><span class="option-meta">{{ option.meta }}</span>
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="picker = undefined">取消</el-button>
        <el-button type="primary" :disabled="!selectedIds.length" @click="applyPickerSelection">{{ replacing ? '替换' : '添加' }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.assistant-back { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); font-size: 13px; white-space: nowrap; }
.assistant-back:hover { text-decoration: underline; }
.save-status { font-size: 12px; white-space: nowrap; }
.assistant-editor { display: grid; grid-template-columns: 168px minmax(0, 1fr); align-items: start; gap: 16px; }
.assistant-sections { display: grid; gap: 12px; }
.assistant-section-group { display: grid; gap: 2px; }
.assistant-section-label { margin: 2px 10px 3px; color: var(--muted); font-size: 12px; }
.assistant-sections .side-link { justify-content: space-between; border: 0; background: transparent; text-align: start; }
.assistant-sections .side-link:hover { background: var(--surface-hover); }
.assistant-sections .side-link.active { background: var(--soft); }
.section-count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.assistant-section-select { display: none; }
.assistant-config-form { width: min(100%, 820px); min-width: 0; padding: 16px; }
.shared-assistant-details { overflow-wrap: anywhere; }
.shared-instructions { white-space: pre-wrap; }
.assistant-config-form :deep(.el-form-item:last-child) { margin-bottom: 0; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; margin-bottom: 12px; }
.section-header .section-title { margin: 0; }
.profile-layout, .instructions-layout { display: grid; align-items: start; gap: 16px; }
.profile-layout { grid-template-columns: minmax(200px, 2fr) minmax(0, 3fr); }
.assistant-profile-preview { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 10px; }
.assistant-config-icon { display: grid; place-items: center; flex: 0 0 48px; height: 48px; border-radius: 10px; color: var(--accent); background: var(--soft); font-size: 23px; }
.profile-preview-details { display: grid; gap: 4px; min-width: 0; }
.profile-preview-details strong { overflow: hidden; font-size: 16px; line-height: 1.25; white-space: nowrap; text-overflow: ellipsis; }
.profile-preview-details p { display: -webkit-box; margin: 0; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.profile-preview-details small { color: var(--muted); font-size: 12px; }
.instructions-layout { grid-template-columns: minmax(0, 1fr) 190px; }
.instruction-example { padding: 9px 11px; border-radius: var(--radius-surface); background: var(--surface-muted); font-size: 13px; }
.instruction-example summary { cursor: pointer; font-weight: 600; }
.instruction-example dl { display: grid; gap: 3px; margin: 9px 0 0; }
.instruction-example dt { font-weight: 600; }
.instruction-example dd { margin: 0 0 6px; color: var(--muted); }
.config-select { width: 100%; }
.option-meta { float: right; margin-left: 8px; color: var(--muted); font-size: 12px; }
.binding-list { margin: 0; padding: 0; list-style: none; }
.binding-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; padding: 10px 0; }
.binding-row + .binding-row { border-top: 1px solid var(--line); }
.binding-info { display: grid; flex: 1 1 160px; gap: 3px; min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
.binding-info p { margin: 0; color: var(--text-secondary); font-size: 13px; }
.binding-info .binding-warning { color: var(--el-color-warning-dark-2); }
.binding-meta, .binding-empty, .sharing-note { color: var(--muted); font-size: 12px; }
.binding-empty { margin: 0; padding: 10px 0; }
.sharing-note { margin: 6px 0 0; line-height: 1.5; }
.unavailable-bindings { margin-top: 8px; padding: 0 10px; border-radius: var(--radius-surface); background: var(--el-color-warning-light-9); }
.binding-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.binding-actions .el-button + .el-button { margin: 0; }
@container (max-width: 790px) {
  .profile-layout, .instructions-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 620px) {
  .assistant-editor { grid-template-columns: 1fr; gap: 8px; }
  .assistant-sections { display: none; }
  .assistant-section-select { display: block; width: 136px; }
  .assistant-config-form { padding: 12px; }
}
</style>
