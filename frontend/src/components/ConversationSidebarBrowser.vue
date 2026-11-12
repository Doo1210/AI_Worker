<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, ExternalLink, Globe } from 'lucide-vue-next'

const address = ref('')
const pageUrl = ref('')
const navigation = ref(0)
const error = ref('')

function openAddress() {
  const value = address.value.trim()
  try {
    if (!/^https?:\/\//i.test(value)) throw new Error()
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error()
    pageUrl.value = url.href
    address.value = url.href
    navigation.value += 1
    error.value = ''
  } catch {
    error.value = '请输入以 http:// 或 https:// 开头的完整网址。'
  }
}
</script>

<template>
  <section class="sidebar-browser" aria-label="浏览器">
    <form class="browser-toolbar" novalidate @submit.prevent="openAddress">
      <label class="browser-address">
        <Globe :size="15" aria-hidden="true" />
        <input
          v-model="address"
          type="url"
          inputmode="url"
          autocomplete="off"
          :spellcheck="false"
          placeholder="输入网页地址"
          aria-label="网页地址"
          :aria-invalid="!!error"
          :aria-describedby="error ? 'sidebar-browser-error' : undefined"
          @input="error = ''"
        />
      </label>
      <button type="submit" class="icon-button browser-go" aria-label="打开网址" :disabled="!address.trim()">
        <ArrowRight :size="16" aria-hidden="true" />
      </button>
    </form>

    <p v-if="error" id="sidebar-browser-error" class="browser-error" role="alert">{{ error }}</p>

    <template v-if="pageUrl">
      <div class="browser-preview">
        <iframe
          :key="navigation"
          :src="pageUrl"
          title="网页预览"
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
        />
      </div>
      <footer class="browser-footer">
        <span>预览不可用时</span>
        <a :href="pageUrl" target="_blank" rel="noopener noreferrer">
          在浏览器中打开 <ExternalLink :size="13" aria-hidden="true" />
        </a>
      </footer>
    </template>
    <div v-else class="browser-empty">
      <Globe :size="24" :stroke-width="1.6" aria-hidden="true" />
      <p>输入完整网址并打开。</p>
    </div>
  </section>
</template>

<style scoped>
.sidebar-browser {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--surface);
}
.browser-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
}
.browser-address {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 34px;
  padding: 0 9px;
  color: var(--muted);
  background: var(--canvas);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.browser-address:focus-within { border-color: var(--accent); }
.browser-address > svg { flex-shrink: 0; }
.browser-address input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 32px;
  padding: 0;
  border: 0;
  outline: none;
  color: var(--text);
  background: transparent;
  font-size: 13px;
}
.browser-go {
  flex: 0 0 34px;
  color: var(--accent);
  background: var(--soft);
}
.browser-go:disabled { opacity: .45; }
.browser-error {
  margin: 0 10px 8px;
  color: #a63138;
  font-size: 12px;
  line-height: 1.45;
}
.browser-preview {
  position: relative;
  flex: 1;
  min-height: 120px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
.browser-preview iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.browser-footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.browser-footer a { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
.browser-footer a:hover { text-decoration: underline; }
.browser-empty {
  display: grid;
  flex: 1;
  place-content: center;
  justify-items: center;
  gap: 8px;
  min-height: 120px;
  padding: 16px;
  color: var(--muted);
  text-align: center;
}
.browser-empty p { margin: 0; font-size: 13px; }
</style>
