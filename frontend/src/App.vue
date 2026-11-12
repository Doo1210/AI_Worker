<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Bot, Boxes, BriefcaseBusiness, Calculator, Check, ChevronDown, ChevronLeft, ChevronRight,
  FolderOpen, History, LayoutGrid, LibraryBig, MessageSquare, Package, PenTool, Plug, Plus, Settings2, Ship, UsersRound, X,
} from 'lucide-vue-next'
import { FileSearch, ListChecks, MessagesSquare, PanelsTopLeft } from 'lucide-vue-next'
import EmployeesSidebar from '@/components/EmployeesSidebar.vue'
import EmployeeRecentContacts from '@/components/EmployeeRecentContacts.vue'
import SidebarRecentSection from '@/components/SidebarRecentSection.vue'
import { adminCatalogs } from '@/adminCatalogs'
import logo from '@/assets/ai-workbench-logo.png'
import { usePlatformStore } from '@/stores/platform'

const store = usePlatformStore()
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
  { id: 'work', name: '工作区', home: '/work/chat', icon: BriefcaseBusiness },
  { id: 'employees', name: '数字员工', home: '/employees', icon: UsersRound },
] as const
type PortalTab = (typeof portalTabs)[number]['id']
const portalTab = ref<PortalTab>('work')
const lastPortalPage: Record<PortalTab, string> = { work: portalTabs[0].home, employees: portalTabs[1].home }
const lastUse = ref(lastPortalPage.work)
const lastAdmin = ref('/admin/members')
const isAdmin = computed(() => route.path.startsWith('/admin'))
const isEmployeeTab = computed(() => portalTab.value === 'employees')
const isChat = computed(() => route.path.startsWith('/work/chat'))
const enterAdminLabel = '进入管理后台'
const returnToPortalLabel = '返回工作门户'

const workItems = [
  { name: '我的助理', path: '/work/assistants', icon: Bot },
  { name: '资源库', path: '/work/resources', icon: LibraryBig },
  { name: '工作空间', path: '/work/workspace', icon: FolderOpen },
]

const workbenchIcons: Record<string, typeof LayoutGrid> = {
  'pen-tool': PenTool,
  calculator: Calculator,
  'file-search': FileSearch,
  'list-checks': ListChecks,
  'panels-top-left': PanelsTopLeft,
  package: Package,
  ship: Ship,
}

const adminItems = [
  { name: '组织与成员', path: '/admin/members', icon: UsersRound },
  { name: adminCatalogs['admin-workbenches'].title, path: '/admin/workbenches', icon: LayoutGrid },
  { name: adminCatalogs['admin-employees'].title, path: '/admin/employees', icon: Bot },
  { name: adminCatalogs['admin-resources'].title, path: '/admin/resources', icon: Boxes },
  { name: '系统接入', path: '/admin/connections', icon: Plug },
  { name: '变更记录', path: '/admin/changes', icon: History },
]

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
  if (isAdmin.value) {
    lastAdmin.value = path
    mobileMenu.value = false
  } else {
    lastUse.value = path
    portalTab.value = route.path.startsWith('/employees') ? 'employees' : 'work'
    lastPortalPage[portalTab.value] = path
  }
  if (previous?.split('?')[0] !== path.split('?')[0]) {
    await nextTick()
    main.value?.scrollTo(0, 0)
  }
}, { immediate: true })

function switchPortalTab(tab: PortalTab) {
  void router.push(lastPortalPage[tab])
}

function switchAccount(id: string) {
  mobileMenu.value = false
  if (id === store.currentUser.id) return
  store.setCurrentUser(id)
  for (const tab of portalTabs) lastPortalPage[tab.id] = tab.home
  portalTab.value = 'work'
  lastUse.value = lastPortalPage.work
  lastAdmin.value = '/admin/members'
  void router.replace(lastPortalPage.work)
}
</script>

<template>
  <div class="app-shell" @keydown.esc="mobileMenu = false">
    <div class="mobile-rail">
      <button type="button" class="rail-button" aria-label="打开导航" aria-controls="main-sidebar" :aria-expanded="mobileMenu" @click="mobileMenu = !mobileMenu">
        <span class="brand-art">
          <span class="brand-image"><img :src="logo" width="100" height="26" alt="" /></span>
          <span v-if="isAdmin" class="brand-tag" aria-hidden="true">管理</span>
        </span>
      </button>
    </div>
    <button v-if="mobileMenu" class="sidebar-scrim" type="button" aria-label="收起侧栏" @click="mobileMenu = false"></button>

    <aside id="main-sidebar" class="shell-sidebar" :class="{ 'mobile-open': mobileMenu, 'is-compact': isCompact }" aria-label="页面导航">
      <div class="sidebar-top">
        <div class="sidebar-brand-row">
          <RouterLink
            class="brand-link"
            :to="isAdmin ? '/admin/members' : '/work/chat'"
            :aria-label="isAdmin ? '管理后台首页' : '工作门户首页'"
            @click="mobileMenu = false"
          >
            <span class="brand-art">
              <span class="brand-image"><img :src="logo" width="100" height="26" alt="" /></span>
              <span v-if="isAdmin" class="brand-tag" aria-hidden="true">管理</span>
            </span>
          </RouterLink>
          <button type="button" class="icon-button sidebar-close" aria-label="关闭导航" @click="mobileMenu = false"><X :size="18" /></button>
        </div>
        <div v-if="!isAdmin" class="portal-tabs" role="group" aria-label="工作门户视图">
          <button
            v-for="tab in portalTabs"
            :key="tab.id"
            type="button"
            class="portal-tab"
            :aria-pressed="portalTab === tab.id"
            :aria-label="tab.name"
            :title="isCompact ? tab.name : undefined"
            @click="switchPortalTab(tab.id)"
          >
            <component :is="tab.icon" v-if="isCompact" :size="17" :stroke-width="1.8" aria-hidden="true" />
            <span v-else>{{ tab.name }}</span>
          </button>
        </div>
      </div>

      <div class="sidebar-scroll">
        <nav v-if="isAdmin" class="sidebar-nav" aria-label="管理后台">
          <RouterLink v-for="item in adminItems" :key="item.path" :to="item.path" class="side-link" :class="{ active: route.path.startsWith(item.path) }" :aria-label="item.name" :title="isCompact ? item.name : undefined" @click="mobileMenu = false">
            <component :is="item.icon" :size="18" :stroke-width="1.8" /><span>{{ item.name }}</span>
          </RouterLink>
        </nav>
        <template v-else>
          <section v-if="!isEmployeeTab" :aria-label="portalTabs[0].name">
            <RouterLink class="new-chat" to="/work/chat" aria-label="新建会话" :title="isCompact ? '新建会话' : undefined" @click="mobileMenu = false">
              <Plus :size="18" aria-hidden="true" /><span>新建会话</span>
            </RouterLink>
            <div class="sidebar-nav">
              <RouterLink v-for="item in workItems" :key="item.path" :to="item.path" class="side-link" :class="{ active: route.path.startsWith(item.path) }" :aria-label="item.name" :title="isCompact ? item.name : undefined" @click="mobileMenu = false">
                <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" /><span>{{ item.name }}</span>
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

          <EmployeesSidebar v-else :compact="isCompact" @navigate="mobileMenu = false" />

          <EmployeeRecentContacts v-if="isEmployeeTab" :compact="isCompact" @navigate="mobileMenu = false" />
          <SidebarRecentSection v-else label="最近会话" :compact="isCompact">
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

      <div class="sidebar-footer">
        <RouterLink v-if="isAdmin" class="mode-action" :to="lastUse" :aria-label="returnToPortalLabel" :title="isCompact ? returnToPortalLabel : undefined" @click="mobileMenu = false"><ArrowLeft :size="16" /><span>{{ returnToPortalLabel }}</span></RouterLink>
        <RouterLink v-else-if="store.currentUser.role === 'admin'" class="mode-action" :to="lastAdmin" :aria-label="enterAdminLabel" :title="isCompact ? enterAdminLabel : undefined" @click="mobileMenu = false"><Settings2 :size="16" /><span>{{ enterAdminLabel }}</span></RouterLink>
        <el-dropdown trigger="click" placement="top-start" class="account-dropdown" @command="switchAccount">
          <button type="button" class="account-button" aria-label="切换演示账号" :title="isCompact ? store.currentUser.name : undefined">
            <span class="account-avatar">{{ store.currentUser.initials }}</span>
            <span class="account-menu-user"><strong>{{ store.currentUser.name }}</strong><small>{{ store.currentUser.title }}</small></span>
            <ChevronDown :size="14" class="account-chevron" />
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
