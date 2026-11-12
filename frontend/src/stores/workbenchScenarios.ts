import type { Workbench } from './platform'
import { TENDER_WORKBENCH_ID } from './tenderSample'
import { DESIGN_STUDIO_WORKBENCH_ID } from './designStudio'
import { PROJECT_WORKBENCH_ID } from './projectWorkbench'

export const COST_WORKBENCH_ID = 'workbench-cost'
export const TRADE_WORKBENCH_ID = 'workbench-trade'

export function makeScenarioWorkbenches(): Workbench[] {
  return [
    {
      id: PROJECT_WORKBENCH_ID, name: '项目管理工作台',
      description: '围绕交付目标安排任务和里程碑，识别阻塞并整理复盘材料。',
      status: 'active', allowedUserIds: ['lin', 'zhou'], icon: 'list-checks', color: '#242a34',
      records: [],
    },
    {
      id: TRADE_WORKBENCH_ID, name: '外贸工作台',
      description: '模拟装柜与装车，复核余货并生成外贸装箱单。',
      status: 'active', allowedUserIds: ['lin', 'zhou'], icon: 'ship', color: '#9c743f',
      records: [],
    },
    {
      id: COST_WORKBENCH_ID, name: '工程造价工作台',
      description: '编制工程量清单，核算综合单价，并复核项目造价。',
      status: 'active', allowedUserIds: ['lin', 'song'], icon: 'calculator', color: '#a65d40',
      records: [],
    },
    {
      id: TENDER_WORKBENCH_ID, name: '招投标工作台',
      description: '发现招标公告和拟建项目，初筛商机、人工复核并交付报告。',
      status: 'active', allowedUserIds: ['lin', 'zhou'], icon: 'file-search', color: '#365a96',
      records: [],
    },
    {
      id: DESIGN_STUDIO_WORKBENCH_ID, name: '设计工作台',
      description: '在多屏画布上编辑界面，围绕选区提出修改并试用原型。',
      status: 'active', allowedUserIds: ['lin', 'zhou'], icon: 'panels-top-left', color: '#5258da',
      records: [],
    },
  ]
}
