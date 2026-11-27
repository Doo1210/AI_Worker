<script setup lang="ts">
import { computed } from 'vue'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
const props = defineProps<{ targetId: string }>()
const organization = useOrganizationAdminStore()
const changes = computed(() => organization.visibleChanges.filter(item => item.targetId === props.targetId || item.relatedIds?.includes(props.targetId)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)))
</script>
<template>
  <div aria-label="对象变更记录"><details v-for="item in changes" :key="item.id" class="object-change"><summary><strong>{{ item.action }}</strong><span>{{ item.actor }} · {{ new Date(item.at).toLocaleString('zh-CN') }}</span></summary><dl class="admin-facts"><div><dt>变更对象</dt><dd>{{ item.target }}</dd></div><div><dt>变更前</dt><dd>{{ item.before || '无' }}</dd></div><div><dt>变更后</dt><dd>{{ item.after || '无' }}</dd></div></dl></details><el-empty v-if="!changes.length" description="暂无相关变更记录" :image-size="60" /></div>
</template>
<style scoped>.object-change { padding: 14px 0; border-bottom: 1px solid var(--line); font-size: 14px; }.object-change summary { cursor: pointer; }.object-change summary span { color: var(--muted); margin-left: 14px; font-size: 13px; }</style>
