<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { useAdminListQuery } from '@/adminListQuery'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDrawer, ElPagination, ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
import { adminCapabilityLink } from '@/adminCatalogs'
import { usePlatformStore, type User } from '@/stores/platform'
import { capabilityResponsibilities, useOrganizationAdminStore, type AdminCapability } from '@/stores/organizationAdmin'
import { organizationRoleLabels } from '@/stores/organizationAdminData'
import { useUnsavedChanges } from '@/useUnsavedChanges'
import AdminMemberTransferDialog from '@/components/AdminMemberTransferDialog.vue'
import OrganizationDepartmentTree from '@/components/OrganizationDepartmentTree.vue'
import AdminObjectChanges from '@/components/AdminObjectChanges.vue'
import RoleAssignmentDialog from '@/components/RoleAssignmentDialog.vue'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const { field } = useAdminListQuery()
const router = useRouter()
const query = field('q', '')
const department = ref('')
const roleFilter = field('role', '')
const statusFilter = field('status', '')
const selectedIds = ref<string[]>([])
const includeChildren = ref(false)
const assignmentOpen = ref(false)
const assignmentMemberIds = ref<string[]>([])
const departmentScope = computed(() => {
  const ids = new Set(department.value ? [department.value] : [])
  if (includeChildren.value) for (const id of ids) {
    organization.visibleDepartments.filter(item => item.parentId === id).forEach(item => ids.add(item.id))
  }
  return ids
})
const detailMember = computed(() => organization.visibleMembers.find(member => member.id === route.params.id))
const detailTab = ref('profile')
const transferOpen = ref(false)
const canEditMember = computed(() => !!detailMember.value && organization.canManageMember(detailMember.value))
const detailGrants = computed(() => organization.capabilities.filter(capability => capability.memberIds.includes(detailMember.value?.id ?? '')))
const responsibilities = computed(() => {
  const memberId = detailMember.value?.id
  return memberId ? organization.capabilities.filter(capability => capabilityResponsibilities(capability, memberId)) : []
})
const departments = computed(() => organization.visibleDepartments)
const departmentMemberIds = computed(() => department.value ? organization.visibleMembers
  .filter(member => departmentScope.value.has(member.departmentId ?? '') && member.status !== 'disabled' && organization.canManageMember(member))
  .map(member => member.id) : [])
const members = computed(() => {
  const search = query.value.trim().toLowerCase()
  return organization.visibleMembers.filter(member => (!department.value || departmentScope.value.has(member.departmentId ?? ''))
    && (!roleFilter.value || organization.memberRoles(member.id).some(role => role.id === roleFilter.value))
    && (!statusFilter.value || (member.status ?? 'active') === statusFilter.value)
    && [member.name, member.department, member.title].some(value => value.toLowerCase().includes(search)))
})
const page = computed(() => Math.min(Math.max(1, Math.trunc(Number(route.query.page)) || 1), Math.max(1, Math.ceil(members.value.length / 20))))
const pageMembers = computed(() => members.value.slice((page.value - 1) * 20, page.value * 20))
const visibleIds = computed(() => pageMembers.value.filter(member => organization.canManageMember(member)).map(member => member.id))
const allSelected = computed(() => visibleIds.value.length > 0 && visibleIds.value.every(id => selectedIds.value.includes(id)))

const grantOpen = ref(false)
const isBatch = ref(false)
const grantMemberIds = ref<string[]>([])
const grantIds = ref<string[]>([])
const grantMode = ref<'分配' | '收回'>('分配')
const capabilitiesById = computed(() => new Map(organization.capabilities.map(item => [item.id, item])))
const assignable = computed(() => organization.capabilities.filter(item => organization.canAssignCapability(item.id)))
const hasPairedCapabilities = computed(() => assignable.value.some(item => item.pairedId && organization.canAssignCapability(item.pairedId)))
const automaticPairs = reactive(new Map<string, string>())
const explicitlyDeselected = new Set<string>()
const automaticGrants = computed(() => organization.capabilities.filter(item => automaticPairs.has(item.id)))
const affected = computed(() => {
  const selected = new Set(grantIds.value)
  return grantMemberIds.value.reduce((total, memberId) => total + assignable.value.filter(item => {
    const hasAccess = organization.directCapabilityIds(memberId).includes(item.id)
    if (!isBatch.value) return hasAccess !== selected.has(item.id)
    return selected.has(item.id) && (grantMode.value === '分配' ? !hasAccess : hasAccess)
  }).length, 0)
})
const profileOpen = ref(false)
const creatingMember = ref(false)
const profile = reactive({ name: '', departmentId: '', title: '', status: 'active' as NonNullable<User['status']> })

const profileSnapshot = ref('')
const profileDirty = computed(() => profileOpen.value && JSON.stringify(profile) !== profileSnapshot.value)
const { beforeClose: beforeProfileClose, confirmDiscard: discardProfile } = useUnsavedChanges(profileDirty)
async function cancelProfile() { if (await discardProfile()) profileOpen.value = false }

watch([query, department, roleFilter, statusFilter, includeChildren], () => { selectedIds.value = [] })
watch(() => route.query.department, id => {
  if (route.name === 'admin-members') department.value = typeof id === 'string' && departments.value.some(item => item.id === id) ? id : ''
}, { immediate: true })
watch(detailMember, () => {
  detailTab.value = 'profile'
  profileOpen.value = false
  grantOpen.value = false
  transferOpen.value = false
})
watch(grantMode, () => {
  grantIds.value = grantIds.value.filter(id => !automaticPairs.has(id))
  automaticPairs.clear()
  explicitlyDeselected.clear()
})

function selectAll(checked: unknown) {
  selectedIds.value = checked ? [...new Set([...selectedIds.value, ...visibleIds.value])]
    : selectedIds.value.filter(id => !visibleIds.value.includes(id))
}

function selectMember(id: string, checked: unknown) {
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(value => value !== id)
}

function openGrants(ids: string[], batch = false) {
  grantMemberIds.value = [...ids]
  isBatch.value = batch
  automaticPairs.clear()
  explicitlyDeselected.clear()
  grantIds.value = !batch
    ? assignable.value.filter(item => organization.directCapabilityIds(ids[0] ?? '').includes(item.id)).map(item => item.id)
    : []
  grantMode.value = '分配'
  grantOpen.value = true
}

function updateGrantIds(ids: string[]) {
  if (grantMode.value === '收回') {
    grantIds.value = ids
    return
  }

  const current = new Set(grantIds.value)
  const next = new Set(ids)
  const removed = grantIds.value.filter(id => !next.has(id))
  for (const id of removed) {
    explicitlyDeselected.add(id)
    automaticPairs.delete(id)
    const pairedId = capabilitiesById.value.get(id)?.pairedId
    if (pairedId && automaticPairs.get(pairedId) === id) {
      automaticPairs.delete(pairedId)
      next.delete(pairedId)
    }
  }

  for (const id of ids) {
    if (current.has(id)) continue
    explicitlyDeselected.delete(id)
    const pairedId = capabilitiesById.value.get(id)?.pairedId
    if (!pairedId || next.has(pairedId) || explicitlyDeselected.has(pairedId) || !organization.canAssignCapability(pairedId)) continue
    next.add(pairedId)
    automaticPairs.set(pairedId, id)
  }
  grantIds.value = [...next]
}

function saveGrants() {
  const selected = new Set(grantIds.value)
  const updates = grantMemberIds.value.map(memberId => {
    const current = organization.directCapabilityIds(memberId)
    const capabilityIds = !isBatch.value ? [...current.filter(id => !organization.canAssignCapability(id)), ...grantIds.value] : grantMode.value === '分配'
      ? [...new Set([...current, ...grantIds.value])]
      : current.filter(id => !selected.has(id))
    return { memberId, capabilityIds }
  })
  if (!organization.setMembersCapabilities(updates)) {
    ElMessage.warning('无法保存授权，请核对成员和可分配范围')
    return
  }
  ElMessage.success('使用授权已更新')
  grantOpen.value = false
  if (detailMember.value) detailTab.value = 'grants'
}

function editProfile() {
  const member = detailMember.value
  if (!member) return
  creatingMember.value = false
  Object.assign(profile, { name: member.name, departmentId: member.departmentId ?? '', title: member.title, status: member.status ?? 'active' })
  profileSnapshot.value = JSON.stringify(profile)
  profileOpen.value = true
}

function addMember() {
  creatingMember.value = true
  Object.assign(profile, { name: '', departmentId: department.value || departments.value[0]?.id || '', title: '', status: 'active' })
  profileSnapshot.value = JSON.stringify(profile)
  profileOpen.value = true
}

async function saveProfile() {
  const member = detailMember.value
  if (!creatingMember.value && member && member.status !== 'disabled' && profile.status === 'disabled') {
    const duties = organization.capabilities.filter(item => capabilityResponsibilities(item, member.id)).map(item => item.name)
    try {
      await ElMessageBox.confirm(`停用「${member.name}」后将停止账号访问。${duties.length ? '该成员还负责 ' + duties.join('、') + '，请核对职责交接。' : ''}`, '停用成员账号', { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '返回检查' })
    } catch { return }
  }
  const saved = creatingMember.value ? organization.createMember(profile) : member && organization.updateMember(member.id, profile)
  if (!saved) {
    ElMessage.warning('请确认成员信息与部门归属')
    return
  }
  profileOpen.value = false
  if (creatingMember.value) {
    const created = platform.users.at(-1)
    if (created) showMember(created.id)
  }
  ElMessage.success(creatingMember.value ? '已添加成员' : '成员信息已保存')
}

function memberReady(item: AdminCapability) { return item.ready && !!detailMember.value && !organization.capabilityIssues(item.id, detailMember.value.id).length }

function accessCount(id: string) {
  return organization.capabilities.filter(item => item.memberIds.includes(id)).length
}

function showMember(id: string) {
  void router.push({ name: 'admin-members', params: { id }, query: route.query })
}

function setDepartment(id: string) {
  department.value = id
  void router.replace({ query: { ...route.query, department: id || undefined } })
}

function assignRoles(ids: string[]) {
  assignmentMemberIds.value = [...ids]
  assignmentOpen.value = true
}
</script>

<template>
  <div class="page page-surface page-with-control-inset members-page" aria-label="组织与成员">
    <template v-if="detailMember">
      <PageHeader :title="detailMember.name">
        <template #back>
          <RouterLink class="member-back" :to="{ name: 'admin-members', params: { id: '' }, query: route.query }"><el-icon><ArrowLeft /></el-icon>返回组织与成员</RouterLink>
        </template>
        <template v-if="canEditMember" #actions>
          <el-button v-if="detailTab === 'profile'" @click="editProfile">编辑成员</el-button>
          <el-button v-if="organization.isAdmin && ['profile', 'duties'].includes(detailTab) && detailMember.status !== 'disabled'" @click="transferOpen = true">调岗交接</el-button>
          <el-button v-if="detailTab === 'roles' && detailMember.status !== 'disabled'" @click="assignRoles([detailMember.id])">分配角色</el-button>
          <el-button v-if="detailTab === 'grants' && assignable.length" type="primary" @click="openGrants([detailMember.id])">编辑使用授权</el-button>
        </template>
        <div class="page-tabs" role="group" aria-label="成员详情">
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'profile'" @click="detailTab = 'profile'">基本信息</button>
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'roles'" @click="detailTab = 'roles'">角色分配 <small>{{ organization.memberRoles(detailMember.id).length }}</small></button>
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'grants'" @click="detailTab = 'grants'">使用授权 <small>{{ detailGrants.length }}</small></button>
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'changes'" @click="detailTab = 'changes'">授权与成员变更</button>
          <button class="page-tab" type="button" :aria-pressed="detailTab === 'duties'" @click="detailTab = 'duties'">负责维护 <small>{{ responsibilities.length }}</small></button>
        </div>
      </PageHeader>
      <section v-if="detailTab === 'profile'" class="page-body" aria-label="基本信息">
        <dl class="member-profile">
          <div><dt>姓名</dt><dd>{{ detailMember.name }}</dd></div>
          <div><dt>部门</dt><dd>{{ detailMember.department || '未分配' }}</dd></div>
          <div><dt>岗位</dt><dd>{{ detailMember.title || '—' }}</dd></div>
          <div><dt>组织角色</dt><dd>{{ organizationRoleLabels[detailMember.role] }}</dd></div>
          <div><dt>账号标识</dt><dd>{{ detailMember.id }}</dd></div><div><dt>登录方式</dt><dd>演示账号切换（企业登录待接入）</dd></div><div><dt>账号状态</dt><dd>{{ detailMember.status === 'disabled' ? '已停用' : '已启用' }}</dd></div>
          <div v-if="detailMember.role === 'department-admin'">
            <dt>管理范围</dt><dd>{{ departments.filter(item => detailMember?.managementDepartmentIds?.includes(item.id)).map(item => item.name).join('、') || '—' }}</dd>
          </div>
        </dl>
      </section>
      <section v-else-if="detailTab === 'roles'" class="page-body" aria-label="成员角色">
        <div v-for="item in organization.memberRoles(detailMember.id)" :key="item.id" class="member-detail-row">
          <div><RouterLink v-if="organization.isAdmin" :to="{ name: 'admin-roles', params: { id: item.id } }"><strong>{{ item.name }}</strong></RouterLink><strong v-else>{{ item.name }}</strong><small>{{ item.kind === 'business' ? '业务角色' : '管理角色' }} · {{ item.description }}</small></div>
          <el-tag size="small" :type="item.enabled ? 'success' : 'info'" effect="plain">{{ item.enabled ? '已分配' : '角色已停用' }}</el-tag>
        </div>
      </section>
      <section v-else-if="detailTab === 'grants'" class="page-body" aria-label="使用授权">
        <div v-for="item in detailGrants" :key="item.id" class="member-detail-row">
          <div>
            <RouterLink v-if="organization.isAdmin" :to="adminCapabilityLink(item)"><strong>{{ item.name }}</strong></RouterLink>
            <strong v-else>{{ item.name }}</strong>
            <small>{{ item.type }} · {{ organization.grantSources(detailMember.id, item.id).join('、') }}</small>
          </div>
          <el-tag :type="detailMember.status === 'disabled' || !item.enabled ? 'info' : memberReady(item) ? 'success' : 'warning'" effect="plain">{{ detailMember.status === 'disabled' ? '账号已停用' : item.enabled ? (memberReady(item) ? '可使用' : '待就绪') : '未启用' }}</el-tag>
        </div>
        <el-empty v-if="!detailGrants.length" description="暂无使用授权" :image-size="58" />
      </section>
      <section v-else-if="detailTab === 'duties'" class="page-body" aria-label="负责维护">
        <div v-for="item in responsibilities" :key="item.id" class="member-detail-row">
          <div>
            <RouterLink v-if="organization.isAdmin" :to="adminCapabilityLink(item)"><strong>{{ item.name }}</strong></RouterLink>
            <strong v-else>{{ item.name }}</strong>
            <small>{{ item.type }}</small>
          </div>
          <span class="muted">{{ capabilityResponsibilities(item, detailMember.id) }}</span>
        </div>
        <el-empty v-if="!responsibilities.length" description="暂无负责维护的对象" :image-size="58" />
      </section>
      <section v-else class="page-body" aria-label="成员变更"><AdminObjectChanges :target-id="detailMember.id" /></section>
      <AdminMemberTransferDialog v-if="organization.isAdmin" v-model="transferOpen" :member="detailMember" />
    </template>

    <template v-else-if="route.params.id">
      <PageHeader title="组织与成员" />
      <el-empty description="成员不存在或当前账号无权查看"><RouterLink :to="{ name: 'admin-members' }">返回组织与成员</RouterLink></el-empty>
    </template>
    <template v-else>
      <PageHeader title="组织与成员">
        <template #actions>
          <el-button v-if="department && assignable.length" :disabled="!departmentMemberIds.length" @click="openGrants(departmentMemberIds, true)">为本部门分配能力</el-button>
          <el-button type="primary" :icon="Plus" @click="addMember">添加成员</el-button>
        </template>
      </PageHeader>
      <div class="page-body organization-members-layout">
        <OrganizationDepartmentTree :selected-id="department" @select="setDepartment" />
        <section class="organization-members-content" aria-label="组织成员">
          <div class="page-toolbar page-tab-toolbar member-toolbar">
            <div class="member-list-context"><strong>{{ department ? departments.find(item => item.id === department)?.name : '全部成员' }} <small>{{ members.length }}</small></strong><el-checkbox v-if="department" v-model="includeChildren" size="small">含子部门</el-checkbox></div>
          </div>
          <div class="admin-filter-grid member-filters">
            <el-input v-model="query" :prefix-icon="Search" aria-label="搜索成员" placeholder="搜索姓名、部门或岗位" clearable />
            <el-select v-model="roleFilter" aria-label="按角色筛选" placeholder="全部角色" clearable><el-option v-for="item in organization.roles" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-select v-model="statusFilter" aria-label="按账号状态筛选" placeholder="全部状态" clearable><el-option label="已启用" value="active" /><el-option label="已停用" value="disabled" /></el-select>
            <el-button @click="router.replace({ name: 'admin-members', query: { department: department || undefined } })">重置</el-button>
          </div>
          <div v-if="selectedIds.length" class="admin-batch-bar"><strong>已选择 {{ selectedIds.length }} 位成员</strong><el-button @click="assignRoles(selectedIds)">分配角色</el-button><el-button v-if="assignable.length" @click="openGrants(selectedIds, true)">调整直接授权</el-button><el-button text @click="selectedIds = []">取消选择</el-button></div>
          <div class="member-table">
            <div class="member-row member-head">
              <el-checkbox aria-label="选择当前列表全部成员" :model-value="allSelected" :indeterminate="!!selectedIds.length && !allSelected" @change="selectAll" />
              <span>成员</span><span class="member-department">部门</span><span class="member-role">角色</span><span class="member-count">使用授权</span><span>操作</span>
            </div>
            <div v-for="member in pageMembers" :key="member.id" class="member-row">
              <el-checkbox :aria-label="'选择' + member.name" :disabled="!organization.canManageMember(member)" :model-value="selectedIds.includes(member.id)" @change="selectMember(member.id, $event)" />
              <div class="member-identity">
                <span class="member-avatar" aria-hidden="true">{{ member.initials }}</span>
                <div><strong>{{ member.name }}</strong><small>{{ member.title }}{{ member.status === 'disabled' ? ' · 已停用' : '' }}</small></div>
              </div>
              <span class="member-department">{{ member.department || '—' }}</span>
              <span class="member-role member-role-names">{{ organization.memberRoles(member.id).map(item => item.name).join('、') }}</span>
              <span class="member-count">{{ accessCount(member.id) }} 项</span>
              <el-button link type="primary" :aria-label="'查看' + member.name" @click="showMember(member.id)">查看</el-button>
            </div>
          </div>
          <ElPagination v-if="members.length > 20" :current-page="page" :page-size="20" :total="members.length" layout="total, prev, pager, next" class="admin-pagination" @update:current-page="router.replace({ query: { ...route.query, page: $event } })" />
          <el-empty v-if="!members.length" description="没有符合条件的成员" :image-size="72"><el-button @click="router.replace({ name: 'admin-members' })">查看全部成员</el-button></el-empty>
        </section>
      </div>
    </template>

    <RoleAssignmentDialog v-model="assignmentOpen" :member-ids="assignmentMemberIds" />

    <ElDrawer v-model="grantOpen" :title="isBatch ? '批量调整使用授权' : '编辑使用授权'" size="min(100vw, 500px)" append-to-body>
      <form class="grant-form" @submit.prevent="saveGrants">
        <p class="muted">成员 · {{ organization.visibleMembers.filter(member => grantMemberIds.includes(member.id)).map(member => member.name).join('、') }}</p>
        <p class="muted grant-hint">这里调整直接使用授权。角色授予的权限可在「角色分配」中调整，其他来源的有效授权继续保留。</p>
        <p v-if="isBatch" class="muted grant-hint">授权写入本次所选成员，之后新增或调入的成员需单独分配。</p>
        <el-select v-if="isBatch" v-model="grantMode" aria-label="批量操作">
          <el-option label="分配使用权" value="分配" /><el-option label="收回使用权" value="收回" />
        </el-select>
        <el-select :model-value="grantIds" multiple filterable collapse-tags :max-collapse-tags="3" collapse-tags-tooltip aria-label="选择能力与资源" placeholder="选择能力与资源" @update:model-value="updateGrantIds">
          <el-option v-for="item in assignable" :key="item.id" :value="item.id" :label="item.name + ' · ' + item.type + (item.enabled ? '' : ' · 未启用')" />
        </el-select>
        <section v-if="automaticGrants.length" class="grant-companions" aria-label="默认勾选的配套项">
          <p class="muted">默认勾选的配套项</p>
          <ul>
            <li v-for="item in automaticGrants" :key="item.id">
              <span>{{ item.name }}</span>
              <el-button link type="primary" :aria-label="'取消勾选 ' + item.name" @click="updateGrantIds(grantIds.filter(id => id !== item.id))">取消勾选</el-button>
            </li>
          </ul>
        </section>
        <p v-else-if="hasPairedCapabilities && grantMode === '分配'" class="muted grant-hint">新增工作台或组织助理时会默认勾选其配套项，可单独取消。</p>
        <p class="muted" aria-live="polite">本次将变更 {{ affected }} 条使用授权。</p>
        <div class="member-actions"><el-button @click="grantOpen = false">取消</el-button><el-button type="primary" native-type="submit" :disabled="!affected">保存授权</el-button></div>
      </form>
    </ElDrawer>

    <el-dialog v-model="profileOpen" :before-close="beforeProfileClose" :title="creatingMember ? '添加成员' : '编辑成员'" width="min(450px, 94vw)" append-to-body>
      <el-form label-position="top" @submit.prevent="saveProfile">
        <el-form-item label="姓名"><el-input v-model="profile.name" /></el-form-item>
        <el-form-item label="部门">
          <el-select v-if="creatingMember" v-model="profile.departmentId" aria-label="归属部门">
            <el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <span v-else>{{ detailMember?.department || '未分配' }}</span>
        </el-form-item>
        <el-form-item label="岗位"><el-input v-model="profile.title" /></el-form-item>
        <el-form-item v-if="!creatingMember" label="账号状态">
          <el-select v-model="profile.status" :disabled="detailMember?.id === platform.currentUser.id"><el-option label="已启用" value="active" /><el-option label="已停用" value="disabled" /></el-select>
        </el-form-item>
        <div class="member-actions"><el-button @click="cancelProfile">取消</el-button><el-button type="primary" native-type="submit" :disabled="!profile.name.trim() || (creatingMember && !profile.departmentId)">保存成员</el-button></div>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.organization-members-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: inherit; }
.organization-members-content { min-width: 0; container-type: inline-size; }.member-list-context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; }.member-list-context small { color: var(--muted); margin-left: 4px; }.member-role-names { font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.member-back { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); font-size: 13px; }
.member-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.member-actions .el-button { margin-left: 0; }
.member-profile { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(155px, 100%), 1fr)); gap: 10px; margin: 0; }
.member-profile > div { background: var(--canvas); border-radius: 8px; padding: 12px; overflow-wrap: anywhere; }
.member-profile dt { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
.member-profile dd { margin: 0; font-weight: 600; }
.page-tab small { color: var(--muted); font-size: 12px; }
.member-toolbar { padding-inline: 0; }
.member-filters { padding-block: var(--page-filter-padding) var(--page-body-start); row-gap: 6px; }
.member-row { display: grid; grid-template-columns: 28px minmax(120px, 1.4fr) minmax(90px, 1fr) minmax(88px, .8fr) 76px 48px; gap: 12px; align-items: center; min-height: 61px; padding: 8px 16px; border-top: 1px solid var(--line); font-size: 13px; }
.member-head { min-height: 40px; background: var(--canvas); color: var(--muted); }
.member-identity { display: flex; align-items: center; gap: 9px; min-width: 0; }
.member-identity small, .member-detail-row small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.member-avatar { display: grid; place-items: center; flex: 0 0 32px; height: 32px; border-radius: 50%; background: var(--soft); color: var(--accent); font-weight: 650; }
.member-detail-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.member-detail-row > div { min-width: 0; overflow-wrap: anywhere; }
.member-detail-row a:hover { color: var(--accent); }
.grant-form { display: grid; gap: 14px; }
.grant-form p { margin: 0; }
.grant-hint { font-size: 12px; }
.grant-companions { display: grid; gap: 6px; padding: 9px 12px; border-radius: 8px; background: var(--canvas); font-size: 12px; }
.grant-companions ul { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.grant-companions li { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.grant-companions li span { overflow-wrap: anywhere; }
.grant-companions li .el-button { flex: none; }
@media (max-width: 800px) {
  .organization-members-layout { grid-template-columns: minmax(0, 1fr); }
  .organization-members-layout :deep(.organization-tree-panel) { border-inline-end: 0; }
}
@container (max-width: 650px) {
  .member-row { grid-template-columns: 24px minmax(0, 1.3fr) minmax(84px, .8fr) 48px; gap: 8px; padding-inline: 10px; }
  .member-department, .member-count { display: none; }
}
@container (max-width: 430px) {
  .member-row { grid-template-columns: 24px minmax(0, 1fr) 42px; }
  .member-role { display: none; }
}
</style>
