import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import {
  ElAlert, ElButton, ElCheckbox, ElConfigProvider, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu,
  ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElPopover, ElProgress, ElSelect, ElTag,
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@fontsource-variable/host-grotesk'
import '@fontsource-variable/instrument-sans'
import App from './App.vue'
import { makeRouter } from './router'
import './styles.css'
import './adminExtensions.css'

const pinia = createPinia()
const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(App)) })
const components = {
  ElAlert, ElButton, ElCheckbox, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElForm,
  ElFormItem, ElIcon, ElInput, ElOption, ElPopover, ElProgress, ElSelect, ElTag,
}
for (const [name, component] of Object.entries(components)) app.component(name, component)
app.use(pinia).use(makeRouter(pinia)).mount('#app')
