<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Flame, MapPin, Minus, Plus, ReceiptText, ShoppingBag, Soup, UserRound, Wifi } from 'lucide-vue-next'
import { dishes, elementText, type Basket, type DesignDocument, type DishId, type ElementId, type ScreenId } from '@/stores/designStudio'

const props = defineProps<{
  screen: ScreenId
  design: DesignDocument
  basket: Basket
  photo?: string
  selected?: ElementId
  changed?: ElementId
  preview: boolean
  ordered: boolean
}>()
const emit = defineEmits<{
  select: [id: ElementId]
  navigate: [screen: ScreenId]
  quantity: [id: DishId, change: number]
  checkout: []
}>()
const total = computed(() => dishes.reduce((sum, dish) => sum + props.basket[dish.id] * dish.price, 0))
const quantity = computed(() => Object.values(props.basket).reduce((sum, count) => sum + count, 0))
const items = computed(() => dishes.filter(dish => props.basket[dish.id]))
const text = (id: ElementId) => elementText(props.design, id)

function editAttrs(id: ElementId) {
  const style = props.design.styles[id]
  return {
    'data-element': id,
    'data-selected': !props.preview && props.selected === id ? 'true' : undefined,
    'data-changed': !props.preview && props.changed === id ? 'true' : undefined,
    'data-emphasis': style?.emphasis ? 'true' : undefined,
    'data-note': !props.preview && props.design.notes[id] ? 'true' : undefined,
    style: style?.color ? { '--element-accent': style.color } : undefined,
  }
}

function act(id: ElementId, destination?: ScreenId) {
  if (!props.preview) emit('select', id)
  else if (id === 'cart.cta') {
    if (quantity.value) emit('checkout')
  } else if (destination) emit('navigate', destination)
}
</script>

<template>
  <div class="studio-phone" :class="{ 'is-editing': !preview }" :style="{ '--phone-accent': design.accent, '--phone-radius': design.radius + 'px' }">
    <div class="studio-device">
      <div class="studio-status" aria-hidden="true"><b>9:41</b><i /><Wifi :size="11" /><span class="studio-battery" /></div>
      <header class="studio-phone-header">
        <span v-if="screen === 'menu'" class="studio-brand-mark">巷</span>
        <button v-else type="button" class="studio-phone-back" aria-label="返回点单" data-next-screen="menu" @click="preview && emit('navigate', 'menu')"><ArrowLeft :size="14" /></button>
        <button type="button" class="studio-editable studio-phone-title" v-bind="editAttrs(`${screen}.title`)" @click="act(`${screen}.title`)">{{ text(`${screen}.title`) }}</button>
        <span v-if="screen === 'menu'" class="studio-store">老街店 <ChevronDown :size="9" /></span>
        <span class="studio-capsule" aria-hidden="true">••• <i /></span>
      </header>

      <template v-if="screen === 'menu'">
        <div class="studio-menu-body">
          <section class="studio-menu-hero">
            <div class="studio-menu-hero-copy"><small><MapPin :size="9" /> 营业中 · 老街店</small>
              <button class="studio-editable studio-slogan" type="button" v-bind="editAttrs('menu.hero')" @click="act('menu.hero')">{{ text('menu.hero') }}</button>
              <span>牛骨慢熬 8 小时</span>
            </div>
            <img v-if="photo" :src="photo" alt="" /><Soup v-else :size="40" aria-hidden="true" />
          </section>
          <div class="studio-menu-heading"><span><Flame :size="11" /> 招牌面</span><span>现煮现做</span></div>
          <div class="studio-dishes">
            <div v-for="(dish, index) in dishes" :key="dish.id" class="studio-dish">
              <span class="studio-food" :class="`food-${index}`"><img v-if="photo && index === 0" :src="photo" alt="" /><Soup v-else :size="22" aria-hidden="true" /></span>
              <span class="studio-dish-text"><b>{{ dish.name }}</b><small>{{ dish.detail }}</small><strong>¥{{ dish.price }}</strong></span>
              <button v-if="preview" type="button" class="studio-food-add" :aria-label="`添加${dish.name}`" @click="emit('quantity', dish.id, 1)"><Plus :size="11" /></button>
              <span v-else class="studio-food-add" aria-hidden="true"><Plus :size="11" /></span>
            </div>
          </div>
        </div>
        <div class="studio-cart-strip">
          <ShoppingBag :size="15" aria-hidden="true" /><span><b>¥{{ total }}</b><small>已选 {{ quantity }} 件</small></span>
          <button type="button" class="studio-editable studio-cta" v-bind="editAttrs('menu.cta')" data-next-screen="cart" @click="act('menu.cta', 'cart')">{{ text('menu.cta') }}</button>
        </div>
      </template>

      <template v-else-if="screen === 'cart'">
        <div class="studio-cart-body">
          <div class="studio-delivery"><span><Soup :size="13" /> 堂食</span><span><ShoppingBag :size="12" /> 外带</span></div>
          <div class="studio-cart-items">
            <h3>已选 {{ quantity }} 件</h3>
            <p v-if="!items.length" class="studio-empty-cart">购物车为空</p>
            <div v-for="(dish, index) in items" :key="dish.id" class="studio-cart-item">
              <span class="studio-food" :class="`food-${index}`"><img v-if="photo && dish.id === 'beef'" :src="photo" alt="" /><Soup v-else :size="18" aria-hidden="true" /></span>
              <span class="studio-dish-text"><b>{{ dish.name }}</b><strong>¥{{ dish.price }}</strong></span>
              <span class="studio-stepper">
                <button v-if="preview" type="button" :aria-label="`减少${dish.name}`" @click="emit('quantity', dish.id, -1)"><Minus :size="9" /></button>
                <span v-else class="studio-stepper-icon"><Minus :size="9" /></span>
                {{ basket[dish.id] }}
                <button v-if="preview" type="button" :aria-label="`增加${dish.name}`" @click="emit('quantity', dish.id, 1)"><Plus :size="9" /></button>
                <span v-else class="studio-stepper-icon"><Plus :size="9" /></span>
              </span>
            </div>
          </div>
          <div class="studio-cart-info"><Clock3 :size="12" /> 现点现做，预计 8 分钟</div>
        </div>
        <div class="studio-checkout">
          <span>合计 <b>¥{{ total }}</b></span>
          <button type="button" class="studio-editable studio-cta" v-bind="editAttrs('cart.cta')" data-next-screen="orders" :disabled="preview && !quantity" @click="act('cart.cta')">{{ text('cart.cta') }}</button>
        </div>
      </template>

      <div v-else class="studio-orders-body">
        <div class="studio-order-tab"><b>{{ ordered || !preview ? '进行中' : '暂无订单' }}</b><span>已完成</span></div>
        <template v-if="ordered || !preview">
          <section class="studio-order-card">
            <div class="studio-order-code"><div><small>取餐号</small><strong>A086</strong></div><Soup :size="41" /></div>
            <button type="button" class="studio-editable studio-order-note" v-bind="editAttrs('orders.notice')" @click="act('orders.notice')">{{ text('orders.notice') }}</button>
            <ol class="studio-progress"><li><Check :size="8" />已下单</li><li><Check :size="8" />备料</li><li><span />烹饪中</li><li><span />待取餐</li></ol>
          </section>
          <section class="studio-order-items"><h3>订单明细</h3><p v-for="dish in items" :key="dish.id"><span>{{ dish.name }}</span><span>×{{ basket[dish.id] }}</span><b>¥{{ dish.price * basket[dish.id] }}</b></p><p class="studio-order-total"><span>合计</span><b>¥{{ total }}</b></p></section>
        </template>
        <button type="button" class="studio-editable studio-cta studio-return" v-bind="editAttrs('orders.cta')" data-next-screen="menu" @click="act('orders.cta', 'menu')">{{ text('orders.cta') }} <ArrowRight :size="11" /></button>
      </div>

      <nav v-if="screen !== 'cart'" class="studio-phone-nav" aria-label="小程序导航">
        <button type="button" :class="{ active: screen === 'menu' }" data-next-screen="menu" @click="preview && emit('navigate', 'menu')"><Soup :size="15" />点单</button>
        <button type="button" :class="{ active: screen === 'orders' }" data-next-screen="orders" @click="preview && emit('navigate', 'orders')"><ReceiptText :size="14" />订单</button>
        <span><UserRound :size="14" />我的</span>
      </nav>
      <div class="studio-home-bar" aria-hidden="true" />
    </div>
  </div>
</template>

<style src="./designStudioPhone.css"></style>
