export type Dimensions = [length: number, width: number, height: number]
export type VehicleKind = 'container' | 'truck'

export interface Vehicle {
  id: string
  label: string
  kind: VehicleKind
  size: Dimensions
  payload: number
}

export const vehicles: Vehicle[] = [
  { id: '20gp', label: "20'GP", kind: 'container', size: [589, 235, 239], payload: 28000 },
  { id: '40gp', label: "40'GP", kind: 'container', size: [1203, 235, 239], payload: 26500 },
  { id: '40hq', label: "40'HQ", kind: 'container', size: [1203, 235, 269], payload: 26000 },
  { id: '45hq', label: "45'HQ", kind: 'container', size: [1355, 235, 269], payload: 27500 },
  { id: 'truck42', label: '4.2 米厢车', kind: 'truck', size: [420, 210, 210], payload: 1500 },
  { id: 'truck68', label: '6.8 米厢车', kind: 'truck', size: [680, 240, 250], payload: 9500 },
  { id: 'truck76', label: '7.6 米厢车', kind: 'truck', size: [760, 240, 250], payload: 10000 },
]

export interface Cargo {
  id: string
  name: string
  length: number
  width: number
  height: number
  cartons: number
  net: number
  tare: number
  pieces: number
  upright: boolean
}

export const cargoColors = ['#25466d', '#bb914e', '#356d5e', '#825b78', '#487184', '#a45f49']

export function exampleCargo(): Cargo[] {
  return [
    { id: 'watch', name: 'Smart Watch X1', length: 46, width: 32, height: 28, cartons: 600, net: 14, tare: 1, pieces: 20, upright: true },
    { id: 'speaker', name: 'Bluetooth Speaker S2', length: 60, width: 40, height: 40, cartons: 120, net: 22, tare: 2, pieces: 8, upright: true },
    { id: 'accessory', name: 'Accessory Kit', length: 40, width: 30, height: 20, cartons: 90, net: 6, tare: 0.5, pieces: 30, upright: true },
  ]
}

export const cartonVolume = (item: Cargo) => item.length * item.width * item.height / 1_000_000
export const cartonWeight = (item: Cargo) => item.net + item.tare
export const vehicleVolume = (vehicle: Vehicle) => vehicle.size.reduce((a, b) => a * b) / 1_000_000

export function cargoError(items: Cargo[]) {
  if (!items.length) return '请添加至少一种货物。'
  for (const [index, item] of items.entries()) {
    const positive = (value: number) => Number.isFinite(value) && value > 0
    const integer = (value: number) => Number.isSafeInteger(value) && value > 0
    if (!item.name.trim() || ![item.length, item.width, item.height].every(value => Number.isFinite(value) && value >= .1)
      || !integer(item.cartons) || !integer(item.pieces)
      || ![item.net, item.tare].every(value => Number.isFinite(value) && value >= 0)
      || !positive(cartonWeight(item)) || !positive(cartonVolume(item))) {
      return `第 ${index + 1} 项货物需要填写名称、有效箱规、整箱数量、每箱件数和毛重。`
    }
  }
  const totals = items.reduce((sum, item) => ({
    count: sum.count + item.cartons,
    pieces: sum.pieces + item.cartons * item.pieces,
    weight: sum.weight + item.cartons * cartonWeight(item),
    volume: sum.volume + item.cartons * cartonVolume(item),
  }), { count: 0, pieces: 0, weight: 0, volume: 0 })
  if (!Number.isSafeInteger(totals.count) || !Number.isSafeInteger(totals.pieces)
    || !Number.isFinite(totals.weight) || !Number.isFinite(totals.volume)) {
    return '货物数量、重量或体积超出计算范围。'
  }
  return ''
}

export interface LoadGroup {
  cargo: Cargo
  color: string
  start: number
  size: Dimensions
  columns: number
  layers: number
  count: number
  reason: 'dimensions' | 'capacity' | ''
}

export interface LoadingPlan {
  vehicle: Vehicle
  groups: LoadGroup[]
  total: number
  loaded: number
  totalWeight: number
  loadedWeight: number
  totalVolume: number
  loadedVolume: number
  occupied: number
}

const fit = (available: number, size: number) => Math.floor(available / size + 1e-9)

// Each SKU uses its own floor-to-ceiling zone along the vehicle length.
export function planLoading(vehicle: Vehicle, cargo: Cargo[]): LoadingPlan {
  const plan: LoadingPlan = { vehicle, groups: [], total: 0, loaded: 0, totalWeight: 0, loadedWeight: 0, totalVolume: 0, loadedVolume: 0, occupied: 0 }
  const [length, width, height] = vehicle.size
  for (const [index, item] of cargo.entries()) {
    const { length: a, width: b, height: c, cartons } = item
    const orientations: Dimensions[] = item.upright
      ? [[a, b, c], [b, a, c]]
      : [[a, b, c], [b, a, c], [a, c, b], [c, a, b], [b, c, a], [c, b, a]]
    const gross = cartonWeight(item)
    const volume = cartonVolume(item)
    const capacityByWeight = fit(Math.max(0, vehicle.payload - plan.loadedWeight), gross)
    const options = orientations.map(size => {
      const columns = Math.min(cartons, fit(width, size[1]))
      const layers = Math.min(cartons, fit(height, size[2]))
      const perSlice = columns * layers
      const count = Math.min(cartons, capacityByWeight, fit(Math.max(0, length - plan.occupied), size[0]) * perSlice)
      return { size, columns, layers, count, span: count ? Math.ceil(count / perSlice) * size[0] : 0 }
    }).sort((left, right) => right.count - left.count || left.span - right.span)
    const best = options[0]
    const canFit = orientations.some(size => size.every((value, axis) => value <= vehicle.size[axis]))
    const { count } = best
    plan.groups.push({
      cargo: { ...item }, color: cargoColors[index % cargoColors.length], start: plan.occupied,
      size: best.size, columns: best.columns, layers: best.layers, count,
      reason: count === cartons ? '' : canFit ? 'capacity' : 'dimensions',
    })
    plan.total += cartons
    plan.loaded += count
    plan.totalWeight += gross * cartons
    plan.loadedWeight += gross * count
    plan.totalVolume += volume * cartons
    plan.loadedVolume += volume * count
    plan.occupied += best.span
  }
  return plan
}

export function loadSteps(plan: LoadingPlan, limit: number, cargoId?: string) {
  const steps: { cargo: Cargo; position: Dimensions; size: Dimensions; color: string }[] = []
  for (const group of plan.groups) {
    if (cargoId && group.cargo.id !== cargoId) continue
    const [length, width, height] = group.size
    const perSlice = group.columns * group.layers
    for (let index = 0; index < group.count && steps.length < limit; index++) {
      steps.push({
        cargo: group.cargo, color: group.color, size: group.size,
        position: [
          group.start + Math.floor(index / perSlice) * length,
          (index % group.columns) * width,
          Math.floor((index % perSlice) / group.columns) * height,
        ],
      })
    }
  }
  return steps
}

export function loadBlocks(group: LoadGroup, visible: number) {
  const count = Math.min(visible, group.count)
  if (count <= 0) return []
  const [length, width, height] = group.size
  const perSlice = group.columns * group.layers
  const slices = Math.floor(count / perSlice)
  const layers = Math.floor((count % perSlice) / group.columns)
  const partial = count % group.columns
  const x = group.start + slices * length
  const blocks: { start: Dimensions; size: Dimensions }[] = []
  if (slices) blocks.push({ start: [group.start, 0, 0], size: [slices * length, width * group.columns, height * group.layers] })
  if (layers) blocks.push({ start: [x, 0, 0], size: [length, width * group.columns, height * layers] })
  if (partial) blocks.push({ start: [x, 0, layers * height], size: [length, partial * width, height] })
  return blocks
}
