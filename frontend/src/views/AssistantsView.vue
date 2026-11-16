<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Collection, Plus, Setting, Share, Star, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { usePlatformStore, type Assistant, type AssistantDraft } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { resourceUnavailableReason } from '@/resourceAvailability'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const router = useRouter()
const route = useRoute()
const assistantsPath = '/work/assistants'
const sharedScope = computed(() => route.query.scope === 'shared')
const listedAssistants = computed(() => {
  const assistants = sharedScope.value ? platform.sharedAssistants : platform.myAssistants
  return assistants.map(assistant => ({
    assistant,
    resources: sharedScope.value ? [] : platform.visibleResources.filter(resource => assistant.resourceIds.includes(resource.id)),
  }))
})
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
const inaccessibleResources = computed(() => resourceIds.value.filter(id => !platform.visibleResources.some(resource => resource.id === id)))
const unavailableBindings = computed(() => resourceIds.value.flatMap(id => {
  const resource = platform.visibleResources.find(item => item.id === id)
  const reason = resourceUnavailableReason(resource)
  if (!reason) return []

  return [{
    id,
    name: resource?.name ?? '已失去访问权的资源',
    reason,
    alternatives: resource ? platform.visibleResources.filter(item =>
      item.type === resource.type && item.status === '可用' && !resourceIds.value.includes(item.id),
    ).slice(0, 3) : [],
  }]
}))

watch(() => platform.currentUser.id, () => { editing.value = false })
watch(() => route.query.configure, id => {
  if (route.path !== assistantsPath || typeof id !== 'string') return
  const canConfigure = platform.myAssistants.some(assistant => assistant.id === id)
  if (canConfigure) configure(id)
  void router.replace({
    query: { ...route.query, scope: canConfigure ? undefined : route.query.scope, configure: undefined },
  })
}, { immediate: true })

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
    resourceIds: resourceIds.value,
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

function replaceBinding(id: string, replacementId?: string) {
  resourceIds.value = resourceIds.value.filter(current => current !== id)
  if (replacementId && !resourceIds.value.includes(replacementId)) resourceIds.value.push(replacementId)
}

function sharedSource(assistant: Assistant) {
  if (assistant.scope === 'organization') return '组织共享'
  const member = platform.users.find((user) => user.id === assistant.userId)
  return member ? member.name + '共享' : '成员共享'
}
</script>

<template>
  <section class="page-surface assistants-page" aria-label="我的助理">
    <header class="page-controls">
      <nav class="page-tabs" aria-label="助理来源">
        <RouterLink :to="assistantsPath" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="!sharedScope ? 'page' : undefined" @click="navigate">
            <el-icon aria-hidden="true"><User /></el-icon>个人配置
          </a>
        </RouterLink>
        <RouterLink :to="{ path: assistantsPath, query: { scope: 'shared' } }" custom v-slot="{ href, navigate }">
          <a class="page-tab" :href="href" :aria-current="sharedScope ? 'page' : undefined" @click="navigate">
            <el-icon aria-hidden="true"><Share /></el-icon>他人共享
          </a>
        </RouterLink>
      </nav>
      <div class="page-toolbar page-tab-toolbar">
        <span class="assistant-count">{{ listedAssistants.length }} 个{{ sharedScope ? '共享助理' : '个人助理' }}</span>
        <div v-if="!sharedScope || canDevelop" class="page-toolbar-controls">
          <el-button v-if="!sharedScope" type="primary" :icon="Plus" @click="configure()">新建助理</el-button>
          <el-button v-else :icon="Setting" @click="router.push({ name: 'assistant-management' })">组织助理配置</el-button>
        </div>
      </div>
    </header>

    <div v-if="!sharedScope || listedAssistants.length" class="page-body assistant-grid">
      <article v-if="!sharedScope" class="panel assistant-card">
        <div class="assistant-card-heading">
          <div class="assistant-icon"><el-icon><Star /></el-icon></div>
          <h2>默认助理</h2>
          <span class="assistant-badge">平台内置</span>
        </div>
        <p class="description">处理日常办公，可使用你有权访问的资料和能力。</p>
        <div class="card-actions"><el-button size="small" type="primary" plain @click="useAssistant('default')">使用</el-button></div>
      </article>
      <article v-for="{ assistant, resources } in listedAssistants" :key="assistant.id" class="panel assistant-card">
        <div class="assistant-card-heading">
          <div class="assistant-icon"><el-icon><component :is="sharedScope ? Share : Star" /></el-icon></div>
          <h2>{{ assistant.name }}</h2>
          <span v-if="sharedScope" class="assistant-badge" :class="{ 'organization-badge': assistant.scope === 'organization' }">
            {{ sharedSource(assistant) }}
          </span>
          <span v-else-if="assistant.allowedUserIds?.length" class="assistant-badge">已共享给 {{ assistant.allowedUserIds.length }} 人</span>
        </div>
        <p v-if="assistant.description" class="description">{{ assistant.description }}</p>
        <div v-if="resources.length" class="resource-tags">
          <span v-for="resource in resources.slice(0, 3)" :key="resource.id"><el-icon><Collection /></el-icon>{{ resource.name }}</span>
          <span v-if="resources.length > 3">+{{ resources.length - 3 }}</span>
        </div>
        <div class="card-actions">
          <el-button v-if="!sharedScope" size="small" :icon="Setting" @click="configure(assistant.id)">配置</el-button>
          <el-button size="small" type="primary" plain @click="useAssistant(assistant.id)">使用</el-button>
        </div>
      </article>
    </div>
    <p v-else class="empty">暂无共享给你的助理。</p>

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
            <el-option v-for="id in inaccessibleResources" :key="id" :value="id" label="已失去访问权的资源" disabled />
          </el-select>
          <ul v-if="unavailableBindings.length" class="unavailable-bindings" aria-label="资源使用问题">
            <li v-for="binding in unavailableBindings" :key="binding.id">
              <strong>{{ binding.name }}</strong>
              <p>{{ binding.reason }}</p>
              <div class="binding-actions">
                <button v-for="item in binding.alternatives" :key="item.id" type="button"
                  @click="replaceBinding(binding.id, item.id)">改用{{ item.name }}</button>
                <button type="button" @click="replaceBinding(binding.id)">移除引用</button>
              </div>
            </li>
          </ul>
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
  </section>
</template>

<style scoped>
.assistant-count { color: var(--muted); font-size: 13px; }
.assistant-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 10px; }
.assistant-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-width: 0; }
.assistant-card-heading { display: flex; align-items: center; gap: 8px; }
.assistant-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; border-radius: 8px; color: var(--accent); background: var(--soft); font-size: 16px; }
.assistant-card h2 { flex: 1; min-width: 0; margin: 0; font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
.assistant-badge { max-width: 42%; padding: 3px 6px; border-radius: 5px; color: var(--muted); background: var(--soft); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.organization-badge { color: var(--accent); }
.description { overflow-wrap: anywhere; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.resource-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.resource-tags span { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 2px 6px; border-radius: 5px; color: var(--muted); background: var(--soft); font-size: 12px; overflow-wrap: anywhere; }
.resource-tags .el-icon { flex: none; }
.card-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: auto; padding-top: 7px; border-top: 1px solid var(--line); }
.card-actions > .el-button { margin: 0; }
.option-type { float: right; margin-left: 8px; color: var(--muted); font-size: 12px; }
.assistant-form { max-height: 65dvh; overflow-y: auto; padding-right: 4px; }
.sharing-note { margin: 5px 0 0; font-size: 12px; line-height: 1.5; }
.unavailable-bindings { display: grid; gap: 7px; width: 100%; margin: 7px 0 0; padding: 0; list-style: none; }
.unavailable-bindings li { padding: 6px 9px; border-radius: 6px; background: #fff7e8; color: #815218; font-size: 12px; line-height: 1.5; }
.unavailable-bindings p { margin: 2px 0; }
.binding-actions { display: flex; flex-wrap: wrap; gap: 5px 9px; }
.binding-actions button { padding: 0; border: 0; background: transparent; color: var(--accent); font-size: inherit; }
.empty { margin: 0; text-align: center; padding: 25px 18px; color: var(--muted); }
</style>
