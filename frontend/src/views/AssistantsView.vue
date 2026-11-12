<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Collection, Plus, Setting, Share, Star } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { usePlatformStore, type Assistant, type AssistantDraft } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const router = useRouter()
const canDevelop = computed(() => platform.currentUser.role === 'admin' || organization.capabilities.some(item =>
  item.type === '组织助理' && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id))))
const editing = ref(false)
const assistantId = ref('')
const name = ref('')
const description = ref('')
const instructions = ref('')
const resourceIds = ref<string[]>([])
const allowedUserIds = ref<string[]>([])
const otherMembers = computed(() => platform.users.filter((user) => user.id !== platform.currentUser.id))
const selectableResources = computed(() => platform.visibleResources.filter(
  (resource) => resource.status === '可用' || resourceIds.value.includes(resource.id),
))

watch(() => platform.currentUser.id, () => { editing.value = false })

function configure(id = '') {
  const assistant = platform.myAssistants.find((item) => item.id === id)
  assistantId.value = assistant?.id ?? ''
  name.value = assistant?.name ?? ''
  description.value = assistant?.description ?? ''
  instructions.value = assistant?.instructions ?? ''
  resourceIds.value = [...(assistant?.resourceIds ?? [])]
  allowedUserIds.value = [...(assistant?.allowedUserIds ?? [])]
  editing.value = true
}

function save() {
  const title = name.value.trim()
  if (!title) return
  const id = assistantId.value || undefined
  const draft: AssistantDraft = {
    name: title,
    description: description.value.trim(),
    instructions: instructions.value.trim(),
    resourceIds: resourceIds.value.filter((id) => platform.visibleResources.some((resource) => resource.id === id)),
    allowedUserIds: allowedUserIds.value.filter((id) => otherMembers.value.some((member) => member.id === id)),
  }
  const saved = platform.savePersonalAssistant(draft, id)
  if (!saved) {
    ElMessage.error('保存失败，请检查助理配置后重试')
    return
  }
  editing.value = false
  ElMessage.success(id ? '助理配置已保存' : '已创建个人助理')
}

function useAssistant(id: string) {
  void router.push({ path: '/work/chat', query: { assistant: id } })
}

function assignedResources(ids: string[]) {
  return platform.visibleResources.filter((resource) => ids.includes(resource.id))
}

function sharedSource(assistant: Assistant) {
  if (assistant.scope === 'organization') return '组织共享'
  const member = platform.users.find((user) => user.id === assistant.userId)
  return member ? member.name + '共享' : '成员共享'
}
</script>

<template>
  <div class="page assistants-page">
    <header class="page-header">
      <div><h1>我的助理</h1><p class="muted">配置个人助理，或使用组织和成员共享的助理。</p></div>
      <div class="assistant-header-actions">
        <el-button v-if="canDevelop" :icon="Setting" @click="router.push({ name: 'assistant-management' })">组织助理配置</el-button>
        <el-button type="primary" :icon="Plus" @click="configure()">新建助理</el-button>
      </div>
    </header>

    <section class="panel default-assistant">
      <div class="assistant-icon builtin"><el-icon><Star /></el-icon></div>
      <div class="default-description">
        <h2>默认助理</h2>
        <p>处理日常办公，根据工作需要使用你有权访问的资料和能力。</p>
      </div>
      <el-button :icon="ArrowRight" @click="useAssistant('default')">使用</el-button>
    </section>

    <section aria-labelledby="own-assistants-title">
      <div class="list-title">
        <h2 id="own-assistants-title" class="section-title">个人配置的助理</h2><span class="muted">{{ platform.myAssistants.length }} 个</span>
      </div>
      <div v-if="platform.myAssistants.length" class="assistant-grid">
        <article v-for="assistant in platform.myAssistants" :key="assistant.id" class="panel assistant-card">
          <div class="assistant-card-heading">
            <div class="assistant-icon"><el-icon><Star /></el-icon></div>
            <span v-if="assistant.allowedUserIds?.length" class="assistant-badge">已共享给 {{ assistant.allowedUserIds.length }} 人</span>
          </div>
          <h3>{{ assistant.name }}</h3>
          <p class="description">{{ assistant.description || '尚未填写职责说明' }}</p>
          <div class="resource-tags">
            <span v-for="resource in assignedResources(assistant.resourceIds).slice(0, 3)" :key="resource.id"><el-icon><Collection /></el-icon>{{ resource.name }}</span>
            <span v-if="assignedResources(assistant.resourceIds).length > 3">+{{ assignedResources(assistant.resourceIds).length - 3 }}</span>
            <span v-if="!assignedResources(assistant.resourceIds).length">未配置资源</span>
          </div>
          <div class="card-actions">
            <el-button :icon="Setting" @click="configure(assistant.id)">配置</el-button>
            <el-button type="primary" plain @click="useAssistant(assistant.id)">使用</el-button>
          </div>
        </article>
      </div>
      <p v-else class="panel empty">你还没有配置个人助理。</p>
    </section>

    <section aria-labelledby="shared-assistants-title">
      <div class="list-title">
        <h2 id="shared-assistants-title" class="section-title">共享助理</h2><span class="muted">{{ platform.sharedAssistants.length }} 个</span>
      </div>
      <div v-if="platform.sharedAssistants.length" class="assistant-grid">
        <article v-for="assistant in platform.sharedAssistants" :key="assistant.id" class="panel assistant-card">
          <div class="assistant-card-heading">
            <div class="assistant-icon"><el-icon><Share /></el-icon></div>
            <span class="assistant-badge" :class="{ 'organization-badge': assistant.scope === 'organization' }">{{ sharedSource(assistant) }}</span>
          </div>
          <h3>{{ assistant.name }}</h3>
          <p class="description shared-description">{{ assistant.description || '尚未填写职责说明' }}</p>
          <div class="card-actions"><el-button type="primary" plain @click="useAssistant(assistant.id)">使用</el-button></div>
        </article>
      </div>
      <p v-else class="panel empty">暂无共享给你的助理。</p>
    </section>

    <el-dialog v-model="editing" :title="assistantId ? '配置助理' : '新建助理'" width="min(560px, calc(100vw - 30px))" top="7vh">
      <el-form class="assistant-form" label-position="top" @submit.prevent="save">
        <el-form-item label="名称" required><el-input v-model="name" maxlength="36" placeholder="例如：项目周报助理" /></el-form-item>
        <el-form-item label="职责说明"><el-input v-model="description" maxlength="120" placeholder="这个助理主要帮你做什么？" /></el-form-item>
        <el-form-item label="工作方法"><el-input v-model="instructions" type="textarea" :rows="4" maxlength="2000"
          placeholder="说明助理应采用的步骤、结果格式和需要向你确认的情况。" /></el-form-item>
        <el-form-item label="可用资源">
          <el-select v-model="resourceIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="从资源库选择" style="width: 100%">
            <el-option v-for="resource in selectableResources" :key="resource.id" :value="resource.id" :label="resource.name"
              :disabled="resource.status !== '可用'">
              <span>{{ resource.name }}</span><span class="option-type">{{ resource.type }} · {{ resource.status }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="共享给成员">
          <el-select v-model="allowedUserIds" multiple filterable clearable placeholder="选择可以使用此助理的成员" style="width: 100%">
            <el-option v-for="member in otherMembers" :key="member.id" :value="member.id" :label="member.name">
              <span>{{ member.name }}</span><span class="option-type">{{ member.department }}</span>
            </el-option>
          </el-select>
          <p class="sharing-note muted">所选成员可以使用此助理。移除成员并保存后收回使用权限。</p>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="editing = false">取消</el-button><el-button type="primary" :disabled="!name.trim()" @click="save">保存助理</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.assistant-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.assistant-header-actions .el-button { margin-left: 0; }
.default-assistant { display: flex; align-items: center; gap: 15px; padding: 19px; }
.assistant-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid #dce4fb; color: var(--accent); background: #edf2ff; border-radius: 10px; font-size: 18px; }
.assistant-icon.builtin { width: 44px; height: 44px; flex-basis: 44px; font-size: 21px; }
.default-description { flex: 1; }
.default-description h2, .assistant-card h3 { margin: 0; font-size: 16px; font-weight: 650; }
.default-description p, .description { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.list-title { display: flex; align-items: center; justify-content: space-between; margin: 26px 0 11px; }
.list-title h2 { margin: 0; }
.list-title > span { font-size: 13px; }
.assistant-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 13px; }
.assistant-card { display: flex; flex-direction: column; padding: 17px; min-width: 0; }
.assistant-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.assistant-badge { align-self: flex-start; padding: 4px 7px; border-radius: 6px; color: var(--muted); background: var(--soft); font-size: 12px; overflow-wrap: anywhere; }
.organization-badge { color: var(--accent); }
.assistant-card h3 { margin-top: 12px; overflow-wrap: anywhere; }
.description { flex: 1; overflow-wrap: anywhere; }
.shared-description { margin-bottom: 14px; }
.resource-tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 14px 0; }
.resource-tags span { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 6px; color: var(--muted); background: var(--soft); font-size: 12px; overflow-wrap: anywhere; }
.card-actions { display: flex; justify-content: flex-end; padding-top: 13px; border-top: 1px solid var(--line); }
.option-type { float: right; margin-left: 8px; color: var(--muted); font-size: 12px; }
.assistant-form { max-height: 65dvh; overflow-y: auto; padding-right: 4px; }
.sharing-note { margin: 5px 0 0; font-size: 12px; line-height: 1.5; }
.empty { margin: 0; text-align: center; padding: 25px 18px; color: var(--muted); }
@media (max-width: 560px) { .default-assistant { gap: 10px; padding: 13px; } .assistant-grid { grid-template-columns: 1fr; } }
</style>
