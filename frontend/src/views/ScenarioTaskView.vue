<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowUpRight, CheckCircle2, FileText } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { employeeRunsLocation, taskOverviewLocation } from '@/employeeTaskRoutes'
import {
  scenarioDefinitions, scenarioNextStep, scenarioStatusLabels, useScenarioTaskStore, type ScenarioDecision,
} from '@/stores/scenarioTasks'
import { usePlatformStore } from '@/stores/platform'

const platform = usePlatformStore()
const scenario = useScenarioTaskStore()
const route = useRoute()
const task = computed(() => scenario.getTask(String(route.params.taskId ?? '')))
const canAct = computed(() => !!task.value && scenario.canAct(task.value))
const name = (id: string) => platform.users.find(user => user.id === id)?.name ?? '—'
const employee = computed(() => platform.employees.find(item => item.id === task.value?.employeeId))
const definition = computed(() => task.value && scenarioDefinitions[task.value.scenarioId])
const attempt = computed(() => task.value?.attempts.at(-1))
const connectionReady = computed(() => !!attempt.value && scenario.isConnectionAvailable(attempt.value.connectionId))
const reviewStep = computed(() => task.value?.reviews.find(step => !step.decision))
const note = ref('')
const overview = computed(() => taskOverviewLocation(route.query))
const listLink = computed(() => {
  if (route.query.from === 'employee-runs') return employeeRunsLocation(route.query)
  return route.query.from === 'assigned' ? { name: 'employee-tasks', query: overview.value.query } : overview.value
})
const listLabel = computed(() => route.query.from === 'employee-runs' ? '运行监管'
  : route.query.from === 'assigned' ? '我交办的任务' : '任务总览')
const objectLink = computed(() => {
  const current = task.value
  const workbench = definition.value?.workbenchId
  if (!current || !workbench || !platform.visibleWorkbenches.some(item => item.id === workbench)) return undefined
  return {
    name: 'workbench', params: { id: workbench },
    query: current.scenarioId === 'et-review'
      ? { review: current.objectId, version: current.objectVersion === 'V1' ? 'V1' : undefined }
      : { opportunity: current.objectId },
  }
})
const threadLink = computed(() => {
  const current = task.value
  if (!current?.threadId || !platform.employeeThreads.some(thread => thread.id === current.threadId)) return undefined
  return { name: 'employee-contact', params: { id: current.employeeId }, query: { thread: current.threadId, scenario: current.id } }
})
const timeFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function showTime(value: string) {
  return timeFormat.format(new Date(value))
}

watch(() => task.value?.id, () => { note.value = '' })

function review(decision: ScenarioDecision) {
  if (!task.value) return
  if (!scenario.reviewTask(task.value.id, decision, note.value)) {
    ElMessage.error('当前无法处理此任务，请检查权限和复核意见。')
    return
  }
  note.value = ''
}

function retry() {
  if (!task.value || !scenario.retryTask(task.value.id, note.value)) {
    ElMessage.error('当前无法重试，请检查连接状态和补充说明。')
    return
  }
  note.value = ''
}
</script>

<template>
  <section class="page page-surface scenario-task-page" :aria-label="task?.title ?? '任务详情'">
    <header class="page-controls page-toolbar page-tab-toolbar">
      <RouterLink :to="listLink" class="scenario-link"><ArrowLeft :size="15" aria-hidden="true" />{{ listLabel }}</RouterLink>
      <div v-if="threadLink || objectLink" class="page-toolbar-controls scenario-navigation-actions">
        <RouterLink v-if="threadLink" :to="threadLink" class="el-button">查看原沟通</RouterLink>
        <RouterLink v-if="objectLink" :to="objectLink" class="el-button">打开业务记录 <ArrowUpRight :size="15" aria-hidden="true" /></RouterLink>
      </div>
    </header>

    <template v-if="task && definition">
      <div class="page-body scenario-task-layout">
        <div class="scenario-task-main">
          <section class="panel scenario-panel" aria-labelledby="scenario-result">
            <h2 id="scenario-result"><FileText :size="17" aria-hidden="true" />核对结果与依据</h2>
            <p v-if="task.result" class="scenario-text">{{ task.result }}</p>
            <p v-else class="muted">{{ task.status === 'blocked' ? '等待连接恢复，执行结果将在重试后更新。' : 'AI 员工正在处理示例资料。' }}</p>
            <dl v-if="task.evidence.length" class="scenario-evidence">
              <div v-for="(item, index) in task.evidence" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.detail }}</dd></div>
            </dl>
            <p v-if="task.writtenAt" class="scenario-written"><CheckCircle2 :size="17" aria-hidden="true" />已模拟写回 {{ task.objectId }} · {{ showTime(task.writtenAt) }}</p>
          </section>

          <section v-if="task.request" class="panel scenario-panel" aria-labelledby="scenario-request">
            <h2 id="scenario-request">交办要求</h2>
            <p class="scenario-text">{{ task.request }}</p>
            <p v-if="task.deliverable" class="muted">期望交付　{{ task.deliverable }}</p>
          </section>

          <section class="panel scenario-panel" aria-labelledby="scenario-activity">
            <h2 id="scenario-activity">任务进展</h2>
            <ol class="scenario-timeline">
              <li v-for="(entry, index) in task.activity" :key="index">
                <div><strong>{{ entry.label }}</strong><time :datetime="entry.at">{{ showTime(entry.at) }}</time></div>
                <p>{{ entry.detail }}</p>
              </li>
            </ol>
          </section>
        </div>

        <div class="scenario-task-main">
          <section class="panel scenario-panel" aria-labelledby="scenario-next">
            <div class="scenario-panel-heading">
              <h2 id="scenario-next">当前处理</h2>
              <span class="scenario-status" :class="task.status">{{ scenarioStatusLabels[task.status] }}</span>
            </div>
            <strong>{{ scenarioNextStep(task) }}</strong>
            <p v-if="task.assigneeId" class="muted">接手人　{{ name(task.assigneeId) }}</p>
            <form v-if="canAct && task.status === 'review'" class="scenario-form" @submit.prevent="review('confirm')">
              <label for="scenario-review-note">复核意见</label>
              <el-input id="scenario-review-note" v-model="note" type="textarea" :rows="4" maxlength="1000" placeholder="记录核实依据、结论或需补充的事项" />
              <div class="scenario-links">
                <el-button :disabled="!note.trim()" @click="review('return')">退回补充</el-button>
                <el-button v-if="reviewStep?.label === '立项决策'" :disabled="!note.trim()" @click="review('decline')">不予立项</el-button>
                <el-button type="primary" native-type="submit" :disabled="!note.trim()">{{ reviewStep?.label === '立项决策' ? '确认立项' : '确认复核' }}</el-button>
              </div>
            </form>
            <form v-else-if="canAct && task.status === 'returned'" class="scenario-form" @submit.prevent="retry">
              <label for="scenario-resubmit-note">补充说明</label>
              <el-input id="scenario-resubmit-note" v-model="note" type="textarea" :rows="3" maxlength="1000" />
              <el-button type="primary" native-type="submit" :disabled="!note.trim() || !connectionReady">重新提交</el-button>
              <p v-if="!connectionReady" class="muted">连接就绪后可以重新提交。</p>
            </form>
            <template v-else-if="canAct && task.status === 'blocked'">
              <p class="muted">{{ connectionReady ? '依赖连接已恢复，可以重试。' : '请联系管理员检查依赖连接。' }}</p>
              <el-button type="primary" :disabled="!connectionReady" @click="retry()">重试任务</el-button>
            </template>
            <ul v-if="task.reviews.length > 1" class="scenario-steps" aria-label="业务复核顺序">
              <li v-for="step in task.reviews" :key="step.label">
                <span>{{ step.label }} · {{ name(step.userId) }}</span>
                <small>{{ step.decision === 'confirm' ? '已确认' : step.decision === 'decline' ? '不予立项' : step.decision === 'return' ? '已退回' : '待处理' }}</small>
              </li>
            </ul>
          </section>

          <section class="panel scenario-panel" aria-labelledby="scenario-info">
            <h2 id="scenario-info">任务信息</h2>
            <dl class="scenario-info">
              <div><dt>任务名称</dt><dd>{{ task.title }}</dd></div>
              <div><dt>业务对象</dt><dd>{{ task.objectTitle }} · {{ task.objectVersion }}</dd></div>
              <div><dt>执行员工</dt><dd>{{ employee?.name ?? '—' }}</dd></div>
              <div><dt>发起方式</dt><dd>{{ task.origin }}</dd></div>
              <div><dt>来源入口</dt><dd>{{ task.channel }}</dd></div>
              <div v-if="task.trigger"><dt>命中规则</dt><dd>{{ task.trigger }}</dd></div>
              <div v-if="task.origin === '人员交办'"><dt>发起人</dt><dd>{{ name(task.initiatorId) }}</dd></div>
              <div><dt>结果去向</dt><dd>{{ definition.destination }}</dd></div>
              <div><dt>任务编号</dt><dd>{{ task.id }}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </template>
    <el-empty v-else description="当前账号无法查看该任务" :image-size="88" />
  </section>
</template>

<style scoped>
.scenario-link { display: inline-flex; gap: 5px; align-items: center; color: var(--accent); }
.scenario-panel-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.scenario-links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.scenario-links :deep(.el-button), .scenario-navigation-actions .el-button { margin-left: 0; gap: 4px; }
.scenario-status { padding: 4px 8px; border-radius: 5px; background: var(--soft); color: var(--accent); font-size: 12px; white-space: nowrap; }
.scenario-status.review, .scenario-status.returned, .scenario-status.blocked { background: #fff1dc; color: #825012; }
.scenario-status.completed { background: #e9f5ed; color: #246744; }
.scenario-task-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 32%); align-items: start; gap: 14px; max-width: 1250px; margin-inline: auto; }
.scenario-task-main { display: grid; min-width: 0; gap: 14px; }
.scenario-panel { padding: 16px; min-width: 0; }
.scenario-panel h2 { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 15px; }
.scenario-panel-heading h2 { margin: 0; }
.scenario-panel p { overflow-wrap: anywhere; line-height: 1.6; }
.scenario-text { white-space: pre-wrap; }
.scenario-evidence, .scenario-info { margin: 8px 0 0; }
.scenario-evidence > div { padding: 8px 0; border-top: 1px solid var(--line); }
.scenario-evidence dt { font-weight: 650; }
.scenario-evidence dd { margin: 4px 0 0; color: var(--muted); }
.scenario-written { display: flex; align-items: center; gap: 6px; color: #246744; }
.scenario-timeline { margin: 0; padding: 0 0 0 14px; border-left: 1px solid var(--line); list-style: none; }
.scenario-timeline li { position: relative; }
.scenario-timeline li::before { position: absolute; inset: 6px auto auto -18px; width: 7px; height: 7px; border-radius: 100%; background: var(--accent); content: ''; }
.scenario-timeline li + li { margin-top: 14px; }
.scenario-timeline li > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.scenario-timeline time, .scenario-timeline p { color: var(--muted); font-size: 12px; }
.scenario-timeline p { margin: 4px 0 0; white-space: pre-wrap; }
.scenario-form { display: grid; gap: 8px; margin-top: 12px; }
.scenario-form > .el-button { justify-self: start; }
.scenario-steps { display: grid; gap: 6px; margin: 14px 0 0; padding: 0; list-style: none; }
.scenario-steps li { display: flex; justify-content: space-between; gap: 5px; font-size: 13px; }
.scenario-steps small { color: var(--muted); white-space: nowrap; }
.scenario-info > div { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 4px; padding: 5px 0; }
.scenario-info dt { color: var(--muted); }
.scenario-info dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 760px) {
  .scenario-task-layout { grid-template-columns: minmax(0, 1fr); }
}
</style>
