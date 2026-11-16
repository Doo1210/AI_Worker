<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ShieldCheck } from 'lucide-vue-next'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { organizationRoleLabels } from '@/stores/organizationAdminData'
import { usePlatformStore, type User } from '@/stores/platform'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const role = ref<User['role']>('admin')
const descriptions: Record<User['role'], { scope: string; actions: string }> = {
  admin: { scope: '全组织', actions: '维护组织架构和成员，分配角色与能力，管理系统接入和运行。' },
  'department-admin': { scope: '为该管理员指定的部门', actions: '维护指定部门的普通成员，并分配或收回已委派的能力。' },
  member: { scope: '本人获授权的工作范围', actions: '使用工作门户，按授权访问助理、工作台和 AI 员工。' },
}
const members = computed(() => organization.visibleMembers.filter(member => member.role === role.value))
const candidates = computed(() => organization.visibleMembers.filter(member => member.id !== platform.currentUser.id && member.status !== 'disabled'))
const open = ref(false)
const memberId = ref('')
const draft = reactive({ role: 'member' as User['role'], managementDepartmentIds: [] as string[], assignableCapabilityIds: [] as string[] })

function departmentLabels(ids: string[] = []) {
  return organization.departments.filter(department => ids.includes(department.id)).map(department => department.name).join('、')
}

function configure(member?: User) {
  memberId.value = member?.id ?? ''
  draft.role = member?.role ?? role.value
  draft.managementDepartmentIds = [...(member?.managementDepartmentIds ?? [])]
  draft.assignableCapabilityIds = [...(member?.assignableCapabilityIds ?? [])]
  open.value = true
}

function save() {
  if (!organization.updateMemberRole(memberId.value, draft)) {
    ElMessage.warning('请核对成员和角色管理范围')
    return
  }
  role.value = draft.role
  open.value = false
  ElMessage.success('管理角色已更新')
}
</script>

<template>
  <section class="page page-surface" aria-label="角色与权限">
    <header class="page-controls">
      <div class="page-tabs" role="group" aria-label="内置角色">
        <button v-for="(label, key) in organizationRoleLabels" :key="key" class="page-tab" type="button"
          :aria-pressed="role === key" @click="role = key">{{ label }}</button>
      </div>
      <div class="page-toolbar page-tab-toolbar">
        <span class="muted">{{ members.length }} 位成员</span>
        <div class="page-toolbar-controls">
          <el-button type="primary" :icon="ShieldCheck" :disabled="!candidates.length" @click="configure()">分配角色</el-button>
        </div>
      </div>
    </header>
    <dl class="role-description">
      <div><dt>适用范围</dt><dd>{{ descriptions[role].scope }}</dd></div>
      <div><dt>可执行操作</dt><dd>{{ descriptions[role].actions }}</dd></div>
    </dl>
    <ul v-if="members.length" class="role-members" aria-label="已分配成员">
      <li v-for="member in members" :key="member.id">
        <RouterLink :to="{ name: 'admin-members', params: { id: member.id } }">
          <strong>{{ member.name }}</strong>
          <small>{{ member.department }}<template v-if="member.role === 'department-admin'"> · 管理 {{ departmentLabels(member.managementDepartmentIds) || '未指定' }}</template></small>
        </RouterLink>
        <el-tag v-if="member.status === 'disabled'" size="small" type="info">已停用</el-tag>
        <el-button v-else-if="member.id !== platform.currentUser.id" link type="primary" @click="configure(member)">调整角色</el-button>
      </li>
    </ul>
    <el-empty v-else description="暂无成员使用此角色" :image-size="70" />

    <el-dialog v-model="open" title="分配管理角色" width="min(500px, calc(100vw - 32px))" append-to-body>
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="成员" required>
          <el-select v-model="memberId" aria-label="选择成员" placeholder="选择成员" filterable>
            <el-option v-for="item in candidates" :key="item.id" :value="item.id" :label="`${item.name} · ${item.department}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="组织角色" required>
          <el-select v-model="draft.role" aria-label="组织角色">
            <el-option v-for="(label, key) in organizationRoleLabels" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
        <template v-if="draft.role === 'department-admin'">
          <el-form-item label="可管理部门" required>
            <el-select v-model="draft.managementDepartmentIds" aria-label="可管理部门" multiple filterable collapse-tags>
              <el-option v-for="item in organization.departments" :key="item.id" :value="item.id" :label="item.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="可分配能力">
            <el-select v-model="draft.assignableCapabilityIds" aria-label="可分配能力" multiple filterable collapse-tags
              placeholder="选择可向部门成员分配的能力">
              <el-option v-for="item in organization.capabilities" :key="item.id" :value="item.id" :label="`${item.name} · ${item.type}`" />
            </el-select>
          </el-form-item>
        </template>
        <div class="page-toolbar-controls">
          <el-button @click="open = false">取消</el-button>
          <el-button type="primary" native-type="submit"
            :disabled="!memberId || (draft.role === 'department-admin' && !draft.managementDepartmentIds.length)">保存角色</el-button>
        </div>
      </el-form>
    </el-dialog>
  </section>
</template>

<style scoped>
.role-description { display: flex; flex-wrap: wrap; gap: 10px 24px; padding: 14px 16px; margin: 0; border-bottom: 1px solid var(--line); }
.role-description dt { color: var(--muted); font-size: 12px; margin-bottom: 5px; }
.role-description dd { margin: 0; overflow-wrap: anywhere; }
.role-members { list-style: none; margin: 0; padding: 0; }
.role-members li { display: flex; align-items: center; gap: 8px; padding: 11px 16px; border-bottom: 1px solid var(--line); }
.role-members a { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.role-members a:hover { color: var(--accent); }
.role-members small { display: block; margin-top: 3px; color: var(--muted); }
</style>
