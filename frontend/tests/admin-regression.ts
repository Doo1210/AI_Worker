import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { usePlatformStore } from '@/stores/platform'
import { capabilityResponsibilities, useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { useAdminRuntimeStore } from '@/stores/adminRuntime'
import { useAdminOverviewStore } from '@/stores/adminOverview'
import { capabilityNodes, dependencyIssues } from '@/adminDependencies'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
setActivePinia(createPinia())
const platform = usePlatformStore()
const admin = useOrganizationAdminStore()
const runtime = useAdminRuntimeStore()
const overview = useAdminOverviewStore()
const modelConnection = 'connection-model-deepseek'
const get = (id: string) => admin.capabilities.find(item => item.id === id)!

assert(admin.testConnection(modelConnection, true))
assert(!get('assistant-org-documents').ready, 'A failed model connection must invalidate its assistant dependents')
assert(platform.visibleResources.find(item => item.id === 'model-deepseek')?.status === '未连接')
const issues = overview.snapshot('7d', '').details.issues
assert(issues.some(item => item.id === modelConnection && item.related?.some(capability => capability.id === 'assistant-org-documents')))
assert(!issues.some(item => item.id === 'assistant-org-documents'), 'Affected assistants must not be counted again as independent incidents')
assert(admin.testConnection(modelConnection))
assert(get('assistant-org-documents').ready, 'Restoring the same connection must clear transitive dependency issues')

assert(admin.checkPlugin('plugin-documents', true))
assert(!get('skill-summary').ready && !get('assistant-org-documents').ready, 'Plugin failures must propagate through resource dependencies')
assert(admin.checkPlugin('plugin-documents'))
assert(admin.setPluginEnabled('plugin-workbenches', false))
assert(!platform.visibleWorkbenches.some(item => item.id === 'workbench-design'))
assert(admin.setPluginEnabled('plugin-workbenches', true))
assert(!get('workbench-design').ready, 'Re-enabling a plugin requires a load check')
assert(admin.checkPlugin('plugin-workbenches'))

const connection = admin.connections.find(item => item.id === modelConnection)!
const base = { name: connection.name, type: connection.type, endpoint: connection.endpoint }
assert(admin.saveConnection({ ...base, credentialMode: 'organization' }, modelConnection))
assert(admin.testConnection(modelConnection) && connection.status === '异常', 'Missing shared credentials cannot pass detection')
const fake = 'FAKE-ONLY-DO-NOT-PERSIST'
assert(admin.saveConnection({ ...base, credentialMode: 'organization', credentialValue: fake }, modelConnection))
await nextTick()
assert(!JSON.stringify(connection).includes(fake) && ![...storage.values()].some(value => value.includes(fake)), 'Credential input must never be persisted')
const reference = connection.credentialRef
assert(admin.saveConnection({ ...base, credentialMode: 'organization', credentialValue: '' }, modelConnection))
assert.equal(connection.credentialRef, reference, 'An empty credential field must preserve the saved reference')
assert(admin.saveConnection({ ...base, credentialMode: 'member', credentialMemberId: 'lin', credentialValue: 'fake-member' }, modelConnection))
assert(admin.testConnection(modelConnection))
assert(!admin.capabilityIssues('assistant-org-documents', 'lin').length)
assert(admin.capabilityIssues('assistant-org-documents', 'zhou').some(item => item.includes('本人凭据')), 'One member credential cannot authorize a different member')
assert(admin.saveConnection({ ...base, credentialMode: 'environment' }, modelConnection))
assert(admin.testConnection(modelConnection))

const options = { managementDepartmentIds: [], assignableCapabilityIds: [] }
assert(admin.assignRoles(['zhou'], ['role-office'], options))
const before = admin.directCapabilityIds('zhou')
assert(admin.setMembersCapabilities([{ memberId: 'zhou', capabilityIds: before.filter(id => id !== 'skill-summary') }]))
assert(get('skill-summary').memberIds.includes('zhou'), 'Revoking a direct grant must preserve a business-role grant')
assert(admin.previewRoleGrants('zhou', ['role-member'], []).removed.includes('文档总结'))
const grantsBeforeInvalidSave = [...get('skill-summary').memberIds]
assert(!admin.setCapabilityPersonnel('skill-summary', { memberIds: [], maintainerId: 'missing-member', configuratorIds: [], publisherIds: [], includePair: false }))
assert.deepEqual(get('skill-summary').memberIds, grantsBeforeInvalidSave, 'Invalid personnel settings must not partially revoke existing grants')
assert(admin.setCapabilityPersonnel('skill-summary', { memberIds: platform.users.filter(member => admin.directCapabilityIds(member.id).includes('skill-summary')).map(member => member.id), maintainerId: 'lin', configuratorIds: [], publisherIds: ['lin'], includePair: false }))
assert(get('skill-summary').memberIds.includes('zhou'), 'Combined personnel saves must preserve business-role grants')
assert(admin.setRoleEnabled('role-office', false))
assert(!get('skill-summary').memberIds.includes('zhou'))
assert(admin.setRoleEnabled('role-office', true))
assert(get('skill-summary').memberIds.includes('zhou'))

assert(admin.assignRoles(['zhou'], ['role-operator'], options))
platform.setCurrentUser('zhou')
assert(admin.canViewRuns && !admin.canManagePlatform && !admin.isAdmin)
assert(admin.canVisitAdmin('admin-activity') && !admin.canVisitAdmin('admin-roles') && !admin.canVisitAdmin('admin-connections'))
assert(!admin.testConnection(modelConnection) && !admin.setCapabilityEnabled('assistant-org-documents', false))
assert(!admin.saveRole({ name: 'unauthorized', description: '', kind: 'business', capabilityIds: [] }))
platform.setCurrentUser('lin')
assert(admin.assignRoles(['zhou'], ['role-platform-operator'], options))
platform.setCurrentUser('zhou')
assert(admin.canManagePlatform && !admin.canViewRuns)
assert(admin.canVisitAdmin('admin-plugins') && !admin.canVisitAdmin('admin-members'))
assert(!admin.setMembersCapabilities([{ memberId: 'song', capabilityIds: [] }]))
assert(!admin.visibleChanges.some(item => ['member', 'role'].includes(item.targetType ?? '')))
platform.setCurrentUser('lin')

// Persisted member maintenance fields must not grant workbench administration.
const workbench = platform.workbenches.find(item => item.id === 'workbench-design')!
workbench.maintainerId = 'zhou'
workbench.publisherIds = ['zhou']
assert.equal(get(workbench.id).maintainerId, undefined)
assert.deepEqual(get(workbench.id).publisherIds, [])
assert.equal(capabilityResponsibilities(get(workbench.id), 'zhou'), '')
assert(!admin.setCapabilityMaintainer(workbench.id, 'zhou'))
assert(!admin.setCapabilityPublishers(workbench.id, ['zhou']))
assert(!admin.setCapabilityPersonnel(workbench.id, { memberIds: [], maintainerId: 'zhou', configuratorIds: [], publisherIds: ['zhou'], includePair: false }))
const storedName = workbench.name
const storedVersions = [...get(workbench.id).availableVersions]
platform.setCurrentUser('zhou')
assert(!admin.canConfigureCapability(workbench.id) && !admin.canPublishCapability(workbench.id))
assert(!admin.saveWorkbenchConfiguration(workbench.id, { name: 'unauthorized', description: '', dependencyIds: [] }))
assert(!admin.publishCapability(workbench.id))
assert.equal(workbench.name, storedName)
assert.deepEqual(get(workbench.id).availableVersions, storedVersions)
platform.setCurrentUser('lin')
assert(admin.assignRoles(['zhou'], ['role-member'], options))
platform.setCurrentUser('zhou')
assert(!admin.canOpenAdmin && !admin.canConfigureCapability(workbench.id) && !admin.canPublishCapability(workbench.id))
platform.setCurrentUser('lin')

assert(admin.canConfigureCapability(workbench.id) && !admin.canPublishCapability(workbench.id))
assert(admin.saveWorkbenchConfiguration(workbench.id, { name: '已保存的新名称', description: '立即生效的用途说明', dependencyIds: ['model-deepseek'] }))
assert.equal(get(workbench.id).name, '已保存的新名称', 'Saving workbench settings must take effect immediately')
assert.equal(platform.visibleWorkbenches.find(item => item.id === workbench.id)?.description, '立即生效的用途说明')
assert.deepEqual(capabilityNodes(platform).find(item => item.id === workbench.id)?.dependencies, ['model-deepseek'])
assert.deepEqual(get(workbench.id).availableVersions, [], 'Workbenches must not have configuration versions')
assert(!admin.publishCapability(workbench.id) && !admin.setCapabilityVersion(workbench.id, '1.0.0'))
assert(admin.testConnection(modelConnection, true))
assert(!get(workbench.id).ready, 'Saved dependencies must immediately affect workbench readiness')
assert(!admin.saveWorkbenchConfiguration(workbench.id, { name: '失败不应覆盖', description: '失败不应覆盖', dependencyIds: ['model-deepseek', 'mcp-files'] }))
assert.equal(workbench.name, '已保存的新名称', 'Invalid dependency changes must not partially update settings')
assert.deepEqual(workbench.dependencyIds, ['model-deepseek'])
assert(admin.testConnection(modelConnection))
assert(get(workbench.id).ready)
assert(admin.setCapabilityEnabled(workbench.id, false) && admin.setCapabilityEnabled(workbench.id, true))
assert.equal(workbench.activeVersion, undefined, 'Enabling a workbench must not create a configuration version')
const plugin = admin.plugins.find(item => item.id === 'plugin-workbenches')!
assert(admin.setPluginVersion(plugin.id, '1.1.0'))
assert.equal(workbench.name, '已保存的新名称', 'Plugin upgrades must preserve administrator settings')
assert(admin.checkPlugin(plugin.id))
assert(admin.setPluginVersion(plugin.id, '1.0.0') && admin.checkPlugin(plugin.id))

const snapshot = overview.snapshot('7d', '')
const scoped = runtime.inScope({ period: '7d' })
assert.equal(Number(snapshot.metrics.find(item => item.id === 'assistant')!.value.replaceAll(',', '')), scoped.filter(item => item.kind === 'assistant').length)
assert.equal(Number(snapshot.metrics.find(item => item.id === 'workbench')!.value.replaceAll(',', '')), scoped.filter(item => item.kind === 'workbench').length)
assert.equal(snapshot.runs.length, scoped.length, 'Overview and run details must use the same ledger')
assert(dependencyIssues('a', [{ id: 'a', name: 'A', enabled: true, dependencies: ['b'] }, { id: 'b', name: 'B', enabled: true, dependencies: ['a'] }], [], []).some(item => item.includes('循环依赖')))
assert(capabilityNodes(platform).length > 0)
const resourceName = get('skill-summary').name
assert(admin.prepareCapabilityEdit('skill-summary'))
platform.resources.find(item => item.id === 'skill-summary')!.name = '新版文档总结'
assert.equal(get('skill-summary').name, resourceName)
assert(admin.publishCapability('skill-summary'))
assert(admin.setCapabilityVersion('skill-summary', get('skill-summary').availableVersions.at(-1)!))
assert.equal(platform.visibleResources.find(item => item.id === 'skill-summary')?.name, '新版文档总结')
await nextTick()
const legacy = JSON.parse(storage.get('ai-worker-platform-prototype-v2')!)
const legacyWorkbench = legacy.workbenches.find((item: { id: string }) => item.id === workbench.id)
Object.assign(legacyWorkbench, {
  name: '旧的未生效草稿', description: '旧的未生效说明', activeVersion: '1.1.0', availableVersions: ['1.0.0', '1.1.0', '1.2.0'],
  versionSnapshots: { '1.1.0': { name: '沿用已生效配置', description: '保留已生效说明', instructions: '', resourceIds: ['mcp-files'] } },
  releases: [{ version: '1.2.0', at: '2026-11-25T00:00:00Z', actor: 'test', notes: '尚未启用' }],
})
delete legacy.organizationPlugins
legacy.organizationRoles = legacy.organizationRoles.filter((item: { id: string }) => !['role-operator', 'role-platform-operator'].includes(item.id))
storage.set('ai-worker-platform-prototype-v2', JSON.stringify(legacy))
setActivePinia(createPinia())
const migrated = usePlatformStore()
assert(migrated.organizationPlugins.length > 0)
assert(migrated.organizationRoles.some(item => item.id === 'role-operator'))
assert.equal(migrated.resources.find(item => item.id === 'skill-summary')?.name, '新版文档总结', 'Migration must preserve saved user edits')
const migratedWorkbench = migrated.workbenches.find(item => item.id === workbench.id)!
assert.equal(migratedWorkbench.name, '沿用已生效配置', 'Migration must retain the active settings instead of activating a legacy draft')
assert.equal(migratedWorkbench.description, '保留已生效说明')
assert.deepEqual(migratedWorkbench.dependencyIds, ['mcp-files'])
assert(['activeVersion', 'availableVersions', 'versionSnapshots', 'releases'].every(key => !(key in migratedWorkbench)))
assert(useOrganizationAdminStore().saveWorkbenchConfiguration(workbench.id, { name: '迁移后直接保存', description: '刷新后保留的说明', dependencyIds: [] }))
await nextTick()
setActivePinia(createPinia())
const reloadedWorkbench = usePlatformStore().workbenches.find(item => item.id === workbench.id)!
assert.equal(reloadedWorkbench.name, '迁移后直接保存')
assert.equal(reloadedWorkbench.description, '刷新后保留的说明', 'Reloading must preserve the administrator description')
console.log('Admin regression checks passed: dependency recovery, plugin lifecycle, credential isolation, role boundaries, immediate workbench settings, assistant/resource versions, saved-data migration, and unified usage.')
