const examplesByEmployeeId = new Map<string, string[]>([
  ['employee-service', ['整理售后工单', '归类高频问题', '跟进服务事项']],
  ['employee-design', ['核对图纸和材料', '整理评审意见', '编制交付清单']],
  ['employee-office', ['整理会议材料', '汇总工作进展', '更新例行记录']],
  ['employee-inventory', ['核对库存差异', '整理补货建议']],
])

export function employeeExamples(employee: { id: string }): string[] {
  return [...(examplesByEmployeeId.get(employee.id) ?? [])]
}
