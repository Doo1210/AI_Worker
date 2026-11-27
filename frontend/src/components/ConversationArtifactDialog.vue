<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePlatformStore, type Message } from '@/stores/platform'
import { fileCenterName, workspaceFolderPath, type ResolvedWorkspaceDirectory } from '@/workspaceDirectory'
import ConversationMarkdown from './ConversationMarkdown.vue'

const props = defineProps<{ conversationId: string; message?: Message; directory?: ResolvedWorkspaceDirectory }>()
const open = defineModel<boolean>({ required: true })
const platform = usePlatformStore()
const router = useRouter()
const name = ref('')
const content = ref('')
const folderId = ref('')
const preview = ref(true)
const error = ref('')
const saved = computed(() => props.directory?.files.find(file => file.id === 'artifact-' + props.message?.id))
const sources = computed(() => (props.message?.references ?? []).map(id =>
  props.directory?.files.find(file => file.id === id)?.name ?? '引用文件已不可用'))
const folders = computed(() => {
  const directory = props.directory
  if (!directory) return []
  const byId = new Map(directory.folders.map(folder => [folder.id, folder]))
  return directory.folders.map(folder => ({
    id: folder.id, name: folder.name, path: [directory.path, ...workspaceFolderPath(byId, folder.id)].join(' / '),
  }))
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
})

watch([open, () => props.message, () => platform.currentUser.id], ([visible, message], previous) => {
  if (previous?.[2] && previous[2] !== platform.currentUser.id) {
    open.value = false
    return
  }
  if (!visible || !message) return
  name.value = saved.value?.name ?? message.artifactName ?? '助理产物.md'
  content.value = saved.value?.content ?? message.artifactContent ?? message.text
  folderId.value = (saved.value ? saved.value.folderId : props.directory?.folderId) ?? ''
  preview.value = true
  error.value = ''
})

function save() {
  if (!props.directory?.canWrite || !props.message || !name.value.trim() || !content.value.trim()) return
  const id = platform.saveMessageFile(props.conversationId, props.message.id, {
    name: name.value.trim(),
    content: content.value,
    folderId: folderId.value || undefined,
  })
  if (!id) {
    error.value = '无法保存。请检查目录权限、文件名及可用存储空间。'
    return
  }
  error.value = ''
  ElMessage.success('已保存文件')
}

function openWorkspace() {
  if (!saved.value || !props.directory) return
  open.value = false
  void router.push({ path: '/work/workspace', query: {
    scope: props.directory.spaceId === undefined ? undefined : 'shared', space: props.directory.spaceId,
    folder: saved.value.folderId, file: saved.value.id,
  } })
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
        <el-input v-model="name" aria-label="产物文件名" maxlength="120" :readonly="!directory?.canWrite" @input="error = ''" />
      </el-form-item>
      <div class="artifact-editor">
        <div v-if="directory?.canWrite" class="editor-switch" role="group" aria-label="文档模式">
          <button type="button" :aria-pressed="preview" @click="preview = true">预览</button>
          <button type="button" :aria-pressed="!preview" @click="preview = false">编辑</button>
        </div>
        <ConversationMarkdown v-if="preview || !directory?.canWrite" class="artifact-preview" aria-label="文档预览" :text="content" />
        <el-input v-else v-model="content" type="textarea" resize="vertical" :rows="10" maxlength="240000"
          aria-label="文档内容" @input="error = ''" />
      </div>
      <el-form-item v-if="directory?.canWrite" label="保存位置">
        <el-select v-model="folderId" aria-label="保存位置" placeholder="选择保存目录" :empty-values="[null, undefined]" @change="error = ''">
          <el-option :label="directory.label" :title="directory.path" :value="directory.folderId ?? ''" />
          <el-option v-for="folder in folders" :key="folder.id" :value="folder.id" :label="folder.name" :title="folder.path" />
        </el-select>
      </el-form-item>
      <p v-else class="muted">{{ directory ? '当前工作目录仅可查看。' : '当前工作目录不可用。' }}</p>
    </el-form>
    <template #footer>
      <div class="artifact-actions">
        <el-button v-if="saved" text type="primary" @click="openWorkspace">在{{ fileCenterName }}查看</el-button>
        <el-button @click="open = false">关闭</el-button>
        <el-button v-if="directory?.canWrite" type="primary" :disabled="!name.trim() || !content.trim()" @click="save">{{ saved ? '保存修改' : '保存文件' }}</el-button>
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
.artifact-preview { min-height: 120px; max-height: 230px; margin: 0; padding: 11px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); color: var(--text); }
.artifact-form .el-select { width: 100%; }
.artifact-actions { display: flex; justify-content: end; gap: 8px; flex-wrap: wrap; }
.artifact-actions .el-button { margin-left: 0; }
</style>
