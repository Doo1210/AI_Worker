import type { Pinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { adminCatalogs, adminCapabilityLink, catalogForType } from '@/adminCatalogs'
import { usePlatformStore } from '@/stores/platform'
import { useOrganizationAdminStore } from '@/stores/organizationAdmin'

const adminCatalogView = () => import('@/views/AdminCapabilitiesView.vue')

export function makeRouter(pinia: Pinia) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/work/chat' },
      { path: '/work', redirect: '/work/chat' },
      { path: '/work/chat/:id?', component: () => import('@/views/ConversationView.vue') },
      { path: '/work/assistants', name: 'personal-assistants', component: () => import('@/views/AssistantsView.vue') },
      { path: '/work/assistants/manage', name: 'assistant-management', component: () => import('@/views/AdminAssistantsView.vue') },
      { path: '/work/assistants/:id/configuration', name: 'personal-assistant-configuration', component: () => import('@/views/AssistantConfigurationView.vue') },
      { path: '/work/workspace', component: () => import('@/views/WorkspaceView.vue') },
      { path: '/work/automations', name: 'personal-automations', component: () => import('@/views/PersonalAutomationsView.vue') },
      { path: '/work/resources', component: () => import('@/views/ResourcesView.vue') },
      { path: '/work/resources/manage/:id?', name: 'resource-management', component: () => import('@/views/AdminView.vue') },
      { path: '/work/workbenches/manage/:id', redirect: to => ({ name: 'admin-workbenches', params: { id: to.params.id }, query: { tab: 'configuration' } }) },
      { path: '/work/workbenches/:id?', name: 'workbench', component: () => import('@/views/WorkbenchView.vue') },
      { path: '/employees', name: 'employee-directory', component: () => import('@/views/EmployeeDirectoryView.vue') },
      { path: '/employees/overview', name: 'employee-task-overview', component: () => import('@/views/EmployeeTaskOverviewView.vue') },
      { path: '/employees/tasks', name: 'employee-tasks', component: () => import('@/views/EmployeeTasksView.vue') },
      { path: '/employees/tasks/:taskId', name: 'employee-task', component: () => import('@/views/EmployeeTasksView.vue') },
      { path: '/employees/scenario-tasks/:taskId', name: 'scenario-task', component: () => import('@/views/ScenarioTaskView.vue') },
      { path: '/employees/manage/:id?', name: 'employee-management', component: () => import('@/views/AdminView.vue') },
      { path: '/employees/:id/autonomous-tasks', name: 'employee-autonomous-tasks', component: () => import('@/views/EmployeeAutonomousTasksView.vue') },
      { path: '/employees/:id', name: 'employee-contact', component: () => import('@/views/EmployeesView.vue') },
      { path: '/admin/plugins/:id?', name: 'admin-plugins', component: () => import('@/views/AdminPluginsView.vue') },
      { path: '/admin/activity', name: 'admin-activity', component: () => import('@/views/AdminActivityView.vue') },
      { path: '/admin/usage', name: 'admin-usage', component: () => import('@/views/AdminUsageView.vue') },
      { path: '/admin/overview', name: 'admin-overview', component: () => import('@/views/AdminOverviewView.vue') },
      { path: '/admin/members/:id?', name: 'admin-members', component: () => import('@/views/AdminMembersView.vue') },
      { path: '/admin/departments', name: 'admin-departments', redirect: to => ({ name: 'admin-members', query: to.query }) },
      { path: '/admin/roles/:id?', name: 'admin-roles', component: () => import('@/views/AdminRolesView.vue') },
      { path: '/admin/workbenches/:id?', name: 'admin-workbenches', component: adminCatalogView },
      { path: '/admin/employees/:id?', name: 'admin-employees', component: adminCatalogView },
      { path: '/admin/resources/:id?', name: 'admin-resources', component: adminCatalogView },
      { path: '/admin/capabilities/:id?', name: 'admin-capabilities', component: adminCatalogView },
      { path: '/admin/connections/:id?', name: 'admin-connections', component: () => import('@/views/AdminConnectionsView.vue') },
      { path: '/admin/runs', name: 'admin-scenario-runs', component: () => import('@/views/AdminScenarioRunsView.vue') },
      { path: '/admin/changes', name: 'admin-changes', component: () => import('@/views/AdminChangesView.vue') },
      { path: '/admin/:section?/:id?', name: 'admin-legacy', component: () => import('@/views/AdminMembersView.vue') },
      { path: '/:pathMatch(.*)*', redirect: '/work/chat' },
    ],
  })

  router.beforeEach(to => {
    if ((to.name === 'employee-directory' || to.name === 'employee-contact') && to.query.tasks === '1') {
      if (typeof to.query.task === 'string' && to.query.task) {
        return { name: 'employee-task', params: { taskId: to.query.task }, replace: true }
      }
      return { name: 'employee-tasks', replace: true }
    }

    if (to.name === 'workbench' && !to.params.id) {
      const first = usePlatformStore(pinia).visibleWorkbenches[0]
      return first ? { name: 'workbench', params: { id: first.id }, replace: true } : true
    }

    const store = usePlatformStore(pinia)
    if (to.name === 'personal-assistants' && 'configure' in to.query) {
      const { configure, ...query } = to.query
      if (typeof configure === 'string' && store.myAssistants.some(assistant => assistant.id === configure)) {
        return {
          name: 'personal-assistant-configuration', params: { id: configure }, query: { ...query, scope: 'own' }, replace: true,
        }
      }
      return { name: 'personal-assistants', query, replace: true }
    }
    const organization = useOrganizationAdminStore(pinia)
    const admin = store.currentUser.role === 'admin'
    if (to.path === '/work/workspace' && to.query.scope !== 'shared') {
      const { folder, file, ...other } = to.query
      if (folder !== undefined && !store.myFolders.some(item => item.id === folder)) {
        return { path: to.path, query: other, replace: true }
      }
      if (file !== undefined && !store.myFiles.some(item => item.id === file && item.folderId === folder)) {
        return { path: to.path, query: { ...other, folder }, replace: true }
      }
    }
    if (to.path.startsWith('/admin')) {
      if (to.name === 'admin-employees' && !admin && !organization.canViewCapabilities && organization.myEmployeeMaintenance.size) {
        return { name: 'employee-management', params: { id: to.params.id }, replace: true }
      }
      if (!admin) {
        if (organization.canVisitAdmin(String(to.name)) && !['admin-members', 'admin-departments'].includes(String(to.name))) return true
        if (!organization.canOpenAdmin) return '/work/chat'
        if (to.name === 'admin-departments' && organization.canVisitAdmin('admin-departments')) return true
        if (to.name === 'admin-members' && organization.canVisitAdmin('admin-members') && (!to.params.id || organization.visibleMembers.some(member => member.id === to.params.id))) return true
        return { path: organization.adminHome, replace: true }
      }

      if (to.path === '/admin') return { name: 'admin-overview', replace: true }
      if (to.name === 'admin-legacy' && to.params.section !== 'assistants') {
        return { name: 'admin-members', replace: true }
      }
      if (typeof to.name === 'string' && (to.name in adminCatalogs || ['admin-capabilities', 'admin-legacy'].includes(to.name))) {
        const item = organization.capabilities.find(capability => capability.id === to.params.id)
        if (item && catalogForType(item.type) !== to.name) {
          return { ...adminCapabilityLink(item), replace: true }
        }
      }
      if (to.name === 'admin-capabilities' || to.name === 'admin-legacy') {
        const type = to.name === 'admin-legacy' ? '组织助理' : to.query.type
        return {
          name: typeof type === 'string' && type ? catalogForType(type) : 'admin-workbenches',
          params: { id: to.params.id },
          query: { ...to.query, type }, replace: true,
        }
      }
      return true
    }
    if (to.name === 'employee-directory' && 'tab' in to.query) {
      const name = to.query.tab === 'responsible' && (admin || organization.myEmployeeMaintenance.size)
        ? 'employee-management' : 'employee-directory'
      return { name, query: { q: to.query.q }, replace: true }
    }
    if (to.name === 'employee-management') {
      const id = typeof to.params.id === 'string' ? to.params.id : ''
      const maintenance = organization.myEmployeeMaintenance
      if (id && admin && to.query.from === 'admin') return true
      if (id ? maintenance.has(id) : admin || maintenance.size > 0) return true
      return admin || maintenance.size
        ? { name: 'employee-management', params: { id: '' }, replace: true }
        : { name: 'employee-directory', replace: true }
    }
    const developmentType = to.name === 'assistant-management' ? '组织助理' : undefined
    if (!admin && (developmentType || to.name === 'resource-management')) {
      const allowed = organization.capabilities.some(item =>
        (developmentType ? item.type === developmentType : !['AI 员工', '组织助理', '工作台'].includes(item.type))
        && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id)),
      )
      if (!allowed) return developmentType ? '/work/assistants' : '/work/resources'
    }
    return true
  })

  return router
}
