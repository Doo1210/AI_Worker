<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElTree } from 'element-plus'
import { Building2, Plus, UsersRound } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { organizationRoleLabels, type OrganizationDepartment } from '@/stores/organizationAdminData'

const organization = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
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
const selected = computed(() => organization.visibleDepartments.find(department => department.id === route.query.department)
  ?? organization.visibleDepartments[0])
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

function membersLink(id: string, memberId = '') {
  return { name: 'admin-members', params: { id: memberId }, query: { department: id } }
}

function selectDepartment(item: OrganizationDepartment) {
  void router.replace({ query: { department: item.id } })
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
</script>

<template>
  <section class="page page-surface departments-page" aria-label="组织架构">
    <header v-if="organization.isAdmin" class="page-controls page-toolbar page-tab-toolbar">
      <div class="page-toolbar-controls">
        <el-button type="primary" :icon="Plus" @click="edit()">新建部门</el-button>
      </div>
    </header>
    <div v-if="selected" class="departments-layout">
      <aside class="department-tree" aria-label="部门列表">
        <el-tree :data="tree" node-key="id" :props="{ label: 'name' }" :current-node-key="selected.id"
          highlight-current default-expand-all :expand-on-click-node="false" @node-click="selectDepartment">
          <template #default="{ data }"><Building2 :size="15" aria-hidden="true" /><span>{{ data.name }}</span></template>
        </el-tree>
      </aside>
      <section class="department-content" :aria-label="selected.name">
        <header class="department-header page-toolbar">
          <div class="department-identity">
            <h2>{{ selected.name }}</h2>
            <p>{{ parent ? `上级部门 · ${parent.name}` : '直属部门' }}<span>负责人 · {{ leader?.name ?? '未指定' }}</span></p>
          </div>
          <div class="page-toolbar-controls">
            <el-button v-if="organization.isAdmin" @click="edit(selected)">编辑部门</el-button>
            <RouterLink class="el-button el-button--primary is-plain" :to="membersLink(selected.id)">管理本部门成员</RouterLink>
          </div>
        </header>
        <ul v-if="members.length" class="department-members" aria-label="本部门成员">
          <li v-for="member in members" :key="member.id">
            <RouterLink :to="membersLink(selected.id, member.id)" :aria-label="`查看${member.name}`">
              <UsersRound :size="17" aria-hidden="true" />
              <span><strong>{{ member.name }}</strong><small>{{ member.title || organizationRoleLabels[member.role] }}</small></span>
              <el-tag v-if="member.status === 'disabled'" size="small" type="info">已停用</el-tag>
            </RouterLink>
          </li>
        </ul>
        <el-empty v-else description="本部门暂无成员" :image-size="68" />
      </section>
    </div>
    <el-empty v-else description="暂无部门" :image-size="68" />

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
  </section>
</template>

<style scoped>
.departments-page { container-type: inline-size; display: flex; flex-direction: column; }
.departments-layout { display: grid; grid-template-columns: minmax(156px, 214px) minmax(0, 1fr); flex: 1; }
.department-tree { padding: 12px 8px; border-inline-end: 1px solid var(--line); min-width: 0; }
.department-tree :deep(.el-tree-node__content) { min-height: 34px; border-radius: 6px; gap: 5px; }
.department-tree :deep(.el-tree-node__content > span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.department-tree :deep(.el-tree-node__content > svg) { flex: none; color: var(--muted); }
.department-content { min-width: 0; }
.department-header { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.department-identity h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.department-identity p { display: flex; flex-wrap: wrap; gap: 4px 13px; margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.department-members { list-style: none; margin: 0; padding: 0; }
.department-members a { display: flex; align-items: center; gap: 9px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.department-members a:hover { background: var(--canvas); color: var(--accent); }
.department-members a > svg { flex: none; color: var(--muted); }
.department-members a > span:not(.el-tag) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.department-members small { display: block; margin-top: 3px; color: var(--muted); }
@container (max-width: 525px) {
  .departments-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
  .department-tree { border-inline-end: 0; border-bottom: 1px solid var(--line); }
}
</style>
