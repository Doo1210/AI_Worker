export const DESIGN_STUDIO_WORKBENCH_ID = 'workbench-design-studio'

export const screens = [
  { id: 'menu', name: '点单', file: 'menu.html' },
  { id: 'cart', name: '购物车', file: 'cart.html' },
  { id: 'orders', name: '订单', file: 'orders.html' },
] as const

export type ScreenId = typeof screens[number]['id']

export const elements = {
  'menu.title': { name: '品牌标题', text: '巷口面馆' },
  'menu.hero': { name: '首页宣传语', text: '一碗热面，暖到心里' },
  'menu.cta': { name: '购物车按钮', text: '选好了' },
  'cart.title': { name: '购物车标题', text: '购物车' },
  'cart.cta': { name: '结算按钮', text: '去结算' },
  'orders.title': { name: '订单标题', text: '我的订单' },
  'orders.notice': { name: '取餐提示', text: '听到叫号后，请到窗口取餐' },
  'orders.cta': { name: '返回点单按钮', text: '返回点单' },
} as const

export type ElementId = keyof typeof elements

export interface DesignDocument {
  accent: string
  radius: number
  labels: Partial<Record<ElementId, string>>
  styles: Partial<Record<ElementId, { color?: string; emphasis?: boolean }>>
  notes: Partial<Record<ElementId, string>>
}

export const initialDesign: DesignDocument = { accent: '#a64828', radius: 12, labels: {}, styles: {}, notes: {} }

export const dishes = [
  { id: 'beef', name: '红烧牛肉面', detail: '慢炖牛腱 · 浓醇牛骨汤', price: 29 },
  { id: 'tomato', name: '番茄牛腩面', detail: '番茄熬煮 · 酸甜汤底', price: 26 },
  { id: 'greens', name: '雪菜肉丝面', detail: '鲜香雪菜 · 手工细面', price: 18 },
] as const
export type DishId = typeof dishes[number]['id']
export type Basket = Record<DishId, number>

export function screenOf(id: ElementId): ScreenId {
  return id.split('.')[0] as ScreenId
}

export function elementText(design: DesignDocument, id: ElementId) {
  return design.labels[id] ?? elements[id].text
}

export function contrastOnWhite(color: string) {
  const rgb = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return 1.05 / (linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 + .05)
}
