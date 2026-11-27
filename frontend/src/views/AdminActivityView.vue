<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDrawer, ElPagination } from 'element-plus'
import { useAdminRuntimeStore } from '@/stores/adminRuntime'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usagePeriods } from '@/stores/adminUsage'
import { adminCapabilityLink } from '@/adminCatalogs'

const route = useRoute()
const router = useRouter()
const runtime = useAdminRuntimeStore()
const admin = useOrganizationAdminStore()
const value = (name: string) => typeof route.query[name] === 'string' ? String(route.query[name]) : ''
const rows = computed(() => runtime.inScope({ period: value('period') || '7d', department: value('department'), target: value('target'), model: value('model'), kind: value('kind'), status: value('status') })
  .filter(item => !value('q') || `${item.id} ${runtime.capabilityName(item.targetId)} ${runtime.memberName(item.userId)} ${item.operation}`.toLowerCase().includes(value('q').toLowerCase())).sort((a, b) => b.at - a.at))
const advancedOpen = ref(['department', 'model', 'kind', 'target'].some(key => !!route.query[key]))
const page = computed(() => Math.min(Math.max(1, Math.trunc(Number(value('page'))) || 1), Math.max(1, Math.ceil(rows.value.length / 20))))
const visibleRows = computed(() => rows.value.slice((page.value - 1) * 20, page.value * 20))
const totals = computed(() => runtime.totals(rows.value))
const selected = computed(() => runtime.records.find(item => item.id === value('record')))
const capability = computed(() => admin.capabilities.find(item => item.id === selected.value?.targetId))
const open = computed({ get: () => !!value('record'), set: visible => { if (!visible) update('record', '') } })
function update(key: string, val: string) { void router.replace({ query: { ...route.query, [key]: val || undefined, ...(key === 'record' ? {} : { record: undefined }), ...(key === 'kind' ? { target: undefined } : {}), ...(key === 'page' || key === 'record' ? {} : { page: undefined }) } }) }
const date = (at: number) => new Date(at).toLocaleString('zh-CN', { hour12: false })
</script>

<template>
  <section class="page page-surface page-with-control-inset" aria-label="助理与工作台运行">
    <PageHeader title="助理与工作台运行">
      <div class="page-tab-toolbar admin-filter-grid">
        <el-input :model-value="value('q')" placeholder="搜索编号、能力、成员或操作" aria-label="搜索运行" clearable @update:model-value="update('q', $event)" />
        <el-select :model-value="value('period') || '7d'" aria-label="运行时间" @update:model-value="update('period', $event)"><el-option v-for="item in usagePeriods" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select :model-value="value('status')" placeholder="全部执行状态" aria-label="执行状态" clearable @update:model-value="update('status', $event ?? '')"><el-option v-for="item in ['成功', '失败', '处理中']" :key="item" :value="item" /></el-select>
        <el-button :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '收起筛选' : '更多筛选' }}</el-button>
        <el-button @click="router.replace({ name: 'admin-activity' })">重置</el-button>
        <div v-show="advancedOpen" class="admin-filter-advanced">
          <el-select :model-value="value('department')" placeholder="全部部门" aria-label="运行部门" clearable @update:model-value="update('department', $event ?? '')"><el-option v-for="item in admin.departments" :key="item.id" :value="item.id" :label="item.name" /></el-select>
          <el-select :model-value="value('kind')" placeholder="全部类型" aria-label="运行类型" clearable @update:model-value="update('kind', $event ?? '')"><el-option label="助理" value="assistant" /><el-option label="工作台" value="workbench" /></el-select>
          <el-select :model-value="value('target')" placeholder="全部能力" filterable aria-label="运行能力" clearable @update:model-value="update('target', $event ?? '')"><el-option v-for="item in admin.capabilities.filter(item => ['组织助理', '工作台'].includes(item.type))" :key="item.id" :label="item.name" :value="item.id" /></el-select>
          <el-select :model-value="value('model')" placeholder="全部模型" aria-label="运行模型" clearable @update:model-value="update('model', $event ?? '')"><el-option v-for="item in admin.capabilities.filter(item => item.type === '模型')" :key="item.id" :value="item.id" :label="item.name" /></el-select>
        </div>
      </div>
    </PageHeader>
    <div class="page-body">
      <div class="admin-result-summary"><span>共 {{ totals.count }} 条运行记录</span><span>{{ totals.members }} 位成员使用</span><span>失败 {{ totals.failed }} 次</span></div>
      <div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>能力与操作</th><th>发起成员</th><th>执行结果</th><th>时间</th><th>记录来源</th></tr></thead><tbody><tr v-for="item in visibleRows" :key="item.id"><td><button type="button" @click="update('record', item.id)">{{ runtime.capabilityName(item.targetId) }}</button><small>{{ item.operation }}</small></td><td>{{ runtime.memberName(item.userId) }}</td><td><el-tag :type="item.status === '失败' ? 'danger' : item.status === '成功' ? 'success' : 'warning'" size="small">{{ item.status }}</el-tag></td><td class="admin-number">{{ date(item.at) }}</td><td>{{ item.source }}</td></tr></tbody></table></div>
      <ElPagination v-if="rows.length > 20" :current-page="page" :page-size="20" :total="rows.length" layout="total, prev, pager, next" class="admin-pagination" @update:current-page="update('page', String($event))" />
      <el-empty v-if="!rows.length" description="所选范围内暂无运行记录"><el-button @click="router.replace({ name: 'admin-activity' })">清除筛选</el-button></el-empty>
    </div>
    <ElDrawer v-model="open" title="运行记录详情" size="min(600px, 100vw)" append-to-body>
      <template v-if="selected"><h2>{{ runtime.capabilityName(selected.targetId) }}</h2><dl class="admin-facts"><div><dt>记录编号</dt><dd>{{ selected.id }}</dd></div><div><dt>执行操作</dt><dd>{{ selected.operation }}</dd></div><div><dt>发起成员</dt><dd>{{ runtime.memberName(selected.userId) }}</dd></div><div><dt>执行时间</dt><dd>{{ date(selected.at) }}</dd></div><div><dt>执行结果</dt><dd>{{ selected.status }}</dd></div><div><dt>结果说明</dt><dd>{{ selected.note || '暂无补充说明' }}</dd></div><div><dt>模型</dt><dd>{{ runtime.capabilityName(selected.modelId) }}</dd></div><div><dt>Token 用量</dt><dd>{{ selected.inputTokens + selected.outputTokens }}{{ selected.source === '原型操作' ? '（真实计量未接入）' : '（演示）' }}</dd></div><div><dt>记录来源</dt><dd>{{ selected.source }}</dd></div></dl>
        <h3>依赖当前状态</h3><el-alert v-if="capability && capability.issues.length" :title="capability.issues.join('；')" type="warning" :closable="false" /><p v-else class="muted">当前依赖就绪，历史执行结果保留。</p><div v-if="capability" class="admin-actions"><RouterLink class="el-button" :to="{ ...adminCapabilityLink(capability), query: { returnTo: route.fullPath } }">查看能力与依赖</RouterLink><RouterLink class="el-button" :to="{ name: 'admin-usage', query: { target: capability.id, period: value('period') || '7d' } }">查看用量</RouterLink></div>
      </template><el-empty v-else description="记录不存在或当前账号无权查看" />
    </ElDrawer>
  </section>
</template>
