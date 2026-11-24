export interface OrganizationRole {
  id: string
  name: string
  description: string
  kind: 'business' | 'management'
  systemRole?: 'admin' | 'department-admin' | 'member'
  builtin?: boolean
  enabled: boolean
  capabilityIds: string[]
  version: number
}

export interface RoleAssignment {
  memberId: string
  roleId: string
  capabilityIds: string[]
  version: number
}

export function makeOrganizationRoles(): OrganizationRole[] {
  return [
    { id: 'role-admin', name: '组织管理员', description: '管理全组织成员、能力与资源、系统接入及运行。', kind: 'management', systemRole: 'admin', builtin: true, enabled: true, capabilityIds: [], version: 1 },
    { id: 'role-department-admin', name: '部门管理员', description: '管理指定部门的普通成员，在委派范围内分配能力。', kind: 'management', systemRole: 'department-admin', builtin: true, enabled: true, capabilityIds: [], version: 1 },
    { id: 'role-member', name: '普通成员', description: '使用工作门户；工作台、助理和资源按使用授权开放。', kind: 'management', systemRole: 'member', builtin: true, enabled: true, capabilityIds: [], version: 1 },
    { id: 'role-designer', name: '设计工程师', description: '设计图纸处理、资料核对与设计交付协作。', kind: 'business', enabled: true, capabilityIds: ['workbench-design', 'assistant-org-et-design', 'knowledge-design', 'employee-design'], version: 1 },
    { id: 'role-office', name: '通用办公', description: '使用组织文档助理、工作模型和文档总结能力。', kind: 'business', enabled: true, capabilityIds: ['assistant-org-documents', 'model-deepseek', 'skill-summary'], version: 1 },
  ]
}
