<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElDrawer, ElMessage } from 'element-plus'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore } from '@/stores/platform'

const props = defineProps<{ memberIds?: string[]; roleId?: string }>()
const open = defineModel<boolean>({ required: true })
const organization = useOrganizationAdminStore()
const platform = usePlatformStore()
const members = ref<string[]>([])
const selectedRoles = ref<string[]>([])
const scope = ref<string[]>([])
const capabilities = ref<string[]>([])
const candidates = computed(() => organization.visibleMembers.filter(member => member.status !== 'disabled' && organization.canManageMember(member)))
const single = computed(() => !props.roleId && members.value.length === 1)
const chosen = computed(() => organization.roles.filter(role => selectedRoles.value.includes(role.id)))
const managers = computed(() => chosen.value.filter(role => role.kind === 'management'))
const departmentManager = computed(() => managers.value.some(role => role.systemRole === 'department-admin'))
const replacing = computed(() => !props.roleId && single.value)
const choices = computed(() => organization.roles.filter(role => organization.canAssignRole(role)
  || members.value.every(id => organization.memberRoles(id).some(item => item.id === role.id))))
const affectedCapabilities = computed(() => organization.capabilities.filter(item => chosen.value.some(role => role.capabilityIds.includes(item.id))))
const preview = computed(() => members.value.map(id => {
  const current = organization.memberRoles(id)
  const next = replacing.value ? chosen.value : [...current.filter(role => !selectedRoles.value.includes(role.id)
    && !(managers.value.length && role.kind === 'management')), ...chosen.value]
  return { member: platform.users.find(member => member.id === id),
    added: next.filter(role => !current.some(item => item.id === role.id)).map(role => role.name),
    removed: current.filter(role => !next.some(item => item.id === role.id)).map(role => role.name) }
}))
const valid = computed(() => !!members.value.length && managers.value.length <= 1
  && (!departmentManager.value || scope.value.length > 0)
  && (!!selectedRoles.value.length || replacing.value))

function updateRoles(ids: string[]) {
  const addedManager = organization.roles.find(role => role.kind === 'management' && ids.includes(role.id) && !selectedRoles.value.includes(role.id))
  selectedRoles.value = addedManager ? ids.filter(id => id === addedManager.id
    || organization.roles.find(role => role.id === id)?.kind !== 'management') : ids
}

watch(open, visible => {
  if (!visible) return
  members.value = [...(props.memberIds ?? [])]
  const member = members.value.length === 1 ? platform.users.find(member => member.id === members.value[0]) : undefined
  selectedRoles.value = props.roleId ? [props.roleId] : member ? organization.memberRoles(member.id).map(role => role.id) : []
  scope.value = [...(member?.managementDepartmentIds ?? [])]
  capabilities.value = [...(member?.assignableCapabilityIds ?? [])]
})

function save() {
  if (!valid.value || !organization.assignRoles(members.value, selectedRoles.value, {
    replace: replacing.value, managementDepartmentIds: scope.value, assignableCapabilityIds: capabilities.value,
  })) {
    ElMessage.warning('请核对角色、成员及管理范围；本人管理角色不可在此变更')
    return
  }
  open.value = false
  ElMessage.success('角色分配已保存，使用权限已更新')
}
</script>

<template>
  <el-drawer v-model="open" title="分配角色" size="min(560px, 100vw)" append-to-body>
    <el-form label-position="top" class="role-assignment-form" @submit.prevent="save">
      <el-form-item label="成员" required>
        <el-select v-if="!props.memberIds?.length" v-model="members" multiple filterable aria-label="选择角色成员" placeholder="选择成员" collapse-tags :max-collapse-tags="3">
          <el-option v-for="member in candidates" :key="member.id" :value="member.id" :label="`${member.name} · ${member.department}`" />
        </el-select>
        <span v-else>{{ candidates.filter(member => members.includes(member.id)).map(member => member.name).join('、') }}</span>
      </el-form-item>
      <el-form-item label="角色" required>
        <el-select :model-value="selectedRoles" multiple filterable aria-label="分配的角色" placeholder="选择已有角色" collapse-tags :max-collapse-tags="3" :disabled="!!props.roleId" @update:model-value="updateRoles">
          <el-option v-for="role in choices" :key="role.id" :value="role.id" :label="role.name"
            :disabled="!role.enabled && !members.every(id => organization.memberRoles(id).some(item => item.id === role.id))" />
        </el-select>
      </el-form-item>
      <p class="assignment-help">业务角色可以多选，管理角色限选一个。{{ replacing ? '本次保存所选角色，移除未选中的角色。' : '本次追加角色，保留成员的其他业务角色。' }}</p>
      <p v-if="managers.length > 1" class="assignment-error" role="alert">请选择一个管理角色。</p>
      <template v-if="departmentManager">
        <el-form-item label="可管理部门" required>
          <el-select v-model="scope" multiple filterable aria-label="可管理部门" :disabled="!organization.isAdmin" placeholder="选择管理范围">
            <el-option v-for="department in organization.departments" :key="department.id" :value="department.id" :label="department.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="可分配能力">
          <el-select v-model="capabilities" multiple filterable collapse-tags :max-collapse-tags="2" aria-label="可分配能力" :disabled="!organization.isAdmin" placeholder="选择可向部门成员分配的能力">
            <el-option v-for="item in organization.capabilities" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </el-form-item>
      </template>
      <section class="assignment-preview" aria-label="角色分配预览" aria-live="polite">
        <strong>本次分配预览</strong>
        <p v-if="!members.length" class="muted">选择成员后查看变更。</p>
        <div v-for="item in preview" :key="item.member?.id" class="preview-member">
          <b>{{ item.member?.name }}</b>
          <span v-if="item.added.length">新增：{{ item.added.join('、') }}</span>
          <span v-if="item.removed.length">移除：{{ item.removed.join('、') }}</span>
          <span v-if="!item.added.length && !item.removed.length">保留所选角色，按当前角色配置同步权限。</span>
        </div>
        <p v-if="affectedCapabilities.length">包含 {{ affectedCapabilities.length }} 项使用权限：{{ affectedCapabilities.map(item => item.name).join('、') }}</p>
        <p class="muted">收回角色时保留直接分配和其他角色的有效授权。部门归属与岗位名称单独维护。</p>
      </section>
      <div class="page-toolbar-controls"><el-button @click="open = false">取消</el-button><el-button type="primary" native-type="submit" :disabled="!valid">确认分配</el-button></div>
    </el-form>
  </el-drawer>
</template>

<style scoped>
.role-assignment-form { display: grid; gap: 14px; }
.role-assignment-form .el-form-item { margin: 0; }
.assignment-help, .assignment-preview p { margin: 0; font-size: 12px; line-height: 1.7; color: var(--muted); }
.assignment-error { color: var(--el-color-danger); margin: 0; font-size: 12px; }
.assignment-preview { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--canvas); }
.assignment-preview > strong { font-size: 13px; }
.preview-member { display: grid; gap: 3px; font-size: 13px; overflow-wrap: anywhere; }
.preview-member span { color: var(--muted); }
</style>
