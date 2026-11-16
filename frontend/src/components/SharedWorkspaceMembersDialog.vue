<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UserRoundPlus } from 'lucide-vue-next'
import { usePlatformStore } from '@/stores/platform'
import { useSharedWorkspacesStore, type SharedWorkspacePermission } from '@/stores/sharedWorkspaces'

const props = defineProps<{ spaceId: string }>()
const open = defineModel<boolean>({ default: false })
const platform = usePlatformStore()
const sharedWorkspaces = useSharedWorkspacesStore()
const space = computed(() => sharedWorkspaces.workspaces.find(item => item.id === props.spaceId))
const canManage = computed(() => sharedWorkspaces.canManage(props.spaceId))
const visible = computed({
  get: () => open.value && canManage.value && !!space.value,
  set: (value: boolean) => { open.value = value },
})
const people = computed(() => new Map(platform.users.map(person => [person.id, person])))
const creator = computed(() => people.value.get(space.value?.creatorId ?? ''))
const members = computed(() => (space.value?.members ?? []).map(member => ({
  ...member,
  person: people.value.get(member.userId),
})).sort((left, right) => (left.person?.name ?? left.userId).localeCompare(right.person?.name ?? right.userId, 'zh-CN')))
const candidates = computed(() => {
  const assigned = new Set(space.value?.members.map(member => member.userId))
  return platform.users.filter(person => person.status !== 'disabled'
    && person.id !== space.value?.creatorId && !assigned.has(person.id))
})
const inviteId = ref('')
const invitePermission = ref<SharedWorkspacePermission>('view')
const invitee = computed(() => candidates.value.find(person => person.id === inviteId.value))

watch(() => props.spaceId, () => { open.value = false })
watch(canManage, (allowed) => { if (!allowed) open.value = false })
watch(visible, () => {
  inviteId.value = ''
  invitePermission.value = 'view'
})

function inviteMember() {
  const person = invitee.value
  if (!person || !visible.value) return
  if (!sharedWorkspaces.setMember(props.spaceId, person.id, invitePermission.value)) {
    ElMessage.error('暂时无法邀请该成员')
    return
  }
  inviteId.value = ''
  invitePermission.value = 'view'
  ElMessage.success(`已邀请 ${person.name}`)
}

function updatePermission(userId: string, previous: SharedWorkspacePermission, event: Event) {
  const field = event.target as HTMLSelectElement
  const permission = field.value
  if (visible.value && (permission === 'view' || permission === 'edit')
    && sharedWorkspaces.setMember(props.spaceId, userId, permission)) {
    ElMessage.success('已更新成员权限')
    return
  }
  field.value = previous
  ElMessage.error('暂时无法更新成员权限')
}

function removeMember(userId: string) {
  if (!visible.value) return
  if (sharedWorkspaces.removeMember(props.spaceId, userId)) ElMessage.success('已移除成员')
  else ElMessage.error('暂时无法移除该成员')
}
</script>

<template>
  <el-dialog v-model="visible" title="成员管理" width="min(560px, calc(100vw - 24px))" append-to-body destroy-on-close>
    <div v-if="space && canManage" class="members-content">
      <header class="members-summary">
        <strong>{{ space.name }}</strong>
        <span>{{ members.length + 1 }} 位成员</span>
      </header>

      <form v-if="candidates.length" class="invite-form" @submit.prevent="inviteMember">
        <label class="invite-person">
          <span>选择成员</span>
          <select v-model="inviteId">
            <option value="" disabled>请选择成员</option>
            <option v-for="person in candidates" :key="person.id" :value="person.id">
              {{ person.name }}{{ person.department ? ' · ' + person.department : '' }}
            </option>
          </select>
        </label>
        <label>
          <span>邀请权限</span>
          <select v-model="invitePermission">
            <option value="view">查看</option>
            <option value="edit">编辑</option>
          </select>
        </label>
        <el-button native-type="submit" type="primary" :icon="UserRoundPlus" :disabled="!invitee">邀请成员</el-button>
      </form>
      <p v-else class="members-muted">暂无可邀请成员</p>

      <ul class="members-list" aria-label="空间成员">
        <li class="member-row">
          <span class="member-avatar" aria-hidden="true">{{ creator?.initials || creator?.name.slice(0, 1) || '创' }}</span>
          <div class="member-person">
            <strong>{{ creator?.name ?? '创建者' }}</strong>
            <span v-if="creator?.department">{{ creator.department }}</span>
          </div>
          <span class="creator-role">创建者</span>
        </li>
        <li v-for="member in members" :key="member.userId" class="member-row">
          <span class="member-avatar" aria-hidden="true">{{ member.person?.initials || member.person?.name.slice(0, 1) || '员' }}</span>
          <div class="member-person">
            <strong>{{ member.person?.name ?? '成员已停用' }}</strong>
            <span v-if="member.person?.status === 'disabled'">已停用</span>
            <span v-else-if="member.person?.department">{{ member.person.department }}</span>
          </div>
          <select :aria-label="`${member.person?.name ?? member.userId}的权限`" :value="member.permission"
            :disabled="!member.person || member.person.status === 'disabled'"
            @change="updatePermission(member.userId, member.permission, $event)">
            <option value="view">查看</option>
            <option value="edit">编辑</option>
          </select>
          <button type="button" class="remove-member" :aria-label="`移除${member.person?.name ?? member.userId}`"
            @click="removeMember(member.userId)">移除</button>
        </li>
      </ul>
    </div>
  </el-dialog>
</template>

<style scoped>
.members-content { container-type: inline-size; display: grid; gap: 15px; }
.members-summary { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; }
.members-summary strong { color: var(--text); font-size: 15px; overflow-wrap: anywhere; }
.members-summary span, .members-muted { color: var(--muted); font-size: 12px; }
.members-muted { margin: 0; }
.invite-form {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(76px, auto) auto; align-items: end; gap: 10px;
  padding: 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas);
}
.invite-form label { display: grid; gap: 5px; min-width: 0; color: var(--muted); font-size: 12px; }
select {
  width: 100%; min-width: 0; min-height: 32px; padding: 4px 7px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--surface); color: var(--text); font: inherit; font-size: 13px;
}
.members-list { max-height: min(45dvh, 360px); overflow-y: auto; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: 8px; }
.member-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) 72px 34px; align-items: center; gap: 10px; padding: 9px 11px; }
.member-row + .member-row { border-top: 1px solid var(--line); }
.member-avatar {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 7px;
  background: var(--soft); color: var(--accent); font-size: 13px; font-weight: 650;
}
.member-person { display: grid; gap: 2px; min-width: 0; }
.member-person strong { color: var(--text); font-size: 13px; }
.member-person span, .creator-role { color: var(--muted); font-size: 12px; }
.member-person strong, .member-person span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.creator-role { justify-self: start; padding: 3px 6px; border-radius: 5px; background: var(--canvas); }
.remove-member {
  min-height: 29px; padding: 0; border: 0; border-radius: 5px; background: transparent;
  color: var(--muted); font: inherit; font-size: 12px;
}
.remove-member:hover { background: #fdf0ee; color: #a5342a; }
@container (max-width: 360px) {
  .invite-form { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .invite-person { grid-column: 1 / -1; }
  .member-row { grid-template-columns: 28px minmax(0, 1fr) 60px 30px; gap: 6px; padding-inline: 8px; }
  .member-avatar { width: 28px; height: 28px; }
}
</style>
