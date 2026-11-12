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
      { path: '/work/assistants', component: () => import('@/views/AssistantsView.vue') },
      { path: '/work/assistants/manage', name: 'assistant-management', component: () => import('@/views/AdminAssistantsView.vue') },
      { path: '/work/workspace', component: () => import('@/views/WorkspaceView.vue') },
      { path: '/work/resources', component: () => import('@/views/ResourcesView.vue') },
      { path: '/work/resources/manage/:id?', name: 'resource-management', component: () => import('@/views/AdminView.vue') },
      { path: '/work/workbenches/:id?', name: 'workbench', component: () => import('@/views/WorkbenchView.vue') },
      { path: '/employees', name: 'employee-directory', component: () => import('@/views/EmployeeDirectoryView.vue') },
      { path: '/employees/overview', name: 'employee-task-overview', component: () => import('@/views/EmployeeTaskOverviewView.vue') },
      { path: '/employees/tasks', name: 'employee-tasks', component: () => import('@/views/EmployeeTasksView.vue') },
      { path: '/employees/tasks/:taskId', name: 'employee-task', component: () => import('@/views/EmployeeTasksView.vue') },
      { path: '/employees/manage/:id?', name: 'employee-management', component: () => import('@/views/AdminView.vue') },
      { path: '/employees/:id/autonomous-tasks', name: 'employee-autonomous-tasks', component: () => import('@/views/EmployeeAutonomousTasksView.vue') },
      { path: '/employees/:id', name: 'employee-contact', component: () => import('@/views/EmployeesView.vue') },
      { path: '/admin/members/:id?', name: 'admin-members', component: () => import('@/views/AdminMembersView.vue') },
      { path: '/admin/workbenches/:id?', name: 'admin-workbenches', component: adminCatalogView },
      { path: '/admin/employees/:id?', name: 'admin-employees', component: adminCatalogView },
      { path: '/admin/resources/:id?', name: 'admin-resources', component: adminCatalogView },
      { path: '/admin/capabilities/:id?', name: 'admin-capabilities', component: adminCatalogView },
      { path: '/admin/connections/:id?', name: 'admin-connections', component: () => import('@/views/AdminConnectionsView.vue') },
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
    const organization = useOrganizationAdminStore(pinia)
    const admin = store.currentUser.role === 'admin'
    if (to.path.startsWith('/admin')) {
      if (to.name === 'admin-employees' && !admin && store.canManage) {
        return { name: 'employee-management', params: { id: to.params.id }, replace: true }
      }
      if (!admin) return '/work/chat'

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
      const name = to.query.tab === 'responsible' && store.canManage ? 'employee-management' : 'employee-directory'
      return { name, query: { q: to.query.q }, replace: true }
    }
    const developmentType = to.name === 'employee-management' ? '数字员工' : to.name === 'assistant-management' ? '组织助理' : undefined
    if (!admin && (developmentType || to.name === 'resource-management')) {
      const allowed = organization.capabilities.some(item =>
        (developmentType ? item.type === developmentType : !['数字员工', '组织助理', '工作台'].includes(item.type))
        && (organization.canConfigureCapability(item.id) || organization.canPublishCapability(item.id)),
      )
      if (!allowed) return developmentType === '数字员工' ? '/employees' : developmentType === '组织助理' ? '/work/assistants' : '/work/resources'
    }
    return true
  })

  return router
}
