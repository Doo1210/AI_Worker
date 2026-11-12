<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { Activity, ChevronRight, ClipboardList, MessageSquare, UsersRound } from 'lucide-vue-next'
import { employeeExamples } from '@/components/employeeExamples'
import { autonomousTaskStatusLabels, useEmployeeAutonomousTasks } from '@/stores/employeeAutonomousTasks'
import { usePlatformStore } from '@/stores/platform'

const platform = usePlatformStore()
const route = useRoute()
const router = useRouter()
const { visibleTasks } = useEmployeeAutonomousTasks()
const autonomousStatuses = ['running', 'review', 'completed'] as const

const search = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => {
    void router.replace({ name: 'employee-directory', query: { q: value || undefined } })
  },
})
const query = computed(() => search.value.trim().toLocaleLowerCase())
const employees = computed(() => platform.visibleEmployees
  .map(employee => {
    const examples = employeeExamples(employee)
    return { ...employee, examples: examples.length ? examples : ['沟通工作要求', '交办并跟进任务'] }
  })
  .filter(employee => !query.value || [employee.name, employee.role, employee.description, ...employee.examples]
    .some(value => value.toLocaleLowerCase().includes(query.value))))

const autonomousCounts = computed(() => {
  const countsByEmployee = new Map<string, Record<typeof autonomousStatuses[number], number>>()
  for (const task of visibleTasks.value) {
    const counts = countsByEmployee.get(task.employeeId) ?? { running: 0, review: 0, completed: 0 }
    counts[task.status] += 1
    countsByEmployee.set(task.employeeId, counts)
  }
  return countsByEmployee
})

function contactRoute(id: string, mode?: 'chat' | 'task') {
  return { name: 'employee-contact', params: { id }, query: { mode, q: search.value || undefined } }
}

function taskOverviewRoute(id: string) {
  return { name: 'employee-task-overview', query: { employee: id } }
}
</script>

<template>
  <section class="page employee-directory" aria-labelledby="directory-title">
    <header class="page-header directory-header">
      <div>
        <h1 id="directory-title">数字员工目录</h1>
        <p class="muted" aria-live="polite">
          {{ query ? '找到 ' + employees.length + ' 位员工' : employees.length + ' 位可联系的员工' }}
        </p>
      </div>
      <el-input
        v-model="search"
        class="employee-search"
        :prefix-icon="Search"
        placeholder="搜索员工、岗位或任务"
        aria-label="搜索数字员工"
        clearable
      />
    </header>

    <div v-if="employees.length" class="employee-grid">
      <article v-for="employee in employees" :key="employee.id" class="panel employee-card">
        <div class="employee-identity">
          <span class="employee-avatar" :style="{ '--employee-color': employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
          <div>
            <h2><RouterLink :to="contactRoute(employee.id)">{{ employee.name }}</RouterLink></h2>
            <p>{{ employee.role }}</p>
          </div>
        </div>
        <p class="employee-description">{{ employee.description || '暂未填写岗位说明。' }}</p>
        <div class="example-work">
          <h3>可交办的任务</h3>
          <ul>
            <li v-for="example in employee.examples" :key="example">{{ example }}</li>
          </ul>
        </div>

        <RouterLink
          class="autonomous-summary"
          :class="{ 'is-empty': !autonomousCounts.has(employee.id) }"
          :to="taskOverviewRoute(employee.id)"
          :aria-label="'查看任务：' + employee.name"
          :aria-describedby="`autonomous-heading-${employee.id} autonomous-counts-${employee.id}`"
        >
          <span class="autonomous-heading">
            <strong :id="'autonomous-heading-' + employee.id"><Activity :size="15" aria-hidden="true" />自主任务进展</strong>
            <span class="autonomous-link">查看任务 <ChevronRight :size="13" aria-hidden="true" /></span>
          </span>
          <span :id="'autonomous-counts-' + employee.id" class="autonomous-counts">
            <template v-if="autonomousCounts.has(employee.id)">
              <template v-for="status in autonomousStatuses" :key="status">
                <span v-if="autonomousCounts.get(employee.id)?.[status]" :class="status">
                  {{ autonomousTaskStatusLabels[status] }} {{ autonomousCounts.get(employee.id)?.[status] }}
                </span>
              </template>
            </template>
            <template v-else>暂无可查看的自主任务</template>
          </span>
        </RouterLink>

        <div class="employee-actions">
          <RouterLink class="employee-action contact-action" :to="contactRoute(employee.id, 'chat')" :aria-label="'与' + employee.name + '沟通'">
            <MessageSquare :size="15" :stroke-width="1.8" aria-hidden="true" />沟通
          </RouterLink>
          <RouterLink class="employee-action" :to="contactRoute(employee.id, 'task')" :aria-label="'交办任务给' + employee.name">
            <ClipboardList :size="15" :stroke-width="1.8" aria-hidden="true" />交办任务
          </RouterLink>
        </div>
      </article>
    </div>

    <div v-else class="panel directory-empty">
      <UsersRound :size="25" :stroke-width="1.6" aria-hidden="true" />
      <h2>{{ query ? '没有匹配的数字员工' : '暂无可联系的数字员工' }}</h2>
      <p v-if="!query">获得使用授权后，员工会出现在这里。</p>
      <el-button v-else text type="primary" @click="search = ''">清除搜索</el-button>
    </div>
  </section>
</template>

<style scoped>
.directory-header { align-items: center; margin-bottom: 16px; }
.directory-header p { font-size: 13px; }
.employee-search { width: min(100%, 250px); }
.employee-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(268px, 100%), 1fr)); gap: 14px; }
.employee-card { display: flex; min-width: 0; flex-direction: column; padding: 17px; }
.employee-identity { display: flex; align-items: center; gap: 11px; min-width: 0; }
.employee-identity > div { min-width: 0; }
.employee-avatar {
  display: grid; flex: 0 0 42px; place-items: center; height: 42px; border-radius: 10px;
  color: var(--employee-color, var(--accent)); background: #edf2ff;
  background: color-mix(in srgb, var(--employee-color, var(--accent)) 13%, white);
  font-size: 17px; font-weight: 700;
}
.employee-identity h2 { margin: 0; color: var(--text); font-size: 16px; font-weight: 680; overflow-wrap: anywhere; }
.employee-identity h2 a:hover { color: var(--accent); text-decoration: underline; }
.employee-identity p { margin: 4px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.employee-description { flex: 1; margin: 13px 0; color: var(--muted); font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
.example-work h3 { margin: 0 0 7px; color: var(--text); font-size: 12px; font-weight: 650; }
.example-work ul { display: flex; flex-wrap: wrap; gap: 5px; padding: 0; margin: 0; list-style: none; }
.example-work li { padding: 4px 7px; border-radius: 5px; background: var(--soft); color: var(--muted); font-size: 12px; }
.autonomous-summary { display: grid; gap: 6px; min-height: 68px; margin-top: 13px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); font-size: 12px; }
a.autonomous-summary:hover { border-color: #b4c6f6; background: #f6f8ff; }
.autonomous-heading, .autonomous-heading strong, .autonomous-link { display: flex; align-items: center; gap: 5px; }
.autonomous-heading { justify-content: space-between; flex-wrap: wrap; }
.autonomous-heading strong { color: var(--text); font-weight: 650; }
.autonomous-heading strong svg, .autonomous-link { color: var(--accent); }
.autonomous-link { white-space: nowrap; }
.autonomous-counts { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.autonomous-counts > span { padding: 2px 5px; border-radius: 5px; white-space: nowrap; }
.autonomous-counts .running { color: #2c51b9; background: #eaf0ff; }
.autonomous-counts .review { color: #825012; background: #fff2d7; }
.autonomous-counts .completed { color: #246744; background: #e9f5ed; }
.autonomous-summary.is-empty { color: var(--muted); }
.employee-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
.employee-action {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px;
  padding: 5px 9px; border-radius: 7px; color: var(--muted); font-size: 12px; font-weight: 600;
}
.employee-action:hover { background: var(--soft); color: var(--text); }
.contact-action { background: #edf2ff; color: var(--accent); }
.contact-action:hover { background: #e2eaff; color: var(--accent-hover); }
.directory-empty { display: grid; justify-items: center; gap: 8px; padding: 36px 16px; text-align: center; }
.directory-empty > svg { color: var(--muted); }
.directory-empty h2 { margin: 0; font-size: 15px; }
.directory-empty p { margin: 0; color: var(--muted); font-size: 13px; }
@media (max-width: 700px) {
  .directory-header { flex-direction: column; align-items: stretch; }
  .employee-search { width: 100%; }
}
</style>
