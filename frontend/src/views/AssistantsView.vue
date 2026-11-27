<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatDotRound, Plus, Search, Setting, Share, Star, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { resourceTypes } from '@/resourceNavigation'
import { generalAssistantName, usePlatformStore, type Assistant, type Resource } from '@/stores/platform'

const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()
const generalDescription = '处理日常办公，协助整理资料和起草文稿。'
const generalResourceSummary = '可使用你有权访问的资料和能力。'
const scopes = [
  { id: 'all', label: '全部助理' },
  { id: 'builtin', label: '内置助理' },
  { id: 'own', label: '我的助理' },
  { id: 'shared', label: '共享助理' },
] as const
const scope = computed(() => scopes.find(item => item.id === route.query.scope)?.id ?? 'all')
const search = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => { void router.replace({ query: { ...route.query, q: value || undefined } }) },
})
const keyword = computed(() => search.value.trim().toLocaleLowerCase())
const showPersonalAssistants = computed(() => scope.value === 'all' || scope.value === 'own')
const showSharedAssistants = computed(() => scope.value === 'all' || scope.value === 'shared')
const showBuiltInAssistant = computed(() => (showPersonalAssistants.value || scope.value === 'builtin')
  && matchesSearch(generalAssistantName, `${generalDescription} ${generalResourceSummary}`))
const assistantCards = computed(() => {
  const assistants = [
    ...(showPersonalAssistants.value ? platform.myAssistants : []),
    ...(showSharedAssistants.value ? platform.sharedAssistants : []),
  ].filter(assistant => matchesSearch(assistant.name, assistant.description))
  const cards = assistants.map(assistant => {
    const isOwn = assistant.userId === platform.currentUser.id && assistant.scope !== 'organization'
    const sharedCount = assistant.allowedUserIds?.length ?? 0
    const source = isOwn ? (sharedCount ? `已共享给 ${sharedCount} 人` : '个人创建') : sharedSource(assistant)
    const resources = platform.visibleResources.filter(resource => assistant.resourceIds.includes(resource.id))
    return {
      id: assistant.id,
      name: assistant.name,
      description: assistant.description,
      source,
      canConfigure: isOwn,
      canInspect: !isOwn,
      icon: isOwn ? User : Share,
      summary: summarizeResources(resources) || (isOwn && !assistant.resourceIds.length ? '未绑定资源' : '暂无可见资源'),
    }
  })
  if (showBuiltInAssistant.value) {
    cards.unshift({
      id: 'default', name: generalAssistantName, description: generalDescription,
      source: '平台内置', canConfigure: false, canInspect: false, icon: Star, summary: generalResourceSummary,
    })
  }
  return cards
})
const creating = ref(false)
const name = ref('')
const description = ref('')
watch(() => platform.currentUser.id, () => { creating.value = false })

function matchesSearch(title: string, intro: string) {
  return title.toLocaleLowerCase().includes(keyword.value) || intro.toLocaleLowerCase().includes(keyword.value)
}

function selectScope(value: typeof scopes[number]['id']) {
  void router.push({ name: 'personal-assistants', query: { ...route.query, scope: value === 'all' ? undefined : value } })
}

function configurationLocation(id: string) {
  return {
    name: 'personal-assistant-configuration', params: { id }, query: { scope: route.query.scope, q: route.query.q },
  }
}

function openCreate() {
  name.value = ''
  description.value = ''
  creating.value = true
}

function createAssistant() {
  const title = name.value.trim()
  if (!title || !creating.value) return
  const saved = platform.savePersonalAssistant({
    name: title, description: description.value, instructions: '', resourceIds: [], allowedUserIds: [],
  })
  if (!saved) {
    ElMessage.error('创建助理失败，请重试')
    return
  }
  creating.value = false
  ElMessage.success('已创建个人助理')
  void router.push(configurationLocation(saved.id))
}

function useAssistant(id: string) {
  void router.push({ path: '/work/chat', query: { assistant: id } })
}

function sharedSource(assistant: Assistant) {
  if (assistant.scope === 'organization') return '组织分配'
  const member = platform.users.find((user) => user.id === assistant.userId)
  return member ? member.name + '共享' : '成员共享'
}

function summarizeResources(resources: Resource[]) {
  return resourceTypes.flatMap(type => {
    const matches = resources.filter(resource => resource.type === type)
    const [first] = matches
    if (!first) return []
    return [type === '模型' && matches.length === 1 ? first.name : `${matches.length} 项${type}`]
  }).join(' · ')
}
</script>

<template>
  <section class="page-surface page-with-control-inset assistants-page" aria-labelledby="assistants-title">
    <header class="page-controls">
      <div class="page-title-row">
        <h1 id="assistants-title">我的助理</h1>
        <div v-if="showPersonalAssistants" class="page-toolbar-controls">
          <el-button type="primary" :icon="Plus" @click="openCreate">新建助理</el-button>
        </div>
      </div>
      <div class="page-toolbar page-tab-toolbar">
        <div class="page-toolbar-filters assistant-filters">
          <el-select :model-value="scope" class="filter-field filter-select" aria-label="助理来源"
            popper-class="filter-options" @update:model-value="selectScope">
            <el-option v-for="item in scopes" :key="item.id" :value="item.id" :label="item.label" />
          </el-select>
          <el-input v-model="search" :prefix-icon="Search" class="assistant-search" aria-label="搜索助理" placeholder="搜索助理" clearable />
        </div>
        <span class="assistant-count" aria-live="polite">{{ assistantCards.length }} 个助理</span>
      </div>
    </header>

    <div v-if="assistantCards.length" class="page-body assistant-grid">
      <article v-for="card in assistantCards" :key="card.id" class="panel assistant-card">
        <div class="assistant-card-body">
          <div class="assistant-icon" aria-hidden="true"><el-icon><component :is="card.icon" /></el-icon></div>
          <div class="assistant-card-details">
            <h2 :title="card.name">{{ card.name }}</h2>
            <p v-if="card.description" class="description" :title="card.description">{{ card.description }}</p>
            <p class="assistant-source">{{ card.source }}</p>
          </div>
        </div>
        <div class="assistant-card-footer">
          <p class="assistant-resource-summary">{{ card.summary }}</p>
          <div class="card-actions">
            <el-button type="primary" :icon="ChatDotRound" :aria-label="`对话：${card.name}`"
              @click="useAssistant(card.id)">对话</el-button>
            <RouterLink v-if="card.canConfigure" :to="configurationLocation(card.id)" class="el-button"
              :aria-label="`配置：${card.name}`">
              <el-icon aria-hidden="true"><Setting /></el-icon><span>配置</span>
            </RouterLink>
            <RouterLink v-else-if="card.canInspect" :to="configurationLocation(card.id)" class="el-button"
              :aria-label="`查看配置：${card.name}`">查看配置</RouterLink>
          </div>
        </div>
      </article>
    </div>
    <p v-else class="empty">{{ keyword ? '没有符合搜索条件的助理' : '暂无共享给你的助理。' }}</p>

    <el-dialog v-model="creating" title="新建助理" width="min(560px, calc(100vw - 30px))" top="7vh">
      <el-form id="new-assistant-form" label-position="top" @submit.prevent="createAssistant">
        <el-form-item label="名称" required><el-input v-model="name" maxlength="36" placeholder="例如：项目周报助理" /></el-form-item>
        <el-form-item label="用途简介">
          <el-input v-model="description" maxlength="120" type="textarea" :rows="3" placeholder="例如：整理项目进展，生成每周汇报初稿" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="creating = false">取消</el-button>
        <el-button type="primary" native-type="submit" form="new-assistant-form" :disabled="!name.trim()">创建并配置</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.assistants-page { container-type: inline-size; }
.assistant-filters { flex: 0 1 330px; flex-wrap: nowrap; }
.assistant-search { flex: 0 1 188px; min-width: 0; }
.assistant-count { flex: none; align-self: center; margin-inline-start: auto; color: var(--muted); font-size: 13px; white-space: nowrap; }
.assistant-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 14px; }
.assistant-card { display: flex; flex-direction: column; min-width: 0; border-radius: 10px; }
.assistant-card-body { display: flex; flex: 1; align-items: flex-start; gap: 12px; min-height: 96px; padding: 13px 14px; }
.assistant-icon { display: grid; place-items: center; flex: 0 0 48px; height: 48px; border-radius: 10px; color: var(--accent); background: var(--soft); font-size: 23px; }
.assistant-card-details { display: grid; gap: 4px; min-width: 0; }
.assistant-card h2 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 650; }
.description { display: -webkit-box; margin: 0; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.assistant-source { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.assistant-card-footer { display: grid; align-items: center; gap: 7px; padding: 7px 14px; border-top: 1px solid var(--line); border-radius: 0 0 9px 9px; background: var(--surface-muted); }
.assistant-resource-summary { display: -webkit-box; min-width: 0; margin: 0; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--muted); font-size: 12px; line-height: 16px; }
.card-actions { display: flex; gap: 8px; min-width: 0; }
.card-actions > .el-button { margin: 0; }
.card-actions > .el-button--primary { flex: 1; }
.assistant-card:focus-within { border-color: var(--line-strong); }
@media (hover: hover) and (pointer: fine) {
  .assistant-resource-summary, .card-actions { grid-area: 1 / 1; }
  .card-actions { opacity: 0; pointer-events: none; }
  .assistant-card:hover { border-color: var(--line-strong); }
  .assistant-card:is(:hover, :focus-within) .assistant-resource-summary { opacity: 0; pointer-events: none; }
  .assistant-card:is(:hover, :focus-within) .card-actions { opacity: 1; pointer-events: auto; }
}
.empty { margin: 0; text-align: center; padding: 25px 18px; color: var(--muted); }
@container (max-width: 1000px) {
  .assistant-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 640px) {
  .assistant-grid { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; gap: 10px; }
}
@container (max-width: 420px) {
  .assistant-filters { flex: 1 1 210px; }
}
</style>
