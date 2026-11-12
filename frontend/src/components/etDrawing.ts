export interface Point {
  x: number
  y: number
}

export interface Bounds {
  left: number
  right: number
  bottom: number
  top: number
}

export interface DrawingEntity {
  type: string
  layer: string
  points: Point[]
}

type Group = [number, string]

function readEntity(type: string, groups: Group[]): DrawingEntity | undefined {
  const value = (code: number) => groups.find(group => group[0] === code)?.[1]
  const number = (code: number) => Number(value(code) ?? NaN)
  const layer = value(8) || '0'
  const points: Point[] = []

  if ((value(210) && number(210) !== 0) || (value(220) && number(220) !== 0) || (value(230) && number(230) !== 1)) return

  switch (type) {
    case 'LINE':
      points.push({ x: number(10), y: number(20) }, { x: number(11), y: number(21) })
      break
    case 'CIRCLE':
    case 'ARC': {
      const x = number(10)
      const y = number(20)
      const radius = number(40)
      const start = type === 'CIRCLE' ? 0 : number(50)
      const sweep = type === 'CIRCLE' ? 360 : ((number(51) - start) % 360 + 360) % 360
      if (!(radius > 0 && sweep > 0)) return
      const steps = Math.ceil(sweep / 5)
      for (let index = 0; index <= steps; index++) {
        const angle = (start + sweep * index / steps) * Math.PI / 180
        points.push({ x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) })
      }
      break
    }
    case 'LWPOLYLINE': {
      if (groups.some(([code, data]) => [40, 41, 42, 43].includes(code) && Number(data) !== 0)) return
      let x: number | undefined
      for (const [code, data] of groups) {
        if (code === 10) x = Number(data)
        if (code === 20 && x !== undefined) {
          points.push({ x, y: Number(data) })
          x = undefined
        }
      }
      if (points.length !== number(90) || x !== undefined) return
      if ((number(70) & 1) && points[0]) points.push(points[0])
      break
    }
  }

  if (points.length > 1 && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return { type, layer, points }
  }
}

export function parseDrawing(source: string) {
  if (source.includes('\0')) throw new Error('此文件不是文本 DXF。请另存为 ASCII DXF 后再打开。')
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const entities: DrawingEntity[] = []
  let inEntities = false
  let skipped = 0
  let pointCount = 0

  for (let index = 0; index + 1 < lines.length;) {
    const code = lines[index++].trim()
    const value = lines[index++].trim()
    if (code !== '0') continue

    if (value === 'SECTION') {
      inEntities = lines[index]?.trim() === '2' && lines[index + 1]?.trim() === 'ENTITIES'
      continue
    }
    if (inEntities && value === 'ENDSEC') break
    if (!inEntities || value === 'VERTEX' || value === 'SEQEND') continue

    const groups: Group[] = []
    while (index + 1 < lines.length && lines[index].trim() !== '0') {
      groups.push([Number(lines[index++]), lines[index++].trim()])
    }
    if (groups.some(([group, data]) => group === 67 && data === '1')) continue

    const entity = readEntity(value, groups)
    if (!entity || pointCount + entity.points.length > 100_000) {
      skipped++
      continue
    }
    entities.push(entity)
    pointCount += entity.points.length
  }
  if (!entities.length) throw new Error('图纸中没有可预览的二维实体。请另存为包含直线、圆、圆弧或直线多段线的 ASCII DXF。')
  const bounds = getBounds(entities)
  if (!Number.isFinite(bounds.right - bounds.left) || !Number.isFinite(bounds.top - bounds.bottom)) {
    throw new Error('图纸坐标超出预览范围。')
  }
  return { entities, bounds, skipped }
}

export function getBounds(entities: DrawingEntity[]): Bounds {
  const bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity }
  for (const entity of entities) {
    for (const { x, y } of entity.points) {
      bounds.left = Math.min(bounds.left, x)
      bounds.right = Math.max(bounds.right, x)
      bounds.bottom = Math.min(bounds.bottom, y)
      bounds.top = Math.max(bounds.top, y)
    }
  }
  return bounds
}

export function selectEntities(entities: DrawingEntity[], bounds: Bounds) {
  const interval = (start: number, end: number, min: number, max: number) => {
    if (start === end) return start >= min && start <= max ? [0, 1] : [1, 0]
    const first = (min - start) / (end - start)
    const last = (max - start) / (end - start)
    return [Math.min(first, last), Math.max(first, last)]
  }

  return entities.filter(({ points }) => points.some((end, index) => {
    if (!index) return false
    const start = points[index - 1]
    const [enterX, exitX] = interval(start.x, end.x, bounds.left, bounds.right)
    const [enterY, exitY] = interval(start.y, end.y, bounds.bottom, bounds.top)
    return Math.max(0, enterX, enterY) <= Math.min(1, exitX, exitY)
  }))
}

export function drawingSvg(entities: DrawingEntity[], bounds: Bounds) {
  const width = bounds.right - bounds.left
  const height = bounds.top - bounds.bottom
  const padding = Math.max(width, height, 1) * 0.05
  const paths = entities.map(({ points }) => {
    const coords = points.map(({ x, y }) => `${x - bounds.left},${bounds.top - y}`).join(' ')
    return `<polyline points="${coords}"/>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${width + 2 * padding} ${height + 2 * padding}" fill="none" stroke="#243456" stroke-width="${padding / 32}">\n${paths}\n</svg>`
}

export function sampleDxf() {
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
    [0, 'LINE', 8, layer, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0]
  const circle = (layer: string, x: number, y: number, radius: number) =>
    [0, 'CIRCLE', 8, layer, 10, x, 20, y, 30, 0, 40, radius]
  const corners = [[0, 12], [12, 0], [268, 0], [280, 12], [280, 168], [268, 180], [12, 180], [0, 168]]
  const holes = [[24, 24], [256, 24], [256, 156], [24, 156]]
  const layers = ['OUTLINE', 'HOLES', 'CENTER', 'DIMENSIONS']

  return [
    0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC',
    0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length,
    ...layers.flatMap(name => [0, 'LAYER', 2, name, 70, 0, 62, 7, 6, 'CONTINUOUS']),
    0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES',
    ...corners.flatMap(([x, y], index) => {
      const [nextX, nextY] = corners[(index + 1) % corners.length]
      return line('OUTLINE', x, y, nextX, nextY)
    }),
    ...holes.flatMap(([x, y]) => [
      ...circle('HOLES', x, y, 9),
      ...line('CENTER', x - 13, y, x + 13, y),
      ...line('CENTER', x, y - 13, x, y + 13),
    ]),
    ...circle('HOLES', 140, 90, 40),
    ...circle('HOLES', 140, 90, 54),
    ...line('CENTER', 65, 90, 215, 90),
    ...line('CENTER', 140, 24, 140, 156),
    ...line('DIMENSIONS', 0, -8, 0, -28),
    ...line('DIMENSIONS', 280, -8, 280, -28),
    ...line('DIMENSIONS', 0, -21, 280, -21),
    ...line('DIMENSIONS', -15, 0, -35, 0),
    ...line('DIMENSIONS', -15, 180, -35, 180),
    ...line('DIMENSIONS', -27, 0, -27, 180),
    0, 'ENDSEC', 0, 'EOF', '',
  ].join('\n')
}
