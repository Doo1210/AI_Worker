<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Search, UsersRound } from 'lucide-vue-next'
import type { Employee } from '@/stores/platform'

type EmployeeOption = Pick<Employee, 'id' | 'name' | 'role' | 'color'>

const props = defineProps<{
  employees: readonly EmployeeOption[]
  selectedId: string
  counts: ReadonlyMap<string, number>
  total: number
}>()
const emit = defineEmits<{ select: [id: string] }>()
const headingId = useId()
const search = ref('')
const filteredEmployees = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.employees.filter(employee =>
    employee.name.toLocaleLowerCase().includes(query) || employee.role.toLocaleLowerCase().includes(query),
  )
})
</script>

<template>
  <section class="panel employee-picker" :aria-labelledby="headingId">
    <h2 :id="headingId">数字员工</h2>
    <label class="employee-search">
      <Search :size="15" aria-hidden="true" />
      <input v-model="search" type="search" aria-label="按姓名或岗位搜索员工" placeholder="搜索姓名或岗位" />
    </label>

    <ul class="employee-options" aria-label="员工筛选">
      <li>
        <button type="button" class="employee-option" :aria-pressed="selectedId === ''" @click="emit('select', '')">
          <span class="employee-avatar all-employees" aria-hidden="true"><UsersRound :size="17" /></span>
          <strong class="employee-name">全部员工</strong>
          <span class="employee-count">{{ total }}<span class="visually-hidden"> 项任务</span></span>
        </button>
      </li>
      <li v-for="employee in filteredEmployees" :key="employee.id">
        <button type="button" class="employee-option" :aria-pressed="selectedId === employee.id" @click="emit('select', employee.id)">
          <span class="employee-avatar" :style="{ '--employee-color': employee.color }" aria-hidden="true">{{ employee.name.slice(0, 1) }}</span>
          <span class="employee-info">
            <strong class="employee-name" :title="employee.name">{{ employee.name }}</strong>
            <small class="employee-role" :title="employee.role">{{ employee.role }}</small>
          </span>
          <span class="employee-count">{{ counts.get(employee.id) ?? 0 }}<span class="visually-hidden"> 项任务</span></span>
        </button>
      </li>
    </ul>
    <p v-if="!filteredEmployees.length" class="employee-empty" role="status">
      {{ search.trim() ? '没有匹配的员工' : '暂无可查看的员工' }}
    </p>
  </section>
</template>

<style scoped>
.employee-picker { min-width: 0; align-self: start; padding: 12px; }
.employee-picker h2 { margin: 0 0 9px; font-size: 14px; font-weight: 650; }
.employee-search {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
}
.employee-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.employee-search svg { flex: none; }
.employee-search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.employee-options { display: grid; gap: 4px; margin: 9px 0 0; padding: 0; list-style: none; }
.employee-option {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 45px;
  padding: 6px 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.employee-option:hover { background: var(--canvas); }
.employee-option[aria-pressed='true'] { border-color: #dbe5ff; background: var(--soft); color: var(--accent); }
.employee-option:focus-visible { outline-offset: -2px; }
.employee-avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  color: var(--employee-color, var(--accent));
  background: var(--soft);
  background: color-mix(in srgb, var(--employee-color, var(--accent)) 13%, white);
  font-size: 13px;
  font-weight: 700;
}
.employee-avatar.all-employees { background: var(--sidebar); color: var(--muted); }
.employee-info { min-width: 0; }
.employee-name, .employee-role { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.employee-name { font-size: 13px; font-weight: 650; }
.employee-role { margin-top: 2px; color: var(--muted); font-size: 11px; }
.employee-count {
  position: relative;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--sidebar);
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.employee-option[aria-pressed='true'] .employee-count { background: var(--surface); color: var(--accent); }
.employee-empty { margin: 8px 7px 0; color: var(--muted); font-size: 12px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@container (max-width: 820px) {
  .employee-options { display: flex; gap: 6px; padding-bottom: 3px; overflow-x: auto; scrollbar-width: thin; }
  .employee-options li { flex: none; max-width: 100%; }
  .employee-option { grid-template-columns: 30px minmax(0, max-content) auto; min-height: 42px; border-color: var(--line); }
  .employee-info { max-width: 150px; }
}
</style>
