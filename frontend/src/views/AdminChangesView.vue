<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElPagination } from 'element-plus'
import { useAdminListQuery } from '@/adminListQuery'
import { usagePeriods } from '@/stores/adminUsage'
import { ChevronDown, Search } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const admin = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const { field } = useAdminListQuery()
const query = field('q')
const actionFilter = field('action')
const actor = field('actor')
const period = field('period')
const objectType = field('objectType')
const actors = computed(() => [...new Set(admin.visibleChanges.map(item => item.actor))])
const objectTypes = { member: '成员', role: '角色', capability: '能力与资源', connection: '系统连接', plugin: '插件', department: '部门' }
const targetFilter = computed(() => typeof route.query.target === 'string' ? route.query.target.trim() : '')
const actions = computed(() => [...new Set(admin.visibleChanges.map(change => change.action))])
const visibleChanges = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const target = targetFilter.value.toLocaleLowerCase()
  const targetId = typeof route.query.targetId === 'string' ? route.query.targetId : ''
  return admin.visibleChanges
    .filter(change =>
      (!actionFilter.value || actionFilter.value === change.action)
      && (!actor.value || change.actor === actor.value)
      && (!objectType.value || change.targetType === objectType.value)
      && (!period.value || Date.parse(change.at) >= Date.now() - ({ '24h': 1, '7d': 7, '30d': 30 }[period.value] ?? 30) * 86_400_000)
      && (targetId ? change.targetId === targetId || !!change.relatedIds?.includes(targetId) : !target || [change.target, change.before, change.after].some(value => value.toLocaleLowerCase().includes(target)))
      && [change.target, change.actor, change.action, change.before, change.after]
        .some(value => value.toLocaleLowerCase().includes(keyword)),
    )
    .sort((first, second) => Date.parse(second.at) - Date.parse(first.at))
})

const page = computed(() => Math.min(Math.max(1, Math.trunc(Number(route.query.page)) || 1), Math.max(1, Math.ceil(visibleChanges.value.length / 20))))
const rows = computed(() => visibleChanges.value.slice((page.value - 1) * 20, page.value * 20))
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date)
}

function clearTarget() {
  const { target: _target, targetId: _id, ...query } = route.query
  void router.replace({ path: route.path, query })
}
</script>

<template>
  <div class="page page-surface page-with-control-inset">
    <PageHeader title="变更记录">
      <div class="page-toolbar page-tab-toolbar audit-filters">
        <div class="admin-filter-grid">
          <el-input v-model="query" :prefix-icon="Search" aria-label="搜索变更记录" placeholder="搜索对象、操作人或变更内容" clearable />
          <el-select v-model="actionFilter" popper-class="filter-options" aria-label="操作类型" placeholder="全部操作" clearable>
            <el-option v-for="action in actions" :key="action" :value="action" :label="action" />
          </el-select>
          <el-select v-model="period" placeholder="全部时间" aria-label="变更时间" clearable><el-option v-for="item in usagePeriods" :key="item.value" :label="item.label" :value="item.value" /></el-select>
          <el-select v-model="objectType" placeholder="全部对象类型" aria-label="变更对象类型" clearable><el-option v-for="(label, value) in objectTypes" :key="value" :label="label" :value="value" /></el-select>
          <el-select v-model="actor" placeholder="全部操作人" aria-label="变更操作人" clearable><el-option v-for="item in actors" :key="item" :value="item" /></el-select>
          <el-button @click="router.replace({ name: 'admin-changes' })">重置</el-button>
          <el-tag v-if="targetFilter" class="audit-target-filter" effect="plain" closable @close="clearTarget">对象 {{ targetFilter }}</el-tag>
        </div>
        <div class="page-toolbar-controls">
          <span class="results muted">{{ visibleChanges.length }} 条记录</span>
        </div>
      </div>
    </PageHeader>
    <section class="page-body" aria-label="变更记录列表">
      <template v-if="visibleChanges.length">
        <div class="audit-columns audit-labels" aria-hidden="true">
          <span>变更对象</span><span>操作</span><span>操作人</span><span>时间</span><span></span>
        </div>
        <details v-for="change in rows" :key="change.id" class="audit-entry">
          <summary class="audit-columns audit-summary">
            <strong class="audit-object">{{ change.target }}</strong>
            <span class="audit-action">{{ change.action }}</span>
            <span class="audit-actor">{{ change.actor }}</span>
            <time class="audit-time muted" :datetime="change.at">{{ formatDate(change.at) }}</time>
            <ChevronDown class="audit-chevron" :size="16" aria-hidden="true" />
          </summary>
          <div class="audit-diff">
            <div><h2>变更前</h2><p>{{ change.before || '无' }}</p></div>
            <div><h2>变更后</h2><p>{{ change.after || '无' }}</p></div>
          </div>
        </details>
        <ElPagination v-if="visibleChanges.length > 20" :total="visibleChanges.length" :page-size="20" :current-page="page" layout="total, prev, pager, next" class="admin-pagination" @update:current-page="router.replace({ query: { ...route.query, page: $event } })" />
      </template>
      <el-empty v-else :image-size="84" :description="admin.visibleChanges.length ? '没有符合条件的记录' : '还没有变更记录'" />
    </section>
  </div>
</template>

<style scoped>
.audit-filters .el-input { width: min(100%, 210px); }
.audit-filters .el-select { width: 112px; }
.audit-target-filter { max-width: 100%; height: auto; min-height: 24px; white-space: normal; overflow-wrap: anywhere; }
.results { white-space: nowrap; font-size: 12px; }
.audit-columns {
  display: grid; grid-template-columns: minmax(150px, 1fr) minmax(82px, .65fr) minmax(68px, .48fr) minmax(125px, .62fr) 16px;
  gap: 16px; align-items: center; padding: 12px 16px;
}
.audit-labels { border-top: 1px solid var(--line); background: var(--canvas); color: var(--muted); font-size: 12px; font-weight: 600; }
.audit-entry { border-top: 1px solid var(--line); }
.audit-summary { min-height: 54px; cursor: pointer; list-style: none; }
.audit-summary::-webkit-details-marker { display: none; }
.audit-summary:hover { background: var(--soft); }
.audit-summary:focus-visible { outline-offset: -3px; }
.audit-object, .audit-action, .audit-actor { min-width: 0; overflow-wrap: anywhere; }
.audit-object { font-weight: 620; }
.audit-action { color: #3553a3; }
.audit-time { font-size: 13px; }
.audit-chevron { color: var(--muted); transition: transform .15s ease; }
.audit-entry[open] .audit-chevron { transform: rotate(180deg); }
.audit-diff { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0 16px 14px; }
.audit-diff > div { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--canvas); }
.audit-diff > div + div { background: var(--soft); }
.audit-diff h2 { margin: 0 0 5px; color: var(--muted); font-size: 12px; font-weight: 650; }
.audit-diff p { margin: 0; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }

@media (max-width: 920px) {
  .audit-columns { grid-template-columns: minmax(120px, 1fr) minmax(72px, .65fr) 64px 120px 16px; gap: 8px; }
}
@media (max-width: 700px) {
  .audit-labels { display: none; }
  .audit-summary {
    grid-template-columns: minmax(0, 1fr) auto 16px;
    grid-template-areas: "object action arrow" "actor time time";
    gap: 5px 8px; padding: 11px 12px;
  }
  .audit-object { grid-area: object; }
  .audit-action { grid-area: action; font-size: 12px; }
  .audit-actor { grid-area: actor; color: var(--muted); font-size: 12px; }
  .audit-time { grid-area: time; text-align: right; font-size: 12px; }
  .audit-chevron { grid-area: arrow; }
  .audit-diff { grid-template-columns: 1fr; gap: 6px; padding: 0 12px 11px; }
}
</style>
