<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Activity, ArrowLeft, Bot, Boxes, Calculator, Check, ChevronDown, ChevronLeft, ChevronRight, Clock,
  FolderOpen, History, LayoutGrid, Menu, MessageSquare, Network, Package, PenTool, Plug, Plus, Settings2, ShieldCheck, Ship, UsersRound, X,
} from 'lucide-vue-next'
import { FileSearch, ListChecks, MessagesSquare, PanelsTopLeft } from 'lucide-vue-next'
import EmployeesSidebar from '@/components/EmployeesSidebar.vue'
import EmployeeRecentContacts from '@/components/EmployeeRecentContacts.vue'
import SidebarRecentSection from '@/components/SidebarRecentSection.vue'
import { adminCatalogs } from '@/adminCatalogs'
import { resourceLibraryLocation, resourceTypeFromQuery, resourceTypeItems } from '@/resourceNavigation'
import { usePlatformStore } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const store = usePlatformStore()
const organization = useOrganizationAdminStore()
const route = useRoute()
const router = useRouter()
const main = ref<HTMLElement>()
const mobileViewport = window.matchMedia('(max-width: 700px)')
const isMobile = ref(mobileViewport.matches)
const mobileMenu = ref(false)
const sidebarStorageKey = 'ai-worker-sidebar-collapsed'
const sidebarCollapsed = ref(false)
try {
  sidebarCollapsed.value = localStorage.getItem(sidebarStorageKey) === 'true'
} catch {
  // The sidebar can still be used without browser storage.
}
const isCompact = computed(() => sidebarCollapsed.value && !isMobile.value)
const sidebarAction = computed(() => isCompact.value ? '展开导航栏' : '收起导航栏')
const portalTabs = [
  { id: 'work', name: '工作区', home: '/work/chat' },
  { id: 'employees', name: 'AI 员工', home: '/employees' },
  { id: 'resources', name: '资源库', home: '/work/resources' },
] as const
type PortalTab = (typeof portalTabs)[number]['id']
const lastPortalPage = reactive<Record<PortalTab, string>>({
  work: portalTabs[0].home,
  employees: portalTabs[1].home,
  resources: portalTabs[2].home,
})
const adminTabs = [
  { id: 'organization', name: '组织管理', items: [
    { name: '组织架构', path: '/admin/departments', icon: Network },
    { name: '成员管理', path: '/admin/members', icon: UsersRound },
    { name: '角色与权限', path: '/admin/roles', icon: ShieldCheck },
  ] },
  { id: 'capabilities', name: '能力与资源', items: [
    { name: adminCatalogs['admin-workbenches'].title, path: '/admin/workbenches', icon: LayoutGrid },
    { name: adminCatalogs['admin-employees'].title, path: '/admin/employees', icon: Bot },
    { name: adminCatalogs['admin-resources'].title, path: '/admin/resources', icon: Boxes },
  ] },
  { id: 'system', name: '系统与运行', items: [
    { name: '系统接入', path: '/admin/connections', icon: Plug },
    { name: '运行监管', path: '/admin/runs', icon: Activity },
    { name: '变更记录', path: '/admin/changes', icon: History },
  ] },
] as const
const adminHome = adminTabs[0].items[1].path
const lastAdminPage = reactive<Record<(typeof adminTabs)[number]['id'], string>>({
  organization: adminHome,
  capabilities: adminTabs[1].items[0].path,
  system: adminTabs[2].items[0].path,
})
const lastUse = ref(lastPortalPage.work)
const lastAdmin = ref<string>(adminHome)
const isAdmin = computed(() => route.path.startsWith('/admin'))
const portalTab = computed<PortalTab>(() => {
  if (route.path === '/employees' || route.path.startsWith('/employees/')) return 'employees'
  if (route.path === '/work/resources' || route.path.startsWith('/work/resources/')) return 'resources'
  return 'work'
})
const adminTab = computed(() => adminTabs.find(tab => tab.items.some(item => isAdminItemActive(item.path))) ?? adminTabs[0])
const adminItems = computed(() => adminTab.value.items.filter(item => organization.isAdmin || item.path !== '/admin/roles'))
const activeTab = computed(() => isAdmin.value ? adminTab.value.id : portalTab.value)
const headerTabs = computed(() => isAdmin.value
  ? adminTabs.filter(tab => organization.isAdmin || tab.id === 'organization')
    .map(({ id, name }) => ({ id, name, to: lastAdminPage[id] }))
  : portalTabs.map(({ id, name }) => ({ id, name, to: lastPortalPage[id] })))
const activeResourceType = computed(() => resourceTypeFromQuery(route.query))
const isChat = computed(() => route.path.startsWith('/work/chat'))
const enterAdminLabel = '管理后台'
const returnToPortalLabel = '返回工作门户'

const workspacePath = '/work/workspace'
const isWorkspace = computed(() => route.path === workspacePath)
const workItems = computed(() => [
  { name: '我的助理', to: '/work/assistants', icon: Bot, active: route.path.startsWith('/work/assistants') },
  { name: '工作空间', to: isWorkspace.value ? route.fullPath : workspacePath, icon: FolderOpen, active: isWorkspace.value },
  { name: '自动化任务', to: '/work/automations', icon: Clock, active: route.name === 'personal-automations' },
])

const workbenchIcons: Record<string, typeof LayoutGrid> = {
  'pen-tool': PenTool,
  calculator: Calculator,
  'file-search': FileSearch,
  'list-checks': ListChecks,
  'panels-top-left': PanelsTopLeft,
  package: Package,
  ship: Ship,
}

function isAdminItemActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function updateViewport(event: MediaQueryListEvent) {
  isMobile.value = event.matches
  mobileMenu.value = false
}

onMounted(() => mobileViewport.addEventListener('change', updateViewport))
onUnmounted(() => mobileViewport.removeEventListener('change', updateViewport))

watch(sidebarCollapsed, collapsed => {
  try {
    localStorage.setItem(sidebarStorageKey, String(collapsed))
  } catch {
    // Keep the current preference for this session.
  }
})

watch(() => route.fullPath, async (path, previous) => {
  if (!route.matched.length) return
  mobileMenu.value = false
  if (isAdmin.value) {
    lastAdmin.value = path
    lastAdminPage[adminTab.value.id] = path
  } else {
    lastUse.value = path
    lastPortalPage[portalTab.value] = path
  }
  if (previous?.split('?')[0] !== path.split('?')[0]) {
    await nextTick()
    main.value?.scrollTo(0, 0)
  }
}, { immediate: true })

function switchAccount(id: string) {
  mobileMenu.value = false
  if (id === store.currentUser.id) return
  store.setCurrentUser(id)
  for (const tab of portalTabs) lastPortalPage[tab.id] = tab.home
  for (const tab of adminTabs) lastAdminPage[tab.id] = tab.items[0].path
  lastAdminPage.organization = adminHome
  lastUse.value = lastPortalPage.work
  lastAdmin.value = adminHome
  void router.replace(lastPortalPage.work)
}
</script>

<template>
  <div class="app-shell" :class="{ 'admin-mode': isAdmin }" @keydown.esc="mobileMenu = false">
    <header class="shell-header">
      <button type="button" class="icon-button header-menu" :aria-label="mobileMenu ? '关闭菜单' : '打开菜单'" aria-controls="main-sidebar" :aria-expanded="mobileMenu" @click="mobileMenu = !mobileMenu">
        <component :is="mobileMenu ? X : Menu" :size="19" aria-hidden="true" />
      </button>
      <RouterLink class="brand-link" :to="isAdmin ? adminHome : '/work/chat'" :aria-label="isAdmin ? '管理后台首页' : '工作门户首页'" @click="mobileMenu = false">
        <span class="brand-logo" :class="{ 'has-badge': isAdmin }" aria-hidden="true">
          <span class="brand-mark"><span class="brand-glyph"></span></span>
          <span class="brand-wordmark">AI 工作台</span>
          <span v-if="isAdmin" class="brand-badge">管理</span>
        </span>
      </RouterLink>
      <nav class="header-tabs" :aria-label="isAdmin ? '管理后台区域' : '工作门户区域'">
        <RouterLink v-for="tab in headerTabs" :key="tab.id" :to="tab.to" class="header-tab" :class="{ 'current-area': activeTab === tab.id }" :aria-current-value="activeTab === tab.id ? 'location' : 'false'" @click="mobileMenu = false">
          {{ tab.name }}
        </RouterLink>
      </nav>

      <div class="header-actions">
        <RouterLink v-if="isAdmin" class="mode-action" :to="lastUse" :aria-label="returnToPortalLabel" :title="returnToPortalLabel" @click="mobileMenu = false"><ArrowLeft :size="16" aria-hidden="true" /><span>{{ returnToPortalLabel }}</span></RouterLink>
        <RouterLink v-else-if="organization.canOpenAdmin" class="mode-action" :to="lastAdmin" :aria-label="enterAdminLabel" :title="enterAdminLabel" @click="mobileMenu = false"><Settings2 :size="16" aria-hidden="true" /><span>{{ enterAdminLabel }}</span></RouterLink>
        <el-dropdown trigger="click" placement="bottom-end" class="account-dropdown" @command="switchAccount">
          <button type="button" class="account-button" aria-label="切换演示账号" :title="store.currentUser.name">
            <span class="account-avatar">{{ store.currentUser.initials }}</span>
            <ChevronDown :size="13" class="account-chevron" aria-hidden="true" />
          </button>
          <template #dropdown>
            <el-dropdown-menu class="account-menu">
              <div class="account-menu-title">演示账号</div>
              <el-dropdown-item v-for="user in store.users.filter(member => member.status !== 'disabled')" :key="user.id" :command="user.id">
                <span class="account-avatar small">{{ user.initials }}</span>
                <span class="account-menu-user"><strong>{{ user.name }}</strong><small>{{ user.title }}</small></span>
                <Check v-if="user.id === store.currentUser.id" :size="16" class="account-check" />
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>
    <button v-if="mobileMenu" class="sidebar-scrim" type="button" aria-label="关闭侧栏" @click="mobileMenu = false"></button>

    <aside id="main-sidebar" class="shell-sidebar" :class="{ 'mobile-open': mobileMenu, 'is-compact': isCompact }" aria-label="当前区域菜单">
      <div class="sidebar-scroll">
        <nav v-if="isAdmin" class="sidebar-nav" :aria-label="adminTab.name">
          <RouterLink v-for="item in adminItems" :key="item.path" :to="item.path" class="side-link" :class="{ active: isAdminItemActive(item.path) }" :aria-label="item.name" :title="isCompact ? item.name : undefined" @click="mobileMenu = false">
            <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" /><span>{{ item.name }}</span>
          </RouterLink>
        </nav>
        <nav v-else-if="portalTab === 'resources'" class="sidebar-nav" aria-label="资源类型">
          <RouterLink
            v-for="item in resourceTypeItems" :key="item.label"
            :to="resourceLibraryLocation(route.query, item.type)"
            class="side-link" :class="{ active: route.path === '/work/resources' && activeResourceType === item.type }"
            :aria-current-value="activeResourceType === item.type ? 'page' : 'false'"
            :aria-label="item.label" :title="isCompact ? item.label : undefined" @click="mobileMenu = false"
          >
            <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" /><span>{{ item.label }}</span>
          </RouterLink>
        </nav>
        <template v-else-if="portalTab === 'employees'">
          <EmployeesSidebar :compact="isCompact" @navigate="mobileMenu = false" />
          <EmployeeRecentContacts :compact="isCompact" @navigate="mobileMenu = false" />
        </template>
        <template v-else>
          <section :aria-label="portalTabs[0].name">
            <RouterLink class="new-chat" to="/work/chat" aria-label="新建会话" :title="isCompact ? '新建会话' : undefined" @click="mobileMenu = false">
              <Plus :size="18" aria-hidden="true" /><span>新建会话</span>
            </RouterLink>
            <div class="sidebar-nav">
              <RouterLink v-for="item in workItems" :key="item.name" :to="item.to" custom v-slot="{ href, navigate }">
                <a :href="href" class="side-link" :class="{ active: item.active }" :aria-current="item.active ? 'location' : undefined"
                  :aria-label="item.name" :title="isCompact ? item.name : undefined" @click="mobileMenu = false; navigate($event)">
                  <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" /><span>{{ item.name }}</span>
                </a>
              </RouterLink>
            </div>
            <div v-if="!isCompact || store.visibleWorkbenches.length" class="workbench-section">
              <div class="sidebar-label">工作台</div>
              <nav v-if="store.visibleWorkbenches.length" class="history-nav" aria-label="工作台">
                <RouterLink
                  v-for="workbench in store.visibleWorkbenches"
                  :key="workbench.id"
                  :to="{ name: 'workbench', params: { id: workbench.id } }"
                  class="history-link"
                  exact-active-class="active"
                  :aria-label="workbench.name"
                  :title="workbench.name"
                  @click="mobileMenu = false"
                >
                  <component :is="workbenchIcons[workbench.icon] ?? LayoutGrid" :size="15" :stroke-width="1.8" aria-hidden="true" />
                  <span>{{ workbench.name }}</span>
                </RouterLink>
              </nav>
              <p v-else class="history-empty">暂无可用工作台</p>
            </div>
          </section>

          <SidebarRecentSection label="最近会话" :compact="isCompact">
            <template #icon><MessagesSquare :size="18" :stroke-width="1.8" aria-hidden="true" /></template>
            <template #default="{ close }">
              <nav v-if="store.personalConversations.length" class="history-nav" aria-label="最近会话">
                <RouterLink v-for="chat in store.personalConversations.slice(0, 12)" :key="chat.id" :to="`/work/chat/${chat.id}`" class="history-link" :class="{ active: isChat && route.params.id === chat.id }" :title="chat.title" @click="close(); mobileMenu = false">
                  <MessageSquare :size="15" :stroke-width="1.8" aria-hidden="true" /><span>{{ chat.title }}</span>
                </RouterLink>
              </nav>
              <p v-else class="history-empty">暂无会话</p>
            </template>
          </SidebarRecentSection>
        </template>
      </div>

    </aside>

    <div class="sidebar-divider">
      <button
        type="button"
        class="shell-sidebar-toggle"
        :aria-label="sidebarAction"
        :title="sidebarAction"
        :aria-expanded="!isCompact"
        aria-controls="main-sidebar"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <component :is="isCompact ? ChevronRight : ChevronLeft" :size="9" :stroke-width="1.5" aria-hidden="true" />
      </button>
    </div>

    <main ref="main" class="shell-main">
      <RouterView v-slot="{ Component }"><component :is="Component" :key="store.currentUser.id" /></RouterView>
    </main>
  </div>
</template>
