export const TENDER_WORKBENCH_ID = 'workbench-tender'

export interface TenderOpportunity {
  id: string
  title: string
  type: '招标公告' | '拟建项目'
  region: string
  buyer: string
  published: string
  deadline?: string
  amount?: number
  scope: string
  requirement?: string
}

export const opportunities: TenderOpportunity[] = [
  { id: 'ZB-26071', title: '高新区污水处理厂自控系统改造', type: '招标公告', region: '江苏', buyer: '示例高新区水务公司', published: '2026-11-10', deadline: '2026-11-24 09:30', amount: 386, scope: '更换 PLC 控制柜，升级监控平台，并完成系统联调与交付。', requirement: '公告摘要列有类似工业自控项目业绩要求。' },
  { id: 'ZB-26068', title: '工业园智慧能源管理平台建设', type: '招标公告', region: '浙江', buyer: '示例经开区产业服务中心', published: '2026-11-09', deadline: '2026-11-21 14:00', amount: 248, scope: '接入能耗计量设备，建设园区能源数据平台和用能分析看板。', requirement: '公告摘要要求提供现场实施和系统联调计划。' },
  { id: 'NJ-26023', title: '新能源零部件基地二期扩建', type: '拟建项目', region: '安徽', buyer: '示例新能源科技公司', published: '2026-11-08', amount: 3200, scope: '拟建设装配产线、仓储和公用工程配套。金额为项目披露的计划投资。' },
  { id: 'ZB-26065', title: '市政泵站远程监测设备采购', type: '招标公告', region: '江苏', buyer: '示例市排水管理中心', published: '2026-11-07', deadline: '2026-11-20 10:00', scope: '采购泵站监测终端及安装服务，示例摘要未披露采购预算。' },
  { id: 'ZB-26063', title: '数据中心机房设备年度维保', type: '招标公告', region: '浙江', buyer: '示例城市数据运营公司', published: '2026-11-06', deadline: '2026-11-19 10:00', amount: 152, scope: '机房空调、配电与环境监测设备年度维保。' },
  { id: 'ZB-26061', title: '开发区道路照明控制箱采购', type: '招标公告', region: '安徽', buyer: '示例开发区市政服务中心', published: '2026-11-05', deadline: '2026-11-18 09:00', amount: 58, scope: '采购道路照明控制箱及配套元器件。' },
  { id: 'NJ-26018', title: '临港产业园综合能源站新建', type: '拟建项目', region: '上海', buyer: '示例临港能源发展公司', published: '2026-11-04', amount: 4600, scope: '拟建设综合能源站和配套计量监测设施，披露金额为项目投资。' },
]

export const tenderCategories = ['纳入', '观察', '人工复核', '规则排除', '未匹配'] as const
export type TenderCategory = typeof tenderCategories[number]
export interface TenderQuery { keyword: string; type: string; region: string; from: string; to: string }
export interface TenderRules { minBudget: number; exclude: string }

export function findOpportunities(query: TenderQuery) {
  const keyword = query.keyword.trim().toLowerCase()
  return opportunities.filter(item =>
    (!query.type || item.type === query.type) && (!query.region || item.region === query.region)
    && (!query.from || item.published >= query.from) && (!query.to || item.published <= query.to)
    && [item.title, item.buyer, item.scope, item.id].some(value => value.toLowerCase().includes(keyword)),
  )
}

export function screenOpportunity(item: TenderOpportunity, rules: TenderRules): { category: TenderCategory; reason: string } {
  const excluded = rules.exclude.split(/[、，,；;\s]+/).find(term => term && item.title.toLowerCase().includes(term.toLowerCase()))
  if (excluded) return { category: '规则排除', reason: `标题命中排除词「${excluded}」。` }
  if (item.type === '拟建项目') return { category: '观察', reason: '当前为拟建阶段，后续可关注正式采购公告。' }
  if (item.amount === undefined || !item.deadline) return { category: '人工复核', reason: '示例来源缺少预算或投标截止时间。' }
  if (item.amount < rules.minBudget) return { category: '未匹配', reason: `公告预算低于 ${rules.minBudget} 万元门槛。` }
  return { category: '纳入', reason: '公告预算达到门槛，且提供投标截止时间。' }
}

export function tenderAnalysis(item: TenderOpportunity) {
  if (item.type === '拟建项目') return '当前材料为拟建项目信息。建议核对建设进展、正式采购公告和预计采购时间。'
  const gaps = [
    item.amount === undefined && '核对原公告中的采购预算',
    !item.deadline && '确认报名及递交截止时间',
    !item.requirement && '查阅正式文件确认资格条件',
  ].filter(Boolean)
  return [item.requirement, gaps.length ? '待核实：' + gaps.join('、') + '。' : '', '结合采购范围核对类似项目业绩及可交付能力。'].filter(Boolean).join('\n')
}
