<script setup lang="ts">
import { computed } from 'vue'
import { ClipboardCheck, Download, FileBox, FileSpreadsheet, MoveUpRight } from 'lucide-vue-next'
import { useEtDrawingReviewStore } from '@/stores/etDrawingReview'
import { etReviewId, etReviewTitle, scenarioStatusLabels, useScenarioTaskStore } from '@/stores/scenarioTasks'
import EtReviewFindings from './EtReviewFindings.vue'
import { downloadEtReviewMaterials, reviewDrawingName, type EtReviewVersion } from './etReviewDrawing'

const emit = defineEmits<{ openVersion: [version: EtReviewVersion, indices?: number[]] }>()
const review = useEtDrawingReviewStore()
const scenarioTasks = useScenarioTaskStore()
const versions: EtReviewVersion[] = ['V1', 'V2']
const tasks = computed(() => review.hasWorkspaceAccess ? scenarioTasks.tasksForObject('et-review', etReviewId) : [])
const formatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })

function formatDate(date: string) {
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? '—' : formatter.format(parsed)
}

function downloadMaterials() {
  if (review.hasWorkspaceAccess) downloadEtReviewMaterials()
}
</script>

<template>
  <div v-if="review.hasWorkspaceAccess" class="et-shared-workspace">
    <header class="et-shared-heading">
      <span>{{ etReviewId }}</span>
      <h2>{{ etReviewTitle }}</h2>
      <p>当前项目成员可在这里打开图纸、接续评审，以及查看已确认的记录。</p>
    </header>

    <section class="et-shared-section" aria-labelledby="et-shared-files">
      <h3 id="et-shared-files">共享资料</h3>
      <div v-for="version in versions" :key="version" class="et-shared-row">
        <FileBox :size="17" aria-hidden="true" />
        <div>
          <strong>{{ reviewDrawingName(version) }}</strong>
          <small v-if="version === 'V2' && review.release">{{ review.release.authorName }} · 发布于 {{ formatDate(review.release.publishedAt) }}</small>
          <small v-else>{{ version === 'V1' ? '初始版本' : '待发布 · 已共享供项目成员核对' }}</small>
        </div>
        <button type="button" class="et-shared-action" :aria-label="`打开 ${version} 图纸`" @click="emit('openVersion', version)">打开 <MoveUpRight :size="12" aria-hidden="true" /></button>
      </div>
      <div class="et-shared-row">
        <FileSpreadsheet :size="17" aria-hidden="true" />
        <div><strong>材料清单 V1</strong><small>接线路径 2 条</small></div>
        <button type="button" class="et-shared-action" aria-label="下载材料清单 V1" @click="downloadMaterials">下载 <Download :size="13" aria-hidden="true" /></button>
      </div>
    </section>

    <section class="et-shared-section" aria-labelledby="et-shared-checklists">
      <h3 id="et-shared-checklists">已确认的检查清单</h3>
      <p v-if="!review.confirmed.length" class="et-shared-empty">在智能问图中确认检查清单后，项目成员可在这里接续。</p>
      <details v-for="checklist in review.confirmed" :key="checklist.id" class="et-shared-details">
        <summary>
          <div>
            <strong>{{ checklist.version }} · {{ checklist.scope }}</strong>
            <small>{{ checklist.authorName }}确认 · {{ checklist.assistantName }} · {{ formatDate(checklist.confirmedAt) }}</small>
          </div>
          <span>{{ checklist.findings.length }} 项</span>
        </summary>
        <EtReviewFindings :findings="checklist.findings" @locate="emit('openVersion', checklist.version, $event)" />
      </details>
    </section>

    <section class="et-shared-section" aria-labelledby="et-shared-tasks">
      <h3 id="et-shared-tasks">AI 员工任务与交付</h3>
      <p v-if="!tasks.length" class="et-shared-empty">发布新版本或主动交办后，可在这里查看获授权的核对任务。</p>
      <article v-for="task in tasks" :key="task.id" class="et-shared-task">
        <div class="et-shared-task-title">
          <ClipboardCheck :size="16" aria-hidden="true" />
          <strong>{{ task.objectVersion }} · {{ task.title }}</strong>
          <span>{{ scenarioStatusLabels[task.status] }}</span>
        </div>
        <div v-if="task.writtenAt" class="et-shared-writeback">
          <small>已写回 {{ etReviewId }} · {{ formatDate(task.writtenAt) }}</small>
          <p>{{ task.result }}</p>
        </div>
        <RouterLink :to="{ name: 'scenario-task', params: { taskId: task.id } }" class="et-shared-action">查看任务 <MoveUpRight :size="12" aria-hidden="true" /></RouterLink>
      </article>
    </section>
  </div>
</template>

<style scoped>
.et-shared-workspace { display: grid; gap: 18px; }
.et-shared-heading { padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.et-shared-heading span { color: var(--accent); font-size: 12px; font-weight: 650; }
.et-shared-heading h2 { margin: 3px 0 5px; font-size: 17px; }
.et-shared-heading p, .et-shared-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.et-shared-section { display: grid; gap: 7px; min-width: 0; }
.et-shared-section h3 { margin: 0; font-size: 14px; }
.et-shared-row, .et-shared-details, .et-shared-task { padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.et-shared-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.et-shared-row strong, .et-shared-details strong, .et-shared-task strong { font-size: 13px; overflow-wrap: anywhere; }
.et-shared-row small, .et-shared-details small, .et-shared-task small { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
.et-shared-row svg { color: var(--accent); }
.et-shared-action { display: inline-flex; align-items: center; justify-content: center; gap: 3px; width: fit-content; padding: 3px 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; font-weight: 620; white-space: nowrap; }
.et-shared-action:hover { text-decoration: underline; }
.et-shared-details summary { cursor: pointer; }
.et-shared-details summary div { display: inline-block; max-width: calc(100% - 65px); vertical-align: top; }
.et-shared-details summary > span { float: right; color: var(--muted); font-size: 12px; }
.et-shared-task p { margin: 0; color: #42516a; font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.et-shared-task { display: grid; gap: 7px; }
.et-shared-task-title { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; }
.et-shared-task-title svg { color: var(--accent); }
.et-shared-task-title span { padding: 2px 5px; border-radius: 4px; background: var(--soft); color: var(--accent); font-size: 11px; }
.et-shared-writeback { padding: 6px 8px; border-radius: 6px; background: var(--canvas); }
</style>
