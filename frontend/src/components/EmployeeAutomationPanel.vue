<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Play, Plus } from 'lucide-vue-next'
import {
  autonomousEventTypeLabels,
  autonomousTaskStatusLabels,
  useEmployeeAutonomousTasks,
  type AutonomousEventType,
  type EmployeeAutonomousRule,
  type EmployeeAutonomousRuleDraft,
} from '@/stores/employeeAutonomousTasks'
import { usePlatformStore } from '@/stores/platform'

const props = defineProps<{ employeeId: string; mode: 'rules' | 'runs' }>()
const emit = defineEmits<{ ran: [] }>()
const platform = usePlatformStore()
const { rules, simulationTasks, saveRule, simulateEvent } = useEmployeeAutonomousTasks()
const employeeRules = computed(() => rules.value.filter(rule => rule.employeeId === props.employeeId))
const employeeRuns = computed(() => simulationTasks.value.filter(run => run.employeeId === props.employeeId))
const activeMembers = computed(() => platform.users.filter(member => member.status !== 'disabled'))
const eventTypes = Object.keys(autonomousEventTypeLabels) as AutonomousEventType[]

const ruleOpen = ref(false)
const editingId = ref<string>()
const ruleDraft = reactive<EmployeeAutonomousRuleDraft>({ name: '', eventType: 'file-updated', conditionKeyword: '', ownerId: '', enabled: true })
const ruleError = ref('')
const simulationOpen = ref(false)
const simulationType = ref<AutonomousEventType>('file-updated')
const simulationText = ref('')
const simulationFeedback = ref('')
const runDetailId = ref('')
const selectedRun = computed(() => employeeRuns.value.find(run => run.id === runDetailId.value))
const runDetailOpen = computed({
  get: () => Boolean(selectedRun.value),
  set: (open) => { if (!open) runDetailId.value = '' },
})

watch(() => props.employeeId, () => {
  ruleOpen.value = false
  simulationOpen.value = false
  runDetailId.value = ''
})

function memberName(id: string) {
  return platform.users.find(member => member.id === id)?.name ?? '成员已移除'
}

function openRule(rule?: EmployeeAutonomousRule) {
  editingId.value = rule?.id
  Object.assign(ruleDraft, {
    name: rule?.name ?? '',
    eventType: rule?.eventType ?? 'file-updated',
    conditionKeyword: rule?.conditionKeyword ?? '',
    ownerId: rule?.ownerId ?? '',
    enabled: rule?.enabled ?? true,
  })
  ruleError.value = ''
  ruleOpen.value = true
}

function submitRule() {
  if (!ruleDraft.name.trim() || !ruleDraft.ownerId) {
    ruleError.value = '请填写规则名称，并选择业务负责人。'
    return
  }
  const saved = saveRule(props.employeeId, ruleDraft, editingId.value)
  if (!saved) {
    ruleError.value = '规则未能保存。请检查配置权限和业务负责人是否仍然有效。'
    return
  }
  ruleOpen.value = false
  ElMessage.success('规则已保存')
}

function toggleRule(rule: EmployeeAutonomousRule) {
  const saved = saveRule(props.employeeId, { ...rule, enabled: !rule.enabled }, rule.id)
  if (saved) ElMessage.success(saved.enabled ? '规则已启用' : '规则已停用')
  else ElMessage.error('规则状态未能保存。请检查配置权限和业务负责人。')
}

function openSimulation() {
  simulationType.value = employeeRules.value.find(rule => rule.enabled)?.eventType ?? 'file-updated'
  simulationText.value = ''
  simulationFeedback.value = ''
  simulationOpen.value = true
}

function runSimulation() {
  if (!simulationText.value.trim()) {
    simulationFeedback.value = '请输入事件内容。'
    return
  }
  const matched = simulateEvent(props.employeeId, simulationType.value, simulationText.value)
  if (!matched.length) {
    simulationFeedback.value = '未匹配到启用的规则。请核对事件类型和条件关键词。'
    return
  }
  simulationOpen.value = false
  ElMessage.success(`匹配 ${matched.length} 条规则，已创建模拟运行记录`)
  emit('ran')
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}
</script>

<template>
  <section class="automation-panel" :aria-label="mode === 'rules' ? '工作规则' : '运行记录'">
    <template v-if="mode === 'rules'">
      <div class="automation-toolbar">
        <el-button type="primary" :icon="Plus" @click="openRule()">新建规则</el-button>
        <el-button :icon="Play" @click="openSimulation">模拟事件</el-button>
      </div>
      <ul v-if="employeeRules.length" class="automation-list" aria-label="规则列表">
        <li v-for="rule in employeeRules" :key="rule.id" class="automation-card">
          <div class="automation-card-heading">
            <h3>{{ rule.name }}</h3>
            <el-tag size="small" :type="rule.enabled ? 'success' : 'info'">{{ rule.enabled ? '已启用' : '已停用' }}</el-tag>
          </div>
          <dl class="automation-fields rule-fields">
            <div><dt>事件类型</dt><dd>{{ autonomousEventTypeLabels[rule.eventType] }}</dd></div>
            <div><dt>条件关键词</dt><dd>{{ rule.conditionKeyword || '匹配任意事件内容' }}</dd></div>
            <div><dt>业务负责人</dt><dd>{{ memberName(rule.ownerId) }}</dd></div>
          </dl>
          <div class="automation-actions">
            <el-button size="small" @click="openRule(rule)">编辑</el-button>
            <el-button size="small" @click="toggleRule(rule)">{{ rule.enabled ? '停用' : '启用' }}</el-button>
          </div>
        </li>
      </ul>
      <el-empty v-else description="暂无工作规则" :image-size="70" />

      <el-dialog v-model="ruleOpen" :title="editingId ? '编辑规则' : '新建规则'" width="min(480px, calc(100vw - 26px))" append-to-body>
        <el-form class="automation-form" label-position="top" @submit.prevent="submitRule">
          <el-form-item label="规则名称" required>
            <el-input v-model="ruleDraft.name" maxlength="80" placeholder="例如 图纸版本核对" />
          </el-form-item>
          <el-form-item label="事件类型" required>
            <el-select v-model="ruleDraft.eventType" aria-label="事件类型">
              <el-option v-for="eventType in eventTypes" :key="eventType" :value="eventType" :label="autonomousEventTypeLabels[eventType]" />
            </el-select>
          </el-form-item>
          <el-form-item label="条件关键词">
            <el-input v-model="ruleDraft.conditionKeyword" maxlength="100" placeholder="留空时匹配任意事件内容" />
          </el-form-item>
          <el-form-item label="业务负责人" required>
            <el-select v-model="ruleDraft.ownerId" aria-label="业务负责人" placeholder="选择业务负责人" filterable>
              <el-option v-for="member in activeMembers" :key="member.id" :value="member.id" :label="member.name" />
            </el-select>
          </el-form-item>
          <p v-if="ruleError" class="form-feedback" role="alert">{{ ruleError }}</p>
          <div class="automation-actions">
            <el-button @click="ruleOpen = false">取消</el-button>
            <el-button native-type="submit" type="primary">保存规则</el-button>
          </div>
        </el-form>
      </el-dialog>

      <el-dialog v-model="simulationOpen" title="模拟事件" width="min(480px, calc(100vw - 26px))" append-to-body>
        <el-form class="automation-form" label-position="top" @submit.prevent="runSimulation">
          <el-form-item label="事件类型" required>
            <el-select v-model="simulationType" aria-label="事件类型" @change="simulationFeedback = ''">
              <el-option v-for="eventType in eventTypes" :key="eventType" :value="eventType" :label="autonomousEventTypeLabels[eventType]" />
            </el-select>
          </el-form-item>
          <el-form-item label="事件内容" required>
            <el-input v-model="simulationText" type="textarea" :rows="3" maxlength="250" placeholder="例如 南区产线图纸已更新" @input="simulationFeedback = ''" />
          </el-form-item>
          <p v-if="simulationFeedback" class="form-feedback" role="status">{{ simulationFeedback }}</p>
          <div class="automation-actions">
            <el-button @click="simulationOpen = false">取消</el-button>
            <el-button native-type="submit" type="primary">运行模拟</el-button>
          </div>
        </el-form>
      </el-dialog>
    </template>

    <template v-else>
      <ul v-if="employeeRuns.length" class="automation-list" aria-label="模拟运行列表">
        <li v-for="run in employeeRuns" :key="run.id" class="automation-card run-card">
          <div class="automation-card-heading">
            <h3>{{ run.title }}</h3>
            <el-tag size="small" :type="run.status === 'completed' ? 'success' : run.status === 'review' ? 'warning' : 'primary'">{{ autonomousTaskStatusLabels[run.status] }}</el-tag>
          </div>
          <p class="run-copy">{{ run.summary }}</p>
          <el-progress :percentage="run.progress" :stroke-width="5" :status="run.status === 'completed' ? 'success' : undefined" aria-label="执行进度" />
          <div class="run-footer">
            <time :datetime="run.updatedAt">更新于 {{ formatDate(run.updatedAt) }}</time>
            <el-button text type="primary" :aria-label="`查看详情 · ${run.title}`" @click="runDetailId = run.id">查看详情</el-button>
          </div>
        </li>
      </ul>
      <el-empty v-else description="暂无模拟运行记录" :image-size="70" />

      <el-dialog v-model="runDetailOpen" :title="selectedRun?.title ?? '运行详情'" width="min(560px, calc(100vw - 26px))" append-to-body>
        <div v-if="selectedRun" class="run-detail">
          <dl class="automation-fields detail-fields">
            <div v-if="selectedRun.ruleName"><dt>匹配规则</dt><dd>{{ selectedRun.ruleName }}</dd></div>
            <div><dt>触发事件</dt><dd>{{ selectedRun.trigger }}</dd></div>
            <div v-if="selectedRun.eventText"><dt>事件内容</dt><dd>{{ selectedRun.eventText }}</dd></div>
            <div><dt>业务负责人</dt><dd>{{ memberName(selectedRun.ownerId) }}</dd></div>
          </dl>
          <div class="automation-card-heading">
            <h3>执行进展</h3>
            <el-tag size="small" :type="selectedRun.status === 'completed' ? 'success' : selectedRun.status === 'review' ? 'warning' : 'primary'">{{ autonomousTaskStatusLabels[selectedRun.status] }}</el-tag>
          </div>
          <el-progress :percentage="selectedRun.progress" :stroke-width="7" :status="selectedRun.status === 'completed' ? 'success' : undefined" aria-label="执行进度" />
          <p class="run-copy">{{ selectedRun.summary }}</p>
          <div v-if="selectedRun.result" class="run-result">
            <h3>执行结果</h3>
            <p class="run-copy">{{ selectedRun.result }}</p>
          </div>
        </div>
      </el-dialog>
    </template>
  </section>
</template>

<style scoped>
.automation-panel { display: grid; gap: 12px; min-width: 0; }
.automation-toolbar, .automation-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.automation-toolbar .el-button, .automation-actions .el-button { margin-left: 0; }
.automation-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 295px), 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.automation-card { display: grid; align-content: start; gap: 10px; min-width: 0; padding: 13px; border: 1px solid var(--line); border-radius: 9px; }
.automation-card-heading, .run-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 10px; }
.automation-card-heading h3, .run-result h3 { margin: 0; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.automation-fields { display: grid; gap: 7px; margin: 0; font-size: 13px; line-height: 1.6; }
.automation-fields > div { display: grid; grid-template-columns: 6em minmax(0, 1fr); gap: 7px; }
.automation-fields dt, .run-footer time { color: var(--muted); }
.automation-fields dd, .run-copy { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.run-copy { color: var(--muted); font-size: 13px; line-height: 1.65; }
.automation-actions { justify-content: flex-end; }
.rule-fields + .automation-actions { padding-top: 8px; border-top: 1px solid var(--line); }
.automation-form .el-select { width: 100%; }
.form-feedback { margin: 0 0 12px; padding: 7px 10px; border-radius: 7px; background: #fff3db; color: #825012; font-size: 13px; line-height: 1.5; }
.run-card { grid-template-rows: auto 1fr auto auto; }
.run-footer { padding-top: 2px; border-top: 1px solid var(--line); }
.run-footer time { font-size: 12px; font-variant-numeric: tabular-nums; }
.run-footer .el-button { padding-inline: 4px; }
.run-detail { display: grid; gap: 11px; }
.detail-fields { padding: 10px; border-radius: 8px; background: var(--canvas); }
.run-result { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
</style>
