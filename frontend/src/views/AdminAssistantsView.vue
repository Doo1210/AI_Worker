<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElDrawer, ElMessage } from 'element-plus'
import { ChatLineRound, Plus, Search } from '@element-plus/icons-vue'
import { usePlatformStore, type Assistant, type AssistantDraft } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const store = usePlatformStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const isAdmin = computed(() => store.currentUser.role === 'admin')
const query = ref('')
const editorOpen = ref(false)
const editingId = ref<string>()
const trialPrompt = ref('')
const trialResult = ref('')
const currentCapability = computed(() => organization.capabilities.find(item => item.id === editingId.value))
const canEdit = computed(() => editingId.value ? organization.canConfigureCapability(editingId.value) : isAdmin.value)
const canPublish = computed(() => Boolean(editingId.value && organization.canPublishCapability(editingId.value)))
const draft = reactive<AssistantDraft>({
  name: '', description: '', instructions: '', resourceIds: [], allowedUserIds: [],
})
const organizationResources = computed(() => store.resources.filter(resource => resource.scope === 'organization'
  && (isAdmin.value || store.visibleResources.some(item => item.id === resource.id) || draft.resourceIds.includes(resource.id))))
const listedAssistants = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return store.assistants.filter(item => item.scope === 'organization'
    && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id))
    && [item.name, item.description].some(value => value.toLocaleLowerCase().includes(keyword)))
})

watch(() => store.currentUser.id, () => {
  editorOpen.value = false
  editingId.value = undefined
  query.value = ''
})

function openEditor(assistant?: Assistant) {
  if (assistant ? !organization.canConfigureCapability(assistant.id) && !organization.canPublishCapability(assistant.id) : !isAdmin.value) return
  editingId.value = assistant?.id
  trialPrompt.value = ''
  trialResult.value = ''
  Object.assign(draft, {
    name: assistant?.name ?? '',
    description: assistant?.description ?? '',
    instructions: assistant?.instructions ?? '',
    resourceIds: [...(assistant?.resourceIds ?? [])],
    allowedUserIds: [...(assistant?.allowedUserIds ?? [])],
  })
  editorOpen.value = true
}

function saveAssistant() {
  if (!canEdit.value) return
  if (!draft.name.trim()) {
    ElMessage.warning('请输入助理名称')
    return
  }
  const existing = store.assistants.find(item => item.id === editingId.value)
  const saved = store.saveOrganizationAssistant({ ...draft, allowedUserIds: [...(existing?.allowedUserIds ?? [])] }, editingId.value)
  if (!saved) {
    ElMessage.error('保存失败，请重新打开配置后重试')
    return
  }
  ElMessage.success(editingId.value ? '已保存助理配置' : '已新建组织助理草稿')
  editingId.value = saved.id
}

function publish() {
  if (!editingId.value || !organization.publishCapability(editingId.value)) return
  ElMessage.success('已发布稳定版本')
}

function runTrial() {
  if (!canEdit.value || !trialPrompt.value.trim()) return
  const guidance = draft.instructions.trim().split('\n')[0] || '先核对所需资料，再整理处理步骤。'
  trialResult.value = '收到试用任务「' + trialPrompt.value.trim() + '」。' + guidance
}

watch(() => route.query.assistant, id => {
  const assistant = store.assistants.find(item => item.scope === 'organization' && item.id === id)
  if (assistant) openEditor(assistant)
}, { immediate: true })
</script>

<template>
  <div class="page">
      <header class="page-header">
        <div>
          <h1>组织助理配置</h1>
          <p>编辑、试用和发布获授权维护的组织助理。</p>
        </div>
        <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="openEditor()">新建组织助理</el-button>
      </header>

      <section class="panel assistant-list" aria-label="组织助理列表">
        <div class="assistant-filters">
          <el-input v-model="query" :prefix-icon="Search" aria-label="搜索组织助理" placeholder="搜索助理名称或用途" clearable />
        </div>
        <template v-if="listedAssistants.length">
          <div class="assistant-columns" aria-hidden="true"><span>助理</span><span>生效版本</span><span>操作</span></div>
          <ul class="assistant-rows">
            <li v-for="assistant in listedAssistants" :key="assistant.id" class="assistant-row">
              <div class="assistant-summary">
                <span class="assistant-icon" aria-hidden="true"><el-icon><ChatLineRound /></el-icon></span>
                <div>
                  <strong>{{ assistant.name }}</strong>
                  <p v-if="assistant.description" class="muted">{{ assistant.description }}</p>
                </div>
              </div>
              <div class="assistant-recipients">
                <span class="recipient-label">生效版本</span>
                <span>{{ organization.capabilities.find(item => item.id === assistant.id)?.version || '尚未启用' }}</span>
              </div>
              <el-button link type="primary" :aria-label="`配置${assistant.name}`" @click="openEditor(assistant)">配置</el-button>
            </li>
          </ul>
        </template>
        <el-empty v-else :description="query.trim() ? '没有匹配的组织助理' : '还没有组织助理'" :image-size="84" />
      </section>

      <ElDrawer v-model="editorOpen" :title="editingId ? '配置组织助理' : '新建组织助理'" size="min(100vw, 520px)" append-to-body>
        <el-form v-if="canEdit" id="organization-assistant-editor" label-position="top" class="assistant-editor" @submit.prevent="saveAssistant">
          <el-form-item label="助理名称" required>
            <el-input v-model="draft.name" placeholder="例如 客户支持助理" maxlength="48" />
          </el-form-item>
          <el-form-item label="用途说明">
            <el-input v-model="draft.description" type="textarea" :rows="2" placeholder="说明这个助理能协助成员完成哪些工作" maxlength="160" />
          </el-form-item>
          <el-form-item label="工作指令">
            <el-input v-model="draft.instructions" type="textarea" :rows="4" placeholder="填写助理的工作步骤、规则或交付要求" />
          </el-form-item>
          <el-form-item label="组织资源">
            <el-select v-model="draft.resourceIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择组织资源" no-data-text="暂无组织资源">
              <el-option v-for="resource in organizationResources" :key="resource.id" :value="resource.id" :label="`${resource.name} · ${resource.type}${resource.status === '可用' ? '' : ` · ${resource.status}`}`" />
            </el-select>
            <p class="field-note">成员使用助理时，资源仍按成员已有权限和连接状态使用。</p>
          </el-form-item>
          <el-form-item label="试用任务">
            <el-input v-model="trialPrompt" placeholder="输入一项样例任务" />
            <el-button :disabled="!trialPrompt.trim()" @click="runTrial">运行模拟试用</el-button>
            <p v-if="trialResult" class="field-note">{{ trialResult }}</p>
          </el-form-item>
        </el-form>
        <p v-if="currentCapability" class="field-note">已发布版本 · {{ currentCapability.availableVersions.join('、') || '暂无' }}</p>
        <template #footer>
          <el-button @click="editorOpen = false">关闭</el-button>
          <el-button v-if="canPublish" @click="publish">发布已保存的配置</el-button>
          <el-button v-if="canEdit" type="primary" native-type="submit" form="organization-assistant-editor">保存配置</el-button>
        </template>
      </ElDrawer>
  </div>
</template>

<style scoped>
.assistant-list { overflow: hidden; }
.assistant-filters { padding: 14px 16px; }
.assistant-filters .el-input { max-width: 340px; }
.assistant-columns, .assistant-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 3rem;
  align-items: center;
  gap: 18px;
  padding: 12px 16px;
}
.assistant-columns > :last-child, .assistant-row > :last-child { justify-self: end; }
.assistant-columns {
  color: var(--muted);
  background: var(--canvas);
  font-size: 12px;
  font-weight: 600;
  border-top: 1px solid var(--line);
}
.assistant-rows { margin: 0; padding: 0; list-style: none; }
.assistant-row { min-height: 67px; border-top: 1px solid var(--line); }
.assistant-summary { display: flex; align-items: center; gap: 10px; min-width: 0; }
.assistant-summary > div { min-width: 0; overflow-wrap: anywhere; }
.assistant-summary p, .assistant-recipients p { margin: 4px 0 0; font-size: 12px; }
.assistant-icon {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--accent);
  background: var(--soft);
}
.assistant-recipients { min-width: 0; font-size: 13px; }
.assistant-recipients p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recipient-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.assistant-editor .el-select { width: 100%; }
.field-note { width: 100%; margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
@media (max-width: 650px) {
  .assistant-columns { display: none; }
  .assistant-row { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 14px; }
  .assistant-row .el-button { grid-row: 1; grid-column: 2; }
  .assistant-recipients { grid-row: 2; grid-column: 1 / -1; padding-left: 44px; }
  .recipient-label { position: static; clip-path: none; margin-right: 6px; color: var(--muted); }
}
</style>
