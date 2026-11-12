<script setup lang="ts">
import { Check, Flag } from 'lucide-vue-next'
import { projectStatuses, type ProjectTask } from '@/stores/projectWorkbench'

defineProps<{ task: ProjectTask; owner: string; late?: boolean }>()
defineEmits<{ open: []; toggle: [] }>()
</script>

<template>
  <article class="pm-task-row" :class="{ 'pm-task-done': task.status === 'done' }">
    <button
      type="button"
      class="pm-check"
      :aria-label="task.status === 'done' ? `撤销完成 ${task.title}` : `完成 ${task.title}`"
      :aria-pressed="task.status === 'done'"
      @click="$emit('toggle')"
    ><Check v-if="task.status === 'done'" :size="13" aria-hidden="true" /></button>
    <button type="button" class="pm-task-content" @click="$emit('open')">
      <strong><Flag v-if="task.milestone" :size="13" aria-hidden="true" />{{ task.title }}</strong>
      <small>{{ owner }} · {{ task.start === task.due ? task.due : `${task.start.slice(5)} – ${task.due.slice(5)}` }}</small>
      <small v-if="task.status === 'blocked' && task.blocker" class="pm-blocker-note">{{ task.blocker }}</small>
    </button>
    <span v-if="late" class="pm-chip pm-warn">逾期</span>
    <span v-else-if="task.milestone" class="pm-chip">里程碑</span>
    <span v-else-if="task.status === 'blocked' || task.status === 'doing'" class="pm-chip" :class="{ 'pm-warn': task.status === 'blocked' }">{{ projectStatuses[task.status] }}</span>
    <span v-if="task.priority === 'high' && task.status !== 'done'" class="pm-chip pm-priority">高优先</span>
  </article>
</template>
