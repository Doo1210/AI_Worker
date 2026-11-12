<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDrawer, ElMessage } from 'element-plus'
import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
import { adminCapabilityLink } from '@/adminCatalogs'
import { usePlatformStore, type User } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const query = ref('')
const department = ref('')
const selectedIds = ref<string[]>([])
const detailMember = computed(() => platform.users.find(member => member.id === route.params.id))
const detailGrants = computed(() => organization.capabilities.filter(capability => capability.memberIds.includes(detailMember.value?.id ?? '')))
const responsibilities = computed(() => {
  const memberId = detailMember.value?.id
  return memberId ? organization.capabilities.filter(capability =>
    capability.maintainerId === memberId || capability.configuratorIds.includes(memberId)) : []
})
const publications = computed(() => organization.capabilities.filter(capability => capability.publisherIds.includes(detailMember.value?.id ?? '')))
const departments = computed(() => [...new Set(platform.users.map(member => member.department).filter(Boolean))])
const members = computed(() => {
  const search = query.value.trim().toLowerCase()
  return platform.users.filter(member => (!department.value || member.department === department.value)
    && [member.name, member.department, member.title].some(value => value.toLowerCase().includes(search)))
})
const visibleIds = computed(() => members.value.map(member => member.id))
const allSelected = computed(() => visibleIds.value.length > 0 && visibleIds.value.every(id => selectedIds.value.includes(id)))

const grantOpen = ref(false)
const grantMemberIds = ref<string[]>([])
const grantIds = ref<string[]>([])
const grantMode = ref<'分配' | '收回'>('分配')
const isBatch = computed(() => grantMemberIds.value.length > 1)
const capabilitiesById = computed(() => new Map(organization.capabilities.map(item => [item.id, item])))
const hasPairedCapabilities = computed(() => organization.capabilities.some(item => item.pairedId))
const automaticPairs = reactive(new Map<string, string>())
const explicitlyDeselected = new Set<string>()
const automaticGrants = computed(() => organization.capabilities.filter(item => automaticPairs.has(item.id)))
const affected = computed(() => {
  const selected = new Set(grantIds.value)
  return grantMemberIds.value.reduce((total, memberId) => total + organization.capabilities.filter(item => {
    const hasAccess = item.memberIds.includes(memberId)
    if (!isBatch.value) return hasAccess !== selected.has(item.id)
    return selected.has(item.id) && (grantMode.value === '分配' ? !hasAccess : hasAccess)
  }).length, 0)
})
const profileOpen = ref(false)
const creatingMember = ref(false)
const profile = reactive({ name: '', department: '', title: '', role: 'member' as User['role'], status: 'active' as NonNullable<User['status']> })

watch([query, department], () => { selectedIds.value = [] })
watch(grantMode, () => {
  grantIds.value = grantIds.value.filter(id => !automaticPairs.has(id))
  automaticPairs.clear()
  explicitlyDeselected.clear()
})

function selectAll(checked: unknown) {
  selectedIds.value = checked ? [...visibleIds.value] : []
}

function selectMember(id: string, checked: unknown) {
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(value => value !== id)
}

function openGrants(ids: string[]) {
  grantMemberIds.value = [...ids]
  automaticPairs.clear()
  explicitlyDeselected.clear()
  grantIds.value = ids.length === 1
    ? organization.capabilities.filter(item => item.memberIds.includes(ids[0] ?? '')).map(item => item.id)
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
    if (!pairedId || next.has(pairedId) || explicitlyDeselected.has(pairedId) || !capabilitiesById.value.has(pairedId)) continue
    next.add(pairedId)
    automaticPairs.set(pairedId, id)
  }
  grantIds.value = [...next]
}

function saveGrants() {
  const selected = new Set(grantIds.value)
  let changed = false
  for (const memberId of grantMemberIds.value) {
    const current = organization.capabilities.filter(item => item.memberIds.includes(memberId)).map(item => item.id)
    const ids = !isBatch.value ? grantIds.value : grantMode.value === '分配'
      ? [...new Set([...current, ...grantIds.value])]
      : current.filter(id => !selected.has(id))
    changed = organization.setMemberCapabilities(memberId, ids) || changed
  }
  if (changed) ElMessage.success('使用授权已更新')
  grantOpen.value = false
}

function editProfile() {
  const member = detailMember.value
  if (!member) return
  creatingMember.value = false
  Object.assign(profile, { name: member.name, department: member.department, title: member.title, role: member.role, status: member.status ?? 'active' })
  profileOpen.value = true
}

function addMember() {
  creatingMember.value = true
  Object.assign(profile, { name: '', department: '', title: '', role: 'member', status: 'active' })
  profileOpen.value = true
}

function saveProfile() {
  const member = detailMember.value
  const saved = creatingMember.value ? organization.createMember(profile) : member && organization.updateMember(member.id, profile)
  if (!saved) {
    ElMessage.warning('请确认成员信息与角色设置')
    return
  }
  profileOpen.value = false
  ElMessage.success(creatingMember.value ? '已添加成员' : '成员信息已保存')
}

function accessCount(id: string) {
  return organization.capabilities.filter(item => item.memberIds.includes(id)).length
}

function showMember(id: string) {
  void router.push({ name: 'admin-members', params: { id } })
}
</script>

<template>
  <div class="page members-page">
    <RouterLink v-if="detailMember" class="member-back" :to="{ name: 'admin-members' }"><el-icon><ArrowLeft /></el-icon>组织与成员</RouterLink>
    <header class="page-header">
      <div>
        <h1>{{ detailMember?.name ?? '组织与成员' }}</h1>
        <p>{{ detailMember ? [detailMember.department, detailMember.title].filter(Boolean).join(' · ') : '按成员查看和分配组织能力，管理部门归属和组织角色。' }}</p>
      </div>
      <div v-if="detailMember" class="member-actions">
        <el-button @click="editProfile">编辑成员</el-button>
        <el-button type="primary" @click="openGrants([detailMember.id])">编辑使用授权</el-button>
      </div>
      <el-button v-else type="primary" :icon="Plus" @click="addMember">添加成员</el-button>
    </header>

    <template v-if="detailMember">
      <section class="panel member-panel" aria-label="使用授权">
        <div class="member-section-title"><h2 class="section-title">使用授权</h2><span class="muted">{{ detailGrants.length }} 项</span></div>
        <div v-for="item in detailGrants" :key="item.id" class="member-detail-row">
          <RouterLink :to="adminCapabilityLink(item)"><strong>{{ item.name }}</strong><small>{{ item.type }} · 直接分配</small></RouterLink>
          <el-tag :type="detailMember.status === 'disabled' || !item.enabled ? 'info' : item.ready ? 'success' : 'warning'" effect="plain">{{ detailMember.status === 'disabled' ? '账号已停用' : item.enabled ? (item.ready ? '可使用' : '待就绪') : '未启用' }}</el-tag>
        </div>
        <el-empty v-if="!detailGrants.length" description="暂无使用授权" :image-size="58" />
      </section>
      <section class="panel member-panel member-responsibilities" aria-label="负责维护">
        <div class="member-section-title"><h2 class="section-title">负责维护</h2><span class="muted">{{ responsibilities.length }} 项</span></div>
        <div v-for="item in responsibilities" :key="item.id" class="member-detail-row">
          <RouterLink :to="adminCapabilityLink(item)"><strong>{{ item.name }}</strong><small>{{ item.type }}</small></RouterLink>
          <el-tag effect="plain">配置维护</el-tag>
        </div>
        <el-empty v-if="!responsibilities.length" description="暂无负责维护的对象" :image-size="58" />
      </section>
      <section v-if="publications.length" class="panel member-panel member-responsibilities" aria-label="可发布">
        <div class="member-section-title"><h2 class="section-title">可发布</h2><span class="muted">{{ publications.length }} 项</span></div>
        <div v-for="item in publications" :key="item.id" class="member-detail-row">
          <RouterLink :to="adminCapabilityLink(item)"><strong>{{ item.name }}</strong><small>{{ item.type }}</small></RouterLink>
          <el-tag effect="plain">版本发布</el-tag>
        </div>
      </section>
    </template>

    <section v-else class="panel member-panel" aria-label="组织成员">
      <div class="member-toolbar">
        <el-input v-model="query" :prefix-icon="Search" aria-label="搜索成员" placeholder="搜索姓名、部门或岗位" clearable />
        <el-select v-model="department" aria-label="按部门筛选" placeholder="全部部门" clearable>
          <el-option v-for="item in departments" :key="item" :label="item" :value="item" />
        </el-select>
        <el-button type="primary" :disabled="!selectedIds.length" @click="openGrants(selectedIds)">批量调整授权{{ selectedIds.length ? '（' + selectedIds.length + '）' : '' }}</el-button>
      </div>
      <div class="member-table">
        <div class="member-row member-head">
          <el-checkbox aria-label="选择当前列表全部成员" :model-value="allSelected" :indeterminate="!!selectedIds.length && !allSelected" @change="selectAll" />
          <span>成员</span><span class="member-department">部门</span><span class="member-role">角色</span><span class="member-count">使用授权</span><span>操作</span>
        </div>
        <div v-for="member in members" :key="member.id" class="member-row">
          <el-checkbox :aria-label="'选择' + member.name" :model-value="selectedIds.includes(member.id)" @change="selectMember(member.id, $event)" />
          <div class="member-identity">
            <span class="member-avatar" aria-hidden="true">{{ member.initials }}</span>
            <div><strong>{{ member.name }}</strong><small>{{ member.title }}{{ member.status === 'disabled' ? ' · 已停用' : '' }}</small></div>
          </div>
          <span class="member-department">{{ member.department || '—' }}</span>
          <span class="member-role">{{ member.role === 'admin' ? '组织管理员' : '成员' }}</span>
          <span class="member-count">{{ accessCount(member.id) }} 项</span>
          <el-button link type="primary" :aria-label="'查看' + member.name" @click="showMember(member.id)">查看</el-button>
        </div>
      </div>
      <el-empty v-if="!members.length" description="没有符合条件的成员" :image-size="72" />
    </section>

    <ElDrawer v-model="grantOpen" :title="isBatch ? '批量调整使用授权' : '编辑使用授权'" size="min(100vw, 500px)" append-to-body>
      <form class="grant-form" @submit.prevent="saveGrants">
        <p class="muted">成员 · {{ platform.users.filter(member => grantMemberIds.includes(member.id)).map(member => member.name).join('、') }}</p>
        <el-select v-if="isBatch" v-model="grantMode" aria-label="批量操作">
          <el-option label="分配使用权" value="分配" /><el-option label="收回使用权" value="收回" />
        </el-select>
        <el-select :model-value="grantIds" multiple filterable collapse-tags :max-collapse-tags="3" collapse-tags-tooltip aria-label="选择能力与资源" placeholder="选择能力与资源" @update:model-value="updateGrantIds">
          <el-option v-for="item in organization.capabilities" :key="item.id" :value="item.id" :label="item.name + ' · ' + item.type + (item.enabled ? '' : ' · 未启用')" />
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

    <el-dialog v-model="profileOpen" :title="creatingMember ? '添加成员' : '编辑成员'" width="min(450px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveProfile">
        <el-form-item label="姓名"><el-input v-model="profile.name" /></el-form-item>
        <el-form-item label="部门"><el-input v-model="profile.department" /></el-form-item>
        <el-form-item label="岗位"><el-input v-model="profile.title" /></el-form-item>
        <el-form-item label="组织角色">
          <el-select v-model="profile.role" :disabled="detailMember?.id === platform.currentUser.id"><el-option label="组织管理员" value="admin" /><el-option label="成员" value="member" /></el-select>
        </el-form-item>
        <el-form-item v-if="!creatingMember" label="账号状态">
          <el-select v-model="profile.status" :disabled="detailMember?.id === platform.currentUser.id"><el-option label="已启用" value="active" /><el-option label="已停用" value="disabled" /></el-select>
        </el-form-item>
        <div class="member-actions"><el-button @click="profileOpen = false">取消</el-button><el-button type="primary" native-type="submit" :disabled="!profile.name.trim()">保存成员</el-button></div>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.member-back { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 13px; color: var(--accent); font-size: 13px; }
.member-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.member-actions .el-button { margin-left: 0; }
.member-panel { overflow: hidden; }
.member-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding: 14px 16px; }
.member-toolbar .el-input { width: min(100%, 280px); }
.member-toolbar .el-select { width: 145px; }
.member-toolbar .el-button { margin-left: auto; }
.member-row { display: grid; grid-template-columns: 28px minmax(120px, 1.4fr) minmax(90px, 1fr) minmax(88px, .8fr) 76px 48px; gap: 12px; align-items: center; min-height: 61px; padding: 8px 16px; border-top: 1px solid var(--line); font-size: 13px; }
.member-head { min-height: 40px; background: var(--canvas); color: var(--muted); }
.member-identity { display: flex; align-items: center; gap: 9px; min-width: 0; }
.member-identity small, .member-detail-row small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.member-avatar { display: grid; place-items: center; flex: 0 0 32px; height: 32px; border-radius: 50%; background: var(--soft); color: var(--accent); font-weight: 650; }
.member-section-title, .member-detail-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 16px; }
.member-section-title h2 { margin: 0; }
.member-detail-row { border-top: 1px solid var(--line); }
.member-detail-row a:hover { color: var(--accent); }
.member-responsibilities { margin-top: 15px; }
.grant-form { display: grid; gap: 14px; }
.grant-form p { margin: 0; }
.grant-hint { font-size: 12px; }
.grant-companions { display: grid; gap: 6px; padding: 9px 12px; border-radius: 8px; background: var(--canvas); font-size: 12px; }
.grant-companions ul { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.grant-companions li { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.grant-companions li span { overflow-wrap: anywhere; }
.grant-companions li .el-button { flex: none; }
@media (max-width: 800px) {
  .member-row { grid-template-columns: 24px minmax(0, 1fr) 65px 42px; gap: 8px; padding-inline: 10px; }
  .member-department, .member-role { display: none; }
}
@media (max-width: 540px) {
  .members-page .page-header { flex-wrap: wrap; }
  .member-toolbar .el-button { margin-left: 0; }
}
</style>
