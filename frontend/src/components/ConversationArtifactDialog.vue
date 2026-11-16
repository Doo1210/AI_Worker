<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePlatformStore, type Message } from '@/stores/platform'

const props = defineProps<{ conversationId: string; message?: Message }>()
const open = defineModel<boolean>({ required: true })
const platform = usePlatformStore()
const router = useRouter()
const name = ref('')
const content = ref('')
const folderId = ref('')
const preview = ref(true)
const error = ref('')
const saved = computed(() => platform.myFiles.find(file => file.id === 'artifact-' + props.message?.id))
const sources = computed(() => (props.message?.references ?? []).map(id => platform.myFiles.find(file => file.id === id)?.name ?? '引用文件已不可用'))
const folders = computed(() => {
  const byId = new Map(platform.myFolders.map(folder => [folder.id, folder]))
  return platform.myFolders.map(folder => {
    const parts: string[] = []
    const visited = new Set<string>()
    for (let item = byId.get(folder.id); item && !visited.has(item.id); item = byId.get(item.parentId ?? '')) {
      parts.unshift(item.name)
      visited.add(item.id)
    }
    return { id: folder.id, path: parts.join(' / ') }
  }).sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
})

watch([open, () => props.message, () => platform.currentUser.id], ([visible, message], previous) => {
  if (previous?.[2] && previous[2] !== platform.currentUser.id) {
    open.value = false
    return
  }
  if (!visible || !message) return
  name.value = saved.value?.name ?? message.artifactName ?? '助理产物.md'
  content.value = saved.value?.content ?? message.artifactContent ?? message.text
  folderId.value = saved.value?.folderId ?? ''
  preview.value = true
  error.value = ''
})

function save() {
  if (!props.message || !name.value.trim() || !content.value.trim()) return
  const id = platform.saveMessageFile(props.conversationId, props.message.id, {
    name: name.value.trim(),
    content: content.value,
    folderId: folderId.value || undefined,
  })
  if (!id) {
    error.value = '无法保存。请检查文件名是否有效或重复，以及工作空间剩余容量。'
    return
  }
  error.value = ''
  ElMessage.success('已保存到个人工作空间')
}

function openWorkspace() {
  if (!saved.value) return
  open.value = false
  void router.push({ path: '/work/workspace', query: { folder: saved.value.folderId, file: saved.value.id } })
}
</script>

<template>
  <el-dialog v-model="open" title="文档产物" width="min(690px, calc(100vw - 30px))" top="7vh" append-to-body>
    <el-form class="artifact-form" label-position="top" @submit.prevent="save">
      <div v-if="sources.length" class="artifact-sources">
        <span>引用资料</span>
        <ul>
          <li v-for="(source, index) in sources" :key="index">[{{ index + 1 }}] {{ source }}</li>
        </ul>
      </div>
      <el-form-item label="文件名" :error="error">
        <el-input v-model="name" aria-label="产物文件名" maxlength="120" @input="error = ''" />
      </el-form-item>
      <div class="artifact-editor">
        <div class="editor-switch" role="group" aria-label="文档模式">
          <button type="button" :aria-pressed="preview" @click="preview = true">预览</button>
          <button type="button" :aria-pressed="!preview" @click="preview = false">编辑</button>
        </div>
        <pre v-if="preview" class="artifact-preview" aria-label="文档预览">{{ content }}</pre>
        <el-input v-else v-model="content" type="textarea" resize="vertical" :rows="10" maxlength="240000"
          aria-label="文档内容" @input="error = ''" />
      </div>
      <el-form-item label="保存位置">
        <el-select v-model="folderId" aria-label="保存位置" placeholder="个人工作空间（根目录）" :value-on-clear="''" @change="error = ''">
          <el-option label="个人工作空间（根目录）" value="" />
          <el-option v-for="folder in folders" :key="folder.id" :value="folder.id" :label="folder.path" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="artifact-actions">
        <el-button v-if="saved" text type="primary" @click="openWorkspace">在工作空间查看</el-button>
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" :disabled="!name.trim() || !content.trim()" @click="save">{{ saved ? '保存修改' : '保存到工作空间' }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.artifact-form { max-height: min(63dvh, 580px); overflow-y: auto; padding: 2px 4px 0; }
.artifact-sources { margin-bottom: 13px; color: var(--muted); font-size: 12px; }
.artifact-sources ul { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 5px 0 0; padding: 0; list-style: none; }
.artifact-sources li { max-width: 100%; padding: 3px 6px; border-radius: 4px; background: var(--soft); overflow-wrap: anywhere; }
.artifact-editor { margin-bottom: 14px; }
.editor-switch { display: flex; width: fit-content; gap: 3px; padding: 2px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--canvas); }
.editor-switch button { padding: 4px 10px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); }
.editor-switch button[aria-pressed="true"] { background: var(--soft); color: var(--accent); font-weight: 650; }
.artifact-preview { min-height: 120px; max-height: 230px; margin: 0; padding: 11px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); color: var(--text); font: inherit; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.artifact-form .el-select { width: 100%; }
.artifact-actions { display: flex; justify-content: end; gap: 8px; flex-wrap: wrap; }
.artifact-actions .el-button { margin-left: 0; }
</style>
