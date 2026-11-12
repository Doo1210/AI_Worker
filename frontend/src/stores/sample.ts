import type { Assistant, Conversation, Employee, EmployeeThread, Message, PlatformState, Resource, Task, Workbench, WorkspaceFile, WorkspaceFolder } from './platform'
import { makeScenarioWorkbenches } from './workbenchScenarios'
import { makeAdminChanges, makeAdminConnections } from './organizationAdminData'

const date = (day: number, time = '09:30:00') => `2026-11-${String(day).padStart(2, '0')}T${time}+08:00`
const memberIds = ['lin', 'zhou', 'song']
export const ET_DESIGN_WORKBENCH_ID = 'workbench-design'
export const ET_DESIGN_ASSISTANT_ID = 'assistant-org-et-design'
export const ET_DESIGN_DESCRIPTION = '查看 CAD 图纸、转换格式，并针对当前图纸或框选范围提问。'

export function makeSampleEtDesignAssistant(): Assistant {
  return {
    id: ET_DESIGN_ASSISTANT_ID, userId: 'org', scope: 'organization', allowedUserIds: ['lin', 'zhou'],
    name: 'ET 设计助理', description: '协助核对设计图纸、整理评审意见和交付检查项。',
    instructions: '结合成员提供的图纸资料和已授权的设计交付规范，列出核对结果与待确认事项。',
    resourceIds: ['knowledge-design', 'model-deepseek'], maintainerId: 'lin',
  }
}

export function makeSampleSharedAssistants(): Assistant[] {
  return [
    { id: 'assistant-customer-writing', userId: 'zhou', scope: 'personal', allowedUserIds: ['lin'], name: '客户沟通助理', description: '起草客户回复和服务跟进说明。', instructions: '用简明措辞说明当前进展、下一步和需要客户补充的信息。', resourceIds: ['knowledge-writing', 'model-deepseek'] },
    { id: 'assistant-shared-handover', userId: 'lin', scope: 'personal', allowedUserIds: ['zhou'], name: '交付准备助理', description: '整理交付材料并生成交接清单。', instructions: '核对交付对象、材料版本和需要确认的事项，整理成清单。', resourceIds: ['knowledge-design', 'model-deepseek'] },
    { id: 'assistant-org-documents', userId: 'org', scope: 'organization', allowedUserIds: ['lin', 'zhou'], name: '文档整理助理', description: '整理工作资料，提炼结论和后续事项。', instructions: '优先使用会话引用及当前成员获准使用的文档资源。', resourceIds: ['model-deepseek', 'skill-summary', 'mcp-files'] },
  ]
}

function message(id: string, role: Message['role'], text: string, extra: Partial<Message> = {}): Message {
  return { id, role, text, createdAt: date(11), ...extra }
}

const report = '本周进展\n• 已完成客户访谈与需求梳理。\n• 已整理设计评审意见，待补充交付检查项。\n\n下周安排\n1. 复核各项需求的优先级。\n2. 跟进两项待确认的交付事项。'

export function makeSampleState(): PlatformState {
  const resources: Resource[] = [
    { id: 'model-deepseek', name: 'DeepSeek 工作模型', type: '模型', description: '组织提供的通用对话与分析模型配置。', scope: 'organization', ownerId: 'org', allowedUserIds: [...memberIds], status: '可用' },
    { id: 'skill-summary', name: '文档总结', type: '技能', description: '提取关键结论、待办事项和需要补充的信息。', scope: 'organization', ownerId: 'org', allowedUserIds: [...memberIds], status: '可用' },
    { id: 'mcp-files', name: '企业文档服务', type: 'MCP', description: '检索授权范围内的企业文档与制度。', scope: 'organization', ownerId: 'org', allowedUserIds: ['lin', 'song'], status: '可用' },
    { id: 'knowledge-design', name: '设计交付规范', type: '知识', description: '图纸命名、评审、归档与交付检查清单。', scope: 'organization', ownerId: 'org', allowedUserIds: ['lin', 'zhou'], status: '可用' },
    { id: 'tool-sheet', name: '表格分析', type: '工具', description: '读取表格并汇总指标、异常与变化。', scope: 'organization', ownerId: 'org', allowedUserIds: [...memberIds], status: '可用' },
    { id: 'skill-weekly', name: '周报撰写', type: '技能', description: '按进展、风险和下周计划组织周报。', scope: 'personal', ownerId: 'lin', allowedUserIds: [], status: '可用' },
    { id: 'knowledge-writing', name: '业务邮件范例', type: '知识', description: '周可欣共享的邮件措辞和服务沟通示例。', scope: 'shared', ownerId: 'zhou', allowedUserIds: ['lin'], status: '可用' },
    { id: 'mcp-local', name: '个人资料连接', type: 'MCP', description: '待完善的个人文档连接配置。', scope: 'personal', ownerId: 'lin', allowedUserIds: [], status: '未连接' },
  ]

  const workspaceFolders: WorkspaceFolder[] = [
    { id: 'folder-meetings', userId: 'lin', name: '会议纪要', updatedAt: date(11) },
    { id: 'folder-service', userId: 'lin', name: '售后资料', updatedAt: date(9) },
    { id: 'folder-delivery', userId: 'lin', name: '设计交付', updatedAt: date(8) },
    { id: 'folder-review', userId: 'lin', name: '评审资料', updatedAt: date(8), parentId: 'folder-delivery' },
  ]

  const files: WorkspaceFile[] = [
    { id: 'file-meeting', userId: 'lin', name: '11 月项目例会纪要.md', type: 'text', size: 1384, content: '项目例会 · 11 月 11 日\n\n一、进展\n本周完成了业务流程初步梳理和交付材料清点。\n\n二、后续事项\n• 设计组补充评审清单。\n• 售后组整理近一周工单，并标记高频问题。', updatedAt: date(11), source: 'sample', folderId: 'folder-meetings' },
    { id: 'file-weekly', userId: 'lin', name: '产品组工作周报.md', type: 'text', size: 2048, content: report, updatedAt: date(10, '16:40:00'), source: 'assistant' },
    { id: 'file-customer', userId: 'lin', name: '售后工单统计.csv', type: 'sheet', size: 514, content: '问题类型,已受理,已完成\n设备使用,12,10\n备件更换,8,6\n上门服务,5,4\n账户问题,6,6', updatedAt: date(9), source: 'sample', folderId: 'folder-service' },
    { id: 'file-checklist', userId: 'lin', name: '设计交付检查清单.md', type: 'document', size: 3152, content: '设计交付检查清单\n\n- 核对项目名称、图纸编号与版本。\n- 检查图纸与材料清单是否一致。\n- 补齐评审意见和变更记录。\n- 确认归档目录和交付责任人。', updatedAt: date(8), source: 'sample', folderId: 'folder-review' },
    { id: 'file-zhou', userId: 'zhou', name: '客户沟通记录.md', type: 'text', size: 410, content: '客户沟通记录\n\n已与客户约定补充设备序列号和使用环境。', updatedAt: date(10), source: 'sample' },
  ]

  const conversations: Conversation[] = [
    { id: 'chat-weekly', userId: 'lin', title: '整理本周产品工作进展', assistantId: 'assistant-report', createdAt: date(11), updatedAt: date(11, '09:46:00'), messages: [message('weekly-q', 'user', '帮我整理本周产品工作进展，按进展和下一步输出。'), message('weekly-a', 'assistant', report, { artifactName: '产品组工作周报.md' })] },
    { id: 'chat-meeting', userId: 'lin', title: '提炼项目例会纪要', assistantId: 'default', createdAt: date(10), updatedAt: date(10, '15:20:00'), messages: [message('meeting-q', 'user', '请从例会记录中提炼会后行动项。', { references: ['file-meeting'] }), message('meeting-a', 'assistant', '需要跟进两项工作：\n\n1. 设计组补充评审清单。\n2. 售后组汇总工单并标记高频问题。\n\n可以为每项补充负责人及完成时间。', { artifactName: '例会行动项.md' })] },
    { id: 'chat-check', userId: 'lin', title: '准备交付评审检查清单', assistantId: 'assistant-review', createdAt: date(8), updatedAt: date(8), messages: [message('check-q', 'user', '帮我整理交付评审前要检查的事项。'), message('check-a', 'assistant', '建议检查图纸版本、材料清单、变更记录、责任人和归档位置。', { artifactName: '交付评审检查清单.md' })] },
  ]

  const employees: Employee[] = [
    { id: 'employee-service', name: '售后服务专员', role: '客户服务', description: '协助核对售后工单、整理问题并跟进交付。', instructions: '根据工单信息定位问题，记录处理进度。遇到资料缺失时请发起人补充。', ownerId: 'song', configuratorIds: ['lin'], publisherIds: ['lin'], status: 'published', allowedUserIds: [...memberIds], resourceIds: ['model-deepseek', 'skill-summary', 'tool-sheet'], color: '#3b65d4', trainingNotes: ['先确认工单编号和设备型号，再给出处理建议。'] },
    { id: 'employee-design', name: '设计交付专员', role: '工程设计', description: '检查设计资料完整性，整理评审意见和交付清单。', instructions: '按设计交付规范核对文件版本、评审意见、材料清单。', ownerId: 'lin', status: 'published', allowedUserIds: ['lin', 'zhou'], resourceIds: ['model-deepseek', 'knowledge-design'], color: '#7270bb', trainingNotes: ['检查交付文件时保留文件版本号。'] },
    { id: 'employee-office', name: '综合事务专员', role: '综合办公', description: '整理会议材料、汇总进展和更新例行工作记录。', instructions: '识别材料中的待办和负责人，按时点汇总。', ownerId: 'lin', status: 'published', allowedUserIds: ['lin', 'song'], resourceIds: ['model-deepseek', 'mcp-files', 'skill-summary'], color: '#328578', trainingNotes: [] },
    { id: 'employee-inventory', name: '库存协同专员', role: '供应链', description: '核对库存差异并整理补货建议。', instructions: '', ownerId: 'song', status: 'draft', allowedUserIds: [], resourceIds: [], color: '#b97544', trainingNotes: [] },
  ]

  const threads: EmployeeThread[] = [
    { id: 'thread-service', userId: 'lin', employeeId: 'employee-service', updatedAt: date(11, '09:24:00'), messages: [
      message('svc-welcome', 'assistant', '你好，我是售后服务专员。可以向我咨询工单，也可以交办售后整理或跟进工作。'),
      message('svc-order', 'user', '请帮我整理这一周的售后工单，列出高频问题。', { taskId: 'task-service' }),
      message('svc-accepted', 'assistant', '已受理。工单已经按问题分类，目前还需要确认是否包含未关闭的工单。', { taskId: 'task-service' }),
    ] },
    { id: 'thread-design', userId: 'lin', employeeId: 'employee-design', updatedAt: date(10), messages: [
      message('design-q', 'user', '帮我准备设计交付检查清单。', { taskId: 'task-design' }),
      message('design-a', 'assistant', '清单已整理完毕，可以查看结果。', { taskId: 'task-design' }),
    ] },
    { id: 'thread-zhou', userId: 'zhou', employeeId: 'employee-service', updatedAt: date(11), messages: [
      message('zhou-q', 'user', '帮我复核客户现场服务材料。', { taskId: 'task-zhou' }),
      message('zhou-a', 'assistant', '现场服务材料已核对。', { taskId: 'task-zhou' }),
    ] },
  ]

  const tasks: Task[] = [
    { id: 'task-service', userId: 'lin', employeeId: 'employee-service', threadId: 'thread-service', title: '整理本周售后工单', status: '待补充', progress: 65, detail: '已按问题分类。请确认是否包含未关闭的工单。', updatedAt: date(11, '09:24:00') },
    { id: 'task-design', userId: 'lin', employeeId: 'employee-design', threadId: 'thread-design', title: '准备设计交付检查清单', status: '已完成', progress: 100, detail: '已完成检查清单，可用于下次设计评审。', result: '设计交付检查清单\n1. 核对图纸和材料清单版本。\n2. 整理评审意见。\n3. 确认归档位置和责任人。', updatedAt: date(10) },
    { id: 'task-zhou', userId: 'zhou', employeeId: 'employee-service', threadId: 'thread-zhou', title: '复核客户现场服务材料', status: '已完成', progress: 100, detail: '已确认服务单与现场记录一致。', result: '材料齐全，等待客户确认现场服务结果。', updatedAt: date(11) },
  ]

  const workbenches: Workbench[] = [
    { id: ET_DESIGN_WORKBENCH_ID, name: 'ET 设计工作台', description: ET_DESIGN_DESCRIPTION, status: 'active', allowedUserIds: ['lin', 'zhou'], pairedAssistantId: ET_DESIGN_ASSISTANT_ID, icon: 'pen-tool', color: '#7a68be', records: [
      { id: 'ET-052', title: '南区产线 · 电气图纸评审', category: '设计评审', status: '处理中', updatedAt: date(11), detail: '电气图纸第二版已更新，需按评审清单复核接线标识与部件编号。' },
      { id: 'ET-046', title: '远程监控单元 · 交付文件归档', category: '交付归档', status: '待处理', updatedAt: date(10), detail: '需要收集图纸、材料清单、评审记录与版本说明，并确认归档位置。' },
      { id: 'ET-039', title: '自动检测站 · 变更记录核对', category: '设计变更', status: '已完成', updatedAt: date(8), detail: '变更已登记，图纸与材料清单版本一致。' },
    ] },
    ...makeScenarioWorkbenches(),
    { id: 'workbench-inventory', name: '库存协同工作台', description: '盘点差异、库存核对与补货跟进。', status: 'disabled', allowedUserIds: [], icon: 'package', color: '#3c907e', records: [
      { id: 'INV-016', title: 'A 区备件 · 库存差异复核', category: '库存盘点', status: '待处理', updatedAt: date(11), detail: '等待复核系统数量和本周盘点记录。' },
    ] },
  ]

  return {
    currentUserId: 'lin',
    assistantSharingVersion: 1,
    organizationConnections: makeAdminConnections(),
    organizationChanges: makeAdminChanges(),
    users: [
      { id: 'lin', name: '林知远', role: 'admin', department: '产品与交付', title: '组织管理员', initials: '林' },
      { id: 'zhou', name: '周可欣', role: 'member', department: '客户服务', title: '普通成员', initials: '周' },
      { id: 'song', name: '宋予安', role: 'member', department: '客户服务', title: '数字员工负责人', initials: '宋' },
    ],
    assistants: [
      { id: 'assistant-report', userId: 'lin', scope: 'personal', allowedUserIds: [], name: '报告助理', description: '整理工作材料，撰写周报和汇报初稿。', instructions: '优先给出进展、风险和下一步行动，保留待补充的数据。', resourceIds: ['skill-weekly', 'tool-sheet', 'model-deepseek'] },
      { id: 'assistant-review', userId: 'lin', scope: 'personal', allowedUserIds: [], name: '设计评审助理', description: '按交付规范检查资料与评审要点。', instructions: '检查文件完整性、版本、材料清单和责任人。', resourceIds: ['knowledge-design', 'model-deepseek'] },
      ...makeSampleSharedAssistants(),
      makeSampleEtDesignAssistant(),
    ],
    resources, files, workspaceFolders, conversations, employees, threads, tasks, workbenches,
  }
}
