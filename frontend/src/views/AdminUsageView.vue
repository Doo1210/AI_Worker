<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminRuntimeStore } from '@/stores/adminRuntime'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usageCost, usagePeriods } from '@/stores/adminUsage'

const route = useRoute()
const router = useRouter()
const runtime = useAdminRuntimeStore()
const admin = useOrganizationAdminStore()
const value = (key: string) => typeof route.query[key] === 'string' ? String(route.query[key]) : ''
const rows = computed(() => runtime.inScope({ period: value('period') || '7d', department: value('department'), target: value('target'), model: value('model') }))
const totals = computed(() => runtime.totals(rows.value))
const group = computed(() => value('group') === 'model' ? 'model' : 'capability')
const groups = computed(() => [...new Set(rows.value.map(item => group.value === 'model' ? item.modelId ?? 'none' : item.targetId))].map(id => {
  const matching = rows.value.filter(item => (group.value === 'model' ? item.modelId ?? 'none' : item.targetId) === id)
  return { id, name: id === 'none' ? '未使用模型' : runtime.capabilityName(id), ...runtime.totals(matching),
    input: matching.reduce((sum, item) => sum + item.inputTokens, 0), output: matching.reduce((sum, item) => sum + item.outputTokens, 0),
    cost: matching.reduce((sum, item) => sum + usageCost(item), 0) }
}))
function update(key: string, val: string) { void router.replace({ query: { ...route.query, [key]: val || undefined } }) }
const amount = (value: number) => '¥' + value.toFixed(4)
</script>

<template>
  <section class="page page-surface page-with-control-inset" aria-label="用量与费用">
    <PageHeader title="用量与费用">
      <template #actions>
        <RouterLink class="el-button" :to="{ name: 'admin-activity', query: { period: value('period') || '7d', department: value('department') || undefined, target: value('target') || undefined, model: value('model') || undefined } }">查看对应运行记录</RouterLink>
      </template>
      <div class="page-tabs" role="group" aria-label="用量汇总方式"><button class="page-tab" :aria-pressed="group === 'capability'" @click="update('group', 'capability')">按能力</button><button class="page-tab" :aria-pressed="group === 'model'" @click="update('group', 'model')">按模型</button></div>
      <div class="page-tab-toolbar admin-filter-grid"><el-select :model-value="value('period') || '7d'" aria-label="用量时间" @update:model-value="update('period', $event)"><el-option v-for="item in usagePeriods" :key="item.value" :value="item.value" :label="item.label" /></el-select><el-select :model-value="value('department')" aria-label="用量部门" placeholder="全部部门" clearable @update:model-value="update('department', $event ?? '')"><el-option v-for="item in admin.departments" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-select :model-value="value('model')" aria-label="用量模型" placeholder="全部模型" clearable @update:model-value="update('model', $event ?? '')"><el-option v-for="item in admin.capabilities.filter(item => item.type === '模型')" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-select :model-value="value('target')" aria-label="用量能力" placeholder="全部能力" filterable clearable @update:model-value="update('target', $event ?? '')"><el-option v-for="item in admin.capabilities.filter(item => ['工作台', '组织助理'].includes(item.type))" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-button @click="router.replace({ name: 'admin-usage' })">重置筛选</el-button></div>
    </PageHeader>
    <div class="page-body">
      <details class="admin-model-note"><summary>查看估算口径</summary><p>示例单价为输入 ¥2／百万 Token，输出 ¥3／百万 Token。未计价请求单独展示，真实计量待接入。</p></details>
      <dl class="admin-metrics"><div class="panel"><dt>模型请求</dt><dd>{{ rows.filter(item => item.modelId).length }}</dd></div><div class="panel"><dt>Token 用量</dt><dd>{{ totals.tokens.toLocaleString('zh-CN') }}</dd></div><div class="panel"><dt>估算费用</dt><dd>{{ amount(totals.cost) }}</dd></div><div class="panel"><dt>未计价请求</dt><dd>{{ totals.unpriced }}</dd></div></dl>
      <div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>{{ group === 'model' ? '模型' : '能力' }}</th><th>运行记录</th><th>输入 Token</th><th>输出 Token</th><th>估算费用</th><th>未计价请求</th></tr></thead><tbody><tr v-for="item in groups" :key="item.id"><td>{{ item.name }}</td><td>{{ item.count }}</td><td>{{ item.input.toLocaleString('zh-CN') }}</td><td>{{ item.output.toLocaleString('zh-CN') }}</td><td class="admin-number">{{ amount(item.cost) }}</td><td>{{ item.unpriced }}</td></tr></tbody></table></div><el-empty v-if="!groups.length" description="所选范围内暂无用量" />
      <div class="admin-actions"><span class="admin-demo">模拟计量 · 非结算账单</span></div>
    </div>
  </section>
</template>
