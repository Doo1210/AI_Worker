<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, ClipboardList } from 'lucide-vue-next'
import type { Task } from '@/stores/platform'

const props = withDefaults(defineProps<{
  tasks: Task[]
  employeeId: string
  hideHeading?: boolean
}>(), { hideHeading: false })
const emit = defineEmits<{ supplement: [id: string] }>()

const statuses = {
  '待补充': { label: '待我补充', tone: 'waiting' },
  '进行中': { label: '进行中', tone: 'running' },
  '已完成': { label: '已完成', tone: 'done' },
} satisfies Record<Task['status'], { label: string; tone: string }>

const displayedTasks = computed(() => [
  ...props.tasks.filter(task => task.status === '待补充'),
  ...props.tasks.filter(task => task.status === '进行中'),
  ...props.tasks.filter(task => task.status === '已完成').slice(0, 2),
])

const employeeQuery = computed(() => ({ employee: props.employeeId }))
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}
</script>

<template>
  <div class="employee-work-cards">
    <header class="work-cards-header">
      <h2 v-if="!hideHeading" class="work-cards-heading">我交办的任务</h2>
      <RouterLink class="view-all" :to="{ name: 'employee-tasks', query: employeeQuery }">
        查看全部 <ChevronRight :size="13" aria-hidden="true" />
      </RouterLink>
    </header>

    <ul v-if="displayedTasks.length" class="work-card-list">
      <li v-for="task in displayedTasks" :key="task.id" class="work-card" :class="statuses[task.status].tone">
        <div class="work-card-heading">
          <h3>{{ task.title }}</h3>
          <span class="work-card-status">{{ statuses[task.status].label }}</span>
        </div>
        <p class="work-card-detail">{{ task.detail }}</p>
        <time class="work-card-date" :datetime="task.updatedAt">{{ formatDate(task.updatedAt) }}</time>
        <div class="work-card-actions">
          <RouterLink
            class="work-card-link"
            :to="{ name: 'employee-task', params: { taskId: task.id }, query: employeeQuery }"
            :aria-label="`${task.status === '已完成' ? '查看结果' : '查看进度'}：${task.title}`"
          >{{ task.status === '已完成' ? '查看结果' : '查看进度' }}</RouterLink>
          <button
            v-if="task.status === '待补充'"
            type="button"
            class="work-card-supplement"
            :aria-label="`补充信息：${task.title}`"
            @click="emit('supplement', task.id)"
          >补充信息</button>
        </div>
      </li>
    </ul>
    <div v-else class="work-cards-empty">
      <ClipboardList :size="21" aria-hidden="true" />
      <p>暂无交办任务</p>
    </div>
  </div>
</template>

<style scoped>
.employee-work-cards { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; }
.work-cards-header {
  display: flex; flex: 0 0 auto; align-items: baseline; gap: 8px; min-width: 0;
  padding: 12px; border-bottom: 1px solid var(--line);
}
.work-cards-heading { margin: 0; font-size: 14px; font-weight: 680; line-height: 20px; }
.view-all {
  display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; margin-left: auto;
  color: var(--accent); font-size: 12px; white-space: nowrap;
}
.view-all:hover, .work-card-link:hover { text-decoration: underline; }
.work-card-list {
  display: flex; flex: 1 1 auto; flex-direction: column; gap: 8px; min-height: 0;
  overflow-y: auto; overscroll-behavior-y: contain; margin: 0; padding: 10px 11px; list-style: none;
}
.work-card { flex: 0 0 auto; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.work-card.waiting { border-color: #efdfbb; }
.work-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; }
.work-card-heading h3 { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 13px; font-weight: 670; line-height: 1.5; }
.work-card-status { flex: 0 0 auto; padding: 2px 5px; border-radius: 5px; font-size: 11px; font-weight: 600; line-height: 1.45; }
.waiting .work-card-status { background: #fff3db; color: #825012; }
.running .work-card-status { background: var(--soft); color: var(--accent); }
.done .work-card-status { background: #e9f5ed; color: #246744; }
.work-card-detail {
  display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  margin: 6px 0 4px; color: var(--muted); font-size: 12px; line-height: 1.5;
}
.work-card-date { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.work-card-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.work-card-link, .work-card-supplement {
  display: inline-flex; align-items: center; min-height: 27px; color: var(--accent);
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.work-card-supplement { padding: 3px 8px; border: 0; border-radius: 6px; background: var(--soft); }
.work-card-supplement:hover { background: #e2eaff; }
.work-cards-empty { display: grid; justify-items: center; gap: 6px; padding: 25px 12px; color: var(--muted); font-size: 12px; }
.work-cards-empty p { margin: 0; }
</style>
