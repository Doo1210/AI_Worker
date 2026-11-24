<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDrawer, ElMessage, ElMessageBox, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn } from 'element-plus'
import { ArrowLeft, Plus, Search, ShieldCheck, UsersRound } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore } from '@/stores/platform'
import type { OrganizationRole } from '@/stores/organizationRoles'
import RoleAssignmentDialog from '@/components/RoleAssignmentDialog.vue'

const organization = useOrganizationAdminStore()
const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
const keyword = ref('')
const kind = ref('all')
const status = ref('')
const selected = computed(() => organization.roles.find(role => role.id === route.params.id))
const detailTab = ref('permissions')
const roles = computed(() => organization.roles.filter(role => (kind.value === 'all' || role.kind === kind.value)
  && (!status.value || String(role.enabled) === status.value)
  && `${role.name} ${role.description}`.toLowerCase().includes(keyword.value.trim().toLowerCase())))
const membersOf = (id: string) => organization.visibleMembers.filter(member => organization.memberRoles(member.id).some(role => role.id === id))
const members = computed(() => selected.value ? membersOf(selected.value.id) : [])
const permissions = computed(() => organization.capabilities.filter(item => selected.value?.capabilityIds.includes(item.id)))
const assignmentOpen = ref(false)
const assignmentRoleId = ref<string>()
const assignmentMemberIds = ref<string[]>()
const editorOpen = ref(false)
const editingId = ref('')
const draft = reactive({ name: '', description: '', kind: 'business' as OrganizationRole['kind'], systemRole: 'department-admin' as 'admin' | 'department-admin', capabilityIds: [] as string[] })
const permissionSearch = ref('')
const groups = computed(() => ['工作台', '组织助理', 'AI 员工', '模型', '技能', 'MCP', '知识', '工具']
  .map(type => ({ type, items: organization.capabilities.filter(item => item.type === type && item.name.includes(permissionSearch.value.trim())) }))
  .filter(group => group.items.length))
const managementActions = computed(() => selected.value?.systemRole === 'admin'
  ? ['维护全组织部门与成员', '创建角色与分配管理权限', '管理组织能力、资源与成员使用授权', '管理系统接入、运行监管及变更记录']
  : selected.value?.systemRole === 'department-admin'
    ? ['维护所指定部门的普通成员', '分配或收回所委派范围内的能力', '查看授权范围内的组织成员信息']
    : ['使用工作门户', '按独立使用授权访问工作台、助理、AI 员工和资源'])

function openEditor(role?: OrganizationRole) {
  editingId.value = role?.id ?? ''
  Object.assign(draft, { name: role?.name ?? '', description: role?.description ?? '', kind: role?.kind ?? 'business',
    systemRole: role?.systemRole ?? 'department-admin', capabilityIds: [...(role?.capabilityIds ?? [])] })
  permissionSearch.value = ''
  editorOpen.value = true
}
function togglePermission(id: string, checked: unknown) {
  const next = new Set(draft.capabilityIds)
  if (checked) {
    next.add(id)
    const pair = organization.capabilities.find(item => item.id === id)?.pairedId
    if (pair) next.add(pair)
  } else next.delete(id)
  draft.capabilityIds = [...next]
}
function saveRole() {
  if (!organization.saveRole(draft, editingId.value || undefined)) {
    ElMessage.warning('请核对角色名称和权限；已分配的管理角色不可更换管理类型')
    return
  }
  editorOpen.value = false
  ElMessage.success(editingId.value ? '角色配置已保存，可分配成员以同步权限' : '角色已创建，可以分配给成员')
}
function assign(roleId?: string, memberId?: string) {
  assignmentRoleId.value = memberId ? undefined : roleId
  assignmentMemberIds.value = memberId ? [memberId] : undefined
  assignmentOpen.value = true
}
async function toggleRole(role: OrganizationRole) {
  try {
    await ElMessageBox.confirm(role.enabled
      ? `停用「${role.name}」后，其业务授权将暂停生效，直接授权和其他角色继续有效。`
      : `启用「${role.name}」后恢复该角色已分配的使用授权。`, role.enabled ? '停用角色' : '启用角色', { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' })
  } catch { return }
  if (!organization.setRoleEnabled(role.id, !role.enabled)) ElMessage.warning('内置角色及已分配成员的管理角色不能停用')
}
async function removeMember(memberId: string) {
  const role = selected.value
  if (!role) return
  try { await ElMessageBox.confirm(`移除「${role.name}」角色，其他授权来源继续有效。`, '移除角色', { confirmButtonText: '确认移除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  const remaining = organization.memberRoles(memberId).filter(item => item.id !== role.id).map(item => item.id)
  const member = platform.users.find(item => item.id === memberId)!
  if (!organization.assignRoles([memberId], remaining, { replace: true, synchronize: false,
    managementDepartmentIds: member.managementDepartmentIds ?? [], assignableCapabilityIds: member.assignableCapabilityIds ?? [] })) {
    ElMessage.warning('无法移除当前角色，请核对成员和管理范围')
  }
}
function viewRole(id: string) {
  detailTab.value = 'permissions'
  void router.push({ name: 'admin-roles', params: { id } })
}
</script>

<template>
  <section class="page page-surface roles-page" aria-label="角色与权限">
    <template v-if="!route.params.id">
      <header class="page-controls">
        <div class="page-tabs" role="group" aria-label="角色类型">
          <button v-for="tab in [{ id: 'all', name: '全部角色' }, { id: 'business', name: '业务角色' }, { id: 'management', name: '管理角色' }]" :key="tab.id" class="page-tab" type="button" :aria-pressed="kind === tab.id" @click="kind = tab.id">{{ tab.name }}</button>
        </div>
        <div class="page-toolbar page-tab-toolbar">
          <span class="muted roles-count">{{ roles.length }} 个角色</span>
          <div class="page-toolbar-controls">
            <el-input v-model="keyword" class="filter-field role-search" :prefix-icon="Search" aria-label="搜索角色" placeholder="搜索角色" clearable />
            <el-select v-model="status" class="filter-field role-status" popper-class="filter-options" aria-label="角色状态" placeholder="全部状态" clearable><el-option label="已启用" value="true" /><el-option label="已停用" value="false" /></el-select>
            <el-button type="primary" :icon="Plus" @click="openEditor()">新建角色</el-button>
          </div>
        </div>
      </header>
      <el-table :data="roles" class="roles-table" aria-label="组织角色列表" @row-click="row => viewRole(row.id)">
        <el-table-column label="角色" min-width="220"><template #default="{ row }"><div class="role-identity"><span class="role-icon"><ShieldCheck :size="18" /></span><div><strong>{{ row.name }} <el-tag v-if="row.builtin" size="small" type="info" effect="plain">内置</el-tag></strong><small>{{ row.description }}</small></div></div></template></el-table-column>
        <el-table-column label="类型" width="100"><template #default="{ row }">{{ row.kind === 'business' ? '业务角色' : '管理角色' }}</template></el-table-column>
        <el-table-column label="权限" width="110"><template #default="{ row }">{{ row.kind === 'business' ? row.capabilityIds.length + ' 项使用权' : row.systemRole === 'admin' ? '全组织管理' : row.systemRole === 'member' ? '工作门户' : '按分配范围' }}</template></el-table-column>
        <el-table-column label="成员" width="75"><template #default="{ row }">{{ membersOf(row.id).length }}</template></el-table-column>
        <el-table-column label="状态" width="85"><template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="170"><template #default="{ row }"><div class="role-row-actions" @click.stop><el-button link type="primary" @click="viewRole(row.id)">查看</el-button><el-button link type="primary" :disabled="!row.enabled" @click="assign(row.id)">分配成员</el-button></div></template></el-table-column>
        <template #empty><el-empty description="没有符合条件的角色" :image-size="60" /></template>
      </el-table>
    </template>
    <template v-else-if="selected">
      <header class="page-controls">
        <div class="page-tabs" role="group" aria-label="角色详情">
          <button class="page-tab" :aria-pressed="detailTab === 'permissions'" @click="detailTab = 'permissions'">权限配置</button>
          <button class="page-tab" :aria-pressed="detailTab === 'members'" @click="detailTab = 'members'">已分配成员 <small>{{ members.length }}</small></button>
        </div>
        <div class="page-toolbar page-tab-toolbar">
          <RouterLink :to="{ name: 'admin-roles' }" class="role-back"><ArrowLeft :size="15" />{{ selected.name }}</RouterLink>
          <div class="page-toolbar-controls">
            <el-button v-if="!selected.builtin" @click="openEditor(selected)">编辑角色</el-button>
            <el-button v-if="!selected.builtin" @click="toggleRole(selected)">{{ selected.enabled ? '停用角色' : '启用角色' }}</el-button>
            <el-button type="primary" :icon="UsersRound" :disabled="!selected.enabled" @click="assign(selected.id)">分配成员</el-button>
          </div>
        </div>
      </header>
      <section v-if="detailTab === 'permissions'" class="page-body role-permissions" aria-label="角色权限">
        <div class="role-description"><span>{{ selected.kind === 'business' ? '业务角色' : '管理角色' }} · v{{ selected.version }}</span><p>{{ selected.description || '暂无描述' }}</p></div>
        <template v-if="selected.kind === 'business'">
          <div v-for="item in permissions" :key="item.id" class="permission-row"><div><strong>{{ item.name }}</strong><small>{{ item.type }}</small></div><el-tag size="small" effect="plain">{{ item.type === 'AI 员工' ? '联系与交办' : '使用' }}</el-tag></div>
          <el-empty v-if="!permissions.length" description="暂未配置使用权限" :image-size="55" />
          <p class="muted role-note">成员通过分配确认获得使用权。修改角色后，在分配成员中确认同步；AI 员工维护与发布职责单独授权。</p>
        </template>
        <template v-else><div v-for="action in managementActions" :key="action" class="permission-row"><span>{{ action }}</span><ShieldCheck :size="16" class="muted" /></div><p v-if="selected.systemRole === 'department-admin'" class="muted role-note">每位成员的可管理部门与可分配能力，在分配此角色时单独指定。</p></template>
      </section>
      <section v-else aria-label="角色成员">
        <div v-for="member in members" :key="member.id" class="role-member-row">
          <RouterLink :to="{ name: 'admin-members', params: { id: member.id } }"><strong>{{ member.name }}</strong><small>{{ member.department }} · {{ member.title }}</small><small v-if="selected.systemRole === 'department-admin'">管理 {{ organization.departments.filter(item => member.managementDepartmentIds?.includes(item.id)).map(item => item.name).join('、') }}</small></RouterLink>
          <el-tag v-if="member.status === 'disabled'" size="small" type="info">账号已停用</el-tag>
          <el-tag v-if="platform.organizationRoleAssignments.some(item => item.memberId === member.id && item.roleId === selected?.id && item.version !== selected?.version)" size="small" type="warning">待同步</el-tag>
          <el-button link type="primary" :disabled="member.status === 'disabled'" @click="assign(undefined, member.id)">调整角色</el-button>
          <el-button v-if="selected.kind === 'business'" link type="danger" @click="removeMember(member.id)">移除角色</el-button>
        </div>
        <el-empty v-if="!members.length" description="暂未分配成员" :image-size="60" />
      </section>
    </template>
    <el-empty v-else description="角色不存在或已不可访问"><RouterLink :to="{ name: 'admin-roles' }">返回角色列表</RouterLink></el-empty>
    <RoleAssignmentDialog v-model="assignmentOpen" :member-ids="assignmentMemberIds" :role-id="assignmentRoleId" />
    <el-drawer v-model="editorOpen" :title="editingId ? '编辑角色' : '新建角色'" size="min(580px, 100vw)" append-to-body>
      <el-form label-position="top" class="role-editor" @submit.prevent="saveRole">
        <el-form-item label="角色名称" required><el-input v-model="draft.name" aria-label="角色名称" placeholder="例如：设计工程师" maxlength="40" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="draft.description" aria-label="角色描述" type="textarea" :rows="2" placeholder="说明角色的职责与适用人员" maxlength="180" /></el-form-item>
        <el-form-item label="角色类型"><el-radio-group v-model="draft.kind" :disabled="!!editingId" aria-label="新角色类型"><el-radio-button value="business">业务角色</el-radio-button><el-radio-button value="management">管理角色</el-radio-button></el-radio-group></el-form-item>
        <template v-if="draft.kind === 'business'">
          <div class="permission-editor-heading"><strong>使用权限 <small>{{ draft.capabilityIds.length }} 项</small></strong><el-input v-model="permissionSearch" class="filter-field" aria-label="搜索角色权限" placeholder="搜索能力" :prefix-icon="Search" clearable /></div>
          <p class="muted role-note">选择工作台或组织助理时默认勾选配套项，可以取消。</p>
          <section v-for="group in groups" :key="group.type" class="permission-group"><h3>{{ group.type }}</h3><el-checkbox v-for="item in group.items" :key="item.id" :model-value="draft.capabilityIds.includes(item.id)" @change="togglePermission(item.id, $event)">{{ item.name }}<small v-if="!item.enabled"> · 未启用</small></el-checkbox></section>
        </template>
        <el-form-item v-else label="管理能力预设"><el-select v-model="draft.systemRole" aria-label="管理能力预设"><el-option label="部门成员与能力分配管理" value="department-admin" /><el-option label="全组织管理" value="admin" /></el-select><p class="muted role-note">部门管理范围和可分配能力在授予成员时指定。管理操作沿用对应内置角色规则。</p></el-form-item>
        <div class="page-toolbar-controls"><el-button @click="editorOpen = false">取消</el-button><el-button type="primary" native-type="submit" :disabled="!draft.name.trim()">保存角色</el-button></div>
      </el-form>
    </el-drawer>
  </section>
</template>

<style scoped>
.role-search { width: 200px; }.role-status { width: 112px; }.roles-count { font-size: 12px; }
.roles-table :deep(.el-table__row) { cursor: pointer; }.roles-table :deep(.el-table__cell) { padding-block: 14px; }
.roles-table :deep(th.el-table__cell) { background: var(--canvas); color: var(--muted); font-size: 12px; }
.role-identity { display: flex; gap: 10px; align-items: center; }.role-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--soft); color: var(--accent); flex: none; }
.role-identity small, .permission-row small, .role-member-row small { display: block; color: var(--muted); margin-top: 4px; font-size: 12px; line-height: 1.5; }
.role-identity strong { display: flex; align-items: center; gap: 7px; }.role-row-actions { display: flex; gap: 12px; }.role-row-actions .el-button { margin: 0; }
.role-back { display: inline-flex; gap: 6px; align-items: center; color: var(--accent); font-size: 13px; }
.role-description { margin-bottom: 8px; }.role-description > span { color: var(--muted); font-size: 12px; }.role-description p { margin: 7px 0 14px; font-size: 13px; }
.permission-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 2px; border-top: 1px solid var(--line); font-size: 13px; }
.role-note { font-size: 12px; line-height: 1.7; margin: 8px 0 0; }
.role-member-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line); }.role-member-row > a { flex: 1; min-width: 140px; }
.role-editor { display: grid; gap: 15px; }.role-editor .el-form-item { margin: 0; }.permission-editor-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }.permission-editor-heading small { color: var(--muted); margin-left: 4px; }.permission-editor-heading .el-input { width: 180px; margin-left: auto; }
.permission-group { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; }.permission-group h3 { font-size: 12px; color: var(--muted); margin: 0 0 5px; }.permission-group .el-checkbox { white-space: normal; height: auto; min-height: 30px; margin: 0; }.permission-group small { color: var(--muted); }
</style>
