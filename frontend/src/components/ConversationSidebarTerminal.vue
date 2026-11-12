<script setup lang="ts">
import { CornerDownLeft, Terminal } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'
import { usePlatformStore } from '@/stores/platform'

const platform = usePlatformStore()
const workspaceRoot = '/workspace'
const input = ref('')
const screen = ref<HTMLElement>()
const showHint = ref(true)
const output = ref<{ id: number; command: string; text: string; error?: boolean }[]>([])
let sequence = 0

watch(() => platform.currentUser.id, () => {
  input.value = ''
  output.value = []
  showHint.value = true
})

function pathParts(argument: string) {
  const quoted = argument.length >= 2 && (
    (argument.startsWith('"') && argument.endsWith('"')) ||
    (argument.startsWith("'") && argument.endsWith("'"))
  )
  const path = quoted ? argument.slice(1, -1) : argument
  if (path === workspaceRoot) return []
  const relative = path.startsWith(workspaceRoot + '/') ? path.slice(workspaceRoot.length + 1) : path
  if (relative.startsWith('/')) return
  const parts = relative.split('/').filter((part) => part && part !== '.')
  if (!parts.includes('..')) return parts
}

function findFolder(parts: string[]) {
  let id: string | undefined
  for (const name of parts) {
    const folder = platform.myFolders.find((item) => item.parentId === id && item.name === name)
    if (!folder) return
    id = folder.id
  }
  return { id }
}

function run(command: string, argument: string): { text: string; error?: boolean } {
  if (command === 'help') {
    return { text: 'help          查看可用命令\npwd           显示工作空间路径\nls [目录]     列出文件和目录\ncat <文件>    查看文本内容\nclear         清空屏幕' }
  }
  if (command === 'pwd' && !argument) return { text: workspaceRoot }
  if (command === 'ls') {
    const parts = pathParts(argument)
    const folder = parts && findFolder(parts)
    if (!folder) return { text: '找不到此目录。', error: true }
    const folders = platform.myFolders.filter((item) => item.parentId === folder.id).map((item) => item.name + '/')
    const files = platform.myFiles.filter((item) => item.folderId === folder.id).map((item) => item.name)
    return { text: [...folders, ...files].join('\n') || '（空目录）' }
  }
  if (command === 'cat') {
    const parts = pathParts(argument)
    if (!parts?.length) return { text: '用法：cat <文件路径>', error: true }
    const folder = findFolder(parts.slice(0, -1))
    const file = folder && platform.myFiles.find((item) => item.folderId === folder.id && item.name === parts.at(-1))
    if (!file) return { text: '找不到此文件。', error: true }
    if (!file.content) return { text: '此文件没有可显示的文本内容。' }
    const limit = 12_000
    return { text: file.content.length <= limit ? file.content : file.content.slice(0, limit) + '\n（仅显示前 12,000 个字符）' }
  }
  return { text: '模拟终端支持的命令可通过 help 查看。', error: true }
}

async function submit() {
  const entered = input.value.trim()
  if (!entered) return
  input.value = ''
  const separator = entered.search(/\s/)
  const command = separator === -1 ? entered : entered.slice(0, separator)
  const argument = separator === -1 ? '' : entered.slice(separator).trim()
  if (command === 'clear' && !argument) {
    output.value = []
    showHint.value = false
    return
  }
  output.value = [...output.value.slice(-59), { id: ++sequence, command: entered, ...run(command, argument) }]
  await nextTick()
  if (screen.value) screen.value.scrollTop = screen.value.scrollHeight
}
</script>

<template>
  <section class="terminal-pane" aria-label="模拟终端">
    <header class="terminal-header">
      <Terminal :size="15" aria-hidden="true" />
      <strong>模拟终端</strong>
      <span>/workspace</span>
    </header>
    <div ref="screen" class="terminal-screen" role="log" aria-label="终端输出" tabindex="0">
      <p v-if="showHint" class="terminal-hint">输入 <code>help</code> 查看可用命令。</p>
      <div v-for="line in output" :key="line.id" class="terminal-line">
        <p class="terminal-command"><span aria-hidden="true">$</span> {{ line.command }}</p>
        <pre :class="{ 'terminal-error': line.error }">{{ line.text }}</pre>
      </div>
    </div>
    <form class="terminal-input" @submit.prevent="submit">
      <span aria-hidden="true">$</span>
      <input v-model="input" type="text" aria-label="模拟终端命令" placeholder="输入命令"
        autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1000" />
      <button type="submit" aria-label="运行模拟命令" title="运行模拟命令" :disabled="!input.trim()">
        <CornerDownLeft :size="15" aria-hidden="true" />
      </button>
    </form>
  </section>
</template>

<style scoped>
.terminal-pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--text);
  background: var(--surface);
}
.terminal-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.terminal-header svg, .terminal-header span { color: var(--muted); }
.terminal-header span { margin-left: auto; }
.terminal-screen, .terminal-input {
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.terminal-screen {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 11px 12px;
}
.terminal-screen:focus-visible { outline-offset: -2px; }
.terminal-hint { margin: 0 0 12px; color: var(--muted); }
.terminal-hint code { color: var(--text); }
.terminal-line { margin-bottom: 10px; }
.terminal-command, .terminal-line pre {
  margin: 0;
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.terminal-line pre { padding-top: 2px; }
.terminal-command > span, .terminal-input > span { color: var(--accent); font-weight: 700; }
.terminal-error { color: #a33339; }
.terminal-input {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-top: 1px solid var(--line);
}
.terminal-input input {
  flex: 1;
  min-width: 0;
  padding: 5px 0;
  border: 0;
  outline: none;
  color: inherit;
  background: transparent;
}
.terminal-input:focus-within { box-shadow: inset 0 1px var(--accent); }
.terminal-input button {
  display: grid;
  place-items: center;
  flex: none;
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 5px;
  color: var(--accent);
  background: var(--soft);
}
.terminal-input button:disabled { opacity: .4; }
</style>
