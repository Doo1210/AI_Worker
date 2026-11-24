<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElTree } from 'element-plus'
import { Building2, Plus, Search, Settings2 } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { type OrganizationDepartment } from '@/stores/organizationAdminData'

const props = defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const keyword = ref('')
const organization = useOrganizationAdminStore()
type DepartmentNode = OrganizationDepartment & { children: DepartmentNode[] }
const tree = computed(() => {
  const nodes = new Map<string, DepartmentNode>(organization.visibleDepartments.map(department => [department.id, { ...department, children: [] }]))
  const roots: DepartmentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId && nodes.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
})
const selected = computed(() => organization.visibleDepartments.find(department => department.id === props.selectedId))
const members = computed(() => selected.value ? organization.visibleMembers.filter(member => member.departmentId === selected.value?.id) : [])
const leader = computed(() => members.value.find(member => member.id === selected.value?.leaderId))
const parent = computed(() => organization.visibleDepartments.find(department => department.id === selected.value?.parentId))
const editing = ref(false)
const editingId = ref('')
const draft = reactive({ name: '', parentId: '', leaderId: '' })
const parentOptions = computed(() => organization.departments.filter(department => {
  for (let candidate: OrganizationDepartment | undefined = department; candidate; ) {
    if (candidate.id === editingId.value) return false
    const parentId: string | undefined = candidate.parentId
    candidate = organization.departments.find(item => item.id === parentId)
  }
  return true
}))
const leaderOptions = computed(() => organization.visibleMembers.filter(member =>
  member.departmentId === editingId.value && member.status !== 'disabled'))

function selectDepartment(item: OrganizationDepartment) {
  emit('select', item.id)
}

function edit(department?: OrganizationDepartment) {
  editingId.value = department?.id ?? ''
  Object.assign(draft, { name: department?.name ?? '', parentId: department?.parentId ?? '', leaderId: department?.leaderId ?? '' })
  editing.value = true
}

function save() {
  if (!organization.saveDepartment(draft, editingId.value || undefined)) {
    ElMessage.warning('请检查部门名称、上级部门及负责人')
    return
  }
  if (!editingId.value) {
    const added = organization.departments.find(department => department.name === draft.name.trim())
    if (added) selectDepartment(added)
  }
  editing.value = false
  ElMessage.success(editingId.value ? '部门信息已更新' : '已新建部门')
}

const treeRef = ref<InstanceType<typeof ElTree>>()
watch(keyword, value => treeRef.value?.filter(value))
</script>
<template>
  <aside class="organization-tree-panel" aria-label="部门目录">
    <header class="tree-heading"><strong>组织架构</strong><div v-if="organization.isAdmin"><el-button text :icon="Plus" aria-label="新建部门" @click="edit()" /><el-button text :icon="Settings2" aria-label="编辑当前部门" :disabled="!selected" @click="edit(selected)" /></div></header>
    <el-input v-model="keyword" class="filter-field" :prefix-icon="Search" aria-label="搜索部门" placeholder="搜索部门" clearable />
    <button class="all-members" :class="{ selected: !selectedId }" :aria-pressed="!selectedId" @click="emit('select', '')"><Building2 :size="16" /><span>全部成员</span><small>{{ organization.visibleMembers.length }}</small></button>
    <el-tree :data="tree" node-key="id" :props="{ label: 'name' }" :current-node-key="selectedId"
      :filter-node-method="(value, data) => String(data.name).includes(value)" :default-expand-all="true" highlight-current :expand-on-click-node="false" @node-click="selectDepartment" ref="treeRef">
      <template #default="{ data }"><span class="department-node"><Building2 :size="14" /><span>{{ data.name }}</span><small>{{ organization.visibleMembers.filter(member => member.departmentId === data.id).length }}</small></span></template>
    </el-tree>
    <p v-if="selected" class="tree-footnote">{{ parent ? '上级 · ' + parent.name : '直属部门' }}<br />负责人 · {{ leader?.name ?? '未指定' }}</p>
    <el-dialog v-model="editing" :title="editingId ? '编辑部门' : '新建部门'" width="min(440px, calc(100vw - 32px))" append-to-body>
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="部门名称" required><el-input v-model="draft.name" aria-label="部门名称" maxlength="50" /></el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="draft.parentId" aria-label="上级部门" placeholder="直属部门" clearable>
            <el-option v-for="item in parentOptions" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingId" label="部门负责人">
          <el-select v-model="draft.leaderId" aria-label="部门负责人" placeholder="未指定" clearable>
            <el-option v-for="item in leaderOptions" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </el-form-item>
        <div class="page-toolbar-controls">
          <el-button @click="editing = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!draft.name.trim()">保存部门</el-button>
        </div>
      </el-form>
    </el-dialog>
  </aside>
</template>

<style scoped>
.organization-tree-panel { min-width: 0; padding: 12px 10px; border-inline-end: 1px solid var(--line); background: #fcfdff; }
.tree-heading { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 12px; font-size: 13px; }.tree-heading > div { display: flex; }.tree-heading .el-button { padding: 5px; margin: 0; height: 26px; }
.all-members { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 34px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; font-size: 13px; color: var(--muted); margin: 10px 0 3px; text-align: left; }.all-members.selected { background: var(--soft); color: var(--accent); }.all-members span { flex: 1; }.all-members small { font-size: 11px; }
.organization-tree-panel :deep(.el-tree) { background: transparent; }.organization-tree-panel :deep(.el-tree-node__content) { min-height: 34px; border-radius: 6px; font-size: 13px; }.department-node { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; padding-right: 8px; }.department-node > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.department-node svg { flex: none; color: var(--muted); }.department-node small { margin-left: auto; color: var(--muted); }
.tree-footnote { font-size: 11px; line-height: 1.8; color: var(--muted); padding: 10px 8px 0; border-top: 1px solid var(--line); margin-top: 18px; }
</style>
