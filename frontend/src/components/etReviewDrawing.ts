import { getBounds, type DrawingEntity } from './etDrawing'

export type EtReviewVersion = 'V1' | 'V2'

export interface EtReviewFinding {
  layer: string
  entityIndices: number[]
  evidence: string
  conclusion: string
}

const layerNames: Record<string, string> = {
  BACKPLATE: '安装底板',
  TERMINALS: '接线端子',
  WIRING: '接线路径',
  CABLE_TAGS: '线缆标记',
}

export function reviewDrawingName(version: EtReviewVersion) {
  return `南区产线电气图纸-${version}.dxf`
}

export function downloadEtReviewMaterials() {
  const content = '\uFEFF图纸版本,线路,起点 X,终点 X\r\nV1,回路 1,40,75\r\nV1,回路 2,110,145\r\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'ET-052-材料清单-V1.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function reviewDrawingSource(version: EtReviewVersion) {
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
    [0, 'LINE', 8, layer, 10, x1, 20, y1, 11, x2, 21, y2]
  const terminal = (x: number, y: number) => [0, 'CIRCLE', 8, 'TERMINALS', 10, x, 20, y, 40, 6]
  const terminalRow = [40, 75, 110, 145, 180]
  const path = (startX: number, endX: number, middleY: number) => [
    ...line('WIRING', startX, 158, startX, middleY),
    ...line('WIRING', startX, middleY, endX, middleY),
    ...line('WIRING', endX, middleY, endX, 62),
    ...line('CABLE_TAGS', startX - 5, middleY + 13, startX + 5, middleY + 4),
    ...line('CABLE_TAGS', endX - 5, middleY - 2, endX + 5, middleY - 11),
  ]

  return [
    0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC',
    0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 4,
    ...Object.keys(layerNames).flatMap(layer => [0, 'LAYER', 2, layer, 70, 0, 62, 7, 6, 'CONTINUOUS']),
    0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES',
    ...line('BACKPLATE', 0, 0, 225, 0), ...line('BACKPLATE', 225, 0, 225, 220),
    ...line('BACKPLATE', 225, 220, 0, 220), ...line('BACKPLATE', 0, 220, 0, 0),
    ...line('TERMINALS', 25, 177, 195, 177), ...line('TERMINALS', 25, 43, 195, 43),
    ...terminalRow.flatMap(x => [...terminal(x, 164), ...terminal(x, 56)]),
    ...path(40, 75, 124), ...path(110, 145, 93),
    ...(version === 'V2' ? path(145, 180, 136) : []),
    0, 'ENDSEC', 0, 'EOF', '',
  ].join('\n')
}

export function getReviewFindings(entities: DrawingEntity[], selection: DrawingEntity[]): EtReviewFinding[] {
  const selected = new Set(selection)
  const layerEntities = new Map<string, number[]>()
  entities.forEach((entity, index) => {
    if (selected.size && !selected.has(entity)) return
    const indices = layerEntities.get(entity.layer) ?? []
    indices.push(index)
    layerEntities.set(entity.layer, indices)
  })

  const reviewNotes: Record<string, string> = {
    BACKPLATE: '对照安装尺寸和设备定位图核对底板边界。',
    TERMINALS: '对照端子表核对端子数量和位置。',
    WIRING: '逐段核对线路去向，确认是否已反映在当前材料清单中。',
    CABLE_TAGS: '核对图示线缆标记，确认关联线路已同步到交付记录。',
  }

  return [...layerEntities].map(([layer, entityIndices]) => {
    const bounds = getBounds(entityIndices.map(index => entities[index]))
    const start = `${Math.round(bounds.left)}, ${Math.round(bounds.bottom)}`
    const end = `${Math.round(bounds.right)}, ${Math.round(bounds.top)}`
    return {
      layer: `${layerNames[layer] ?? layer} · ${layer}`,
      entityIndices,
      evidence: `${entityIndices.length} 个实体，图纸坐标 (${start}) 至 (${end})`,
      conclusion: reviewNotes[layer] ?? '请按交付规范核对选区内实体。',
    }
  })
}
