<script setup lang="ts">
import { Ellipsis, FileText, Folder, LogOut, Pencil, Trash2, UsersRound } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  cards: {
    id: string
    name: string
    ownerName: string
    collaboratorCount: number
    fileCount: number
    updatedAt: string
    permission?: string
    isOwner: boolean
    to: RouteLocationRaw
  }[]
}>()

const ownerActions = [
  { id: 'rename', label: '重命名', icon: Pencil, destructive: false },
  { id: 'members', label: '管理成员', icon: UsersRound, destructive: false },
  { id: 'delete', label: '删除空间', icon: Trash2, destructive: true },
] as const
const memberActions = [{ id: 'leave', label: '退出空间', icon: LogOut, destructive: true }] as const
type SpaceAction = (typeof ownerActions | typeof memberActions)[number]['id']
const emit = defineEmits<{ action: [command: SpaceAction, spaceId: string] }>()

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
})
const monthDayFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const today = new Date()
  const day = dateFormat.format(date)
  if (day === dateFormat.format(today)) return timeFormat.format(date)
  return date.getFullYear() === today.getFullYear() ? monthDayFormat.format(date) : day
}
</script>

<template>
  <ul class="workspace-card-grid" role="list" aria-label="共享工作空间">
    <li v-for="card in cards" :key="card.id">
      <RouterLink
        :to="card.to"
        class="workspace-card"
        :aria-labelledby="'shared-space-name-' + card.id"
        :aria-describedby="'shared-space-owner-' + card.id + ' shared-space-stats-' + card.id
          + (card.permission ? ' shared-space-permission-' + card.id : '')"
      >
        <div class="card-heading">
          <span class="card-icon"><Folder :size="17" aria-hidden="true" /></span>
          <div class="card-title">
            <span class="card-name" :id="'shared-space-name-' + card.id" :title="card.name">{{ card.name }}</span>
            <span class="card-owner" :id="'shared-space-owner-' + card.id" :title="card.ownerName">
              <span class="visually-hidden">所有人 </span>{{ card.ownerName }}
            </span>
            <span v-if="card.permission" class="card-permission" :id="'shared-space-permission-' + card.id" title="我的权限">
              <span class="visually-hidden">我的权限 </span>{{ card.permission }}
            </span>
          </div>
        </div>
        <div class="card-stats" :id="'shared-space-stats-' + card.id">
          <span class="card-count" title="协作者">
            <UsersRound :size="15" aria-hidden="true" />
            <span class="visually-hidden">协作者 </span>{{ card.collaboratorCount }}
          </span>
          <span class="card-count" title="文件">
            <FileText :size="15" aria-hidden="true" />
            <span class="visually-hidden">文件 </span>{{ card.fileCount }}
          </span>
          <span class="card-updated" title="更新时间">
            <span class="visually-hidden">更新时间 </span>
            <time :datetime="card.updatedAt">{{ formatUpdatedAt(card.updatedAt) }}</time>
          </span>
        </div>
      </RouterLink>
      <el-dropdown class="card-menu" trigger="click" placement="bottom-end" @command="emit('action', $event, card.id)">
        <button type="button" class="card-menu-trigger" :aria-label="'更多操作：' + card.name" title="更多操作">
          <Ellipsis :size="18" aria-hidden="true" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="action in card.isOwner ? ownerActions : memberActions" :key="action.id"
              :command="action.id" :icon="action.icon" :class="{ 'card-menu-danger': action.destructive }">
              {{ action.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </li>
  </ul>
</template>

<style scoped>
.workspace-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(278px, 100%), 1fr));
  gap: 12px;
  margin: 0;
  padding: 16px;
  list-style: none;
}
.workspace-card-grid > li { --card-menu-size: 28px; position: relative; min-width: 0; }
.workspace-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
}
.workspace-card:hover {
  border-color: var(--el-color-primary-light-7);
  background: #fafbff;
}
.workspace-card:focus-visible { outline-offset: 2px; }
.card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.card-icon {
  display: grid;
  flex: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 7px;
  background: #fff2d6;
  color: #9a621a;
}
.card-icon svg { fill: #ffdf97; stroke-width: 1.7; }
.card-title {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 8px;
  min-width: 0;
}
.card-name {
  grid-column: 1 / -1;
  margin-inline-end: calc(var(--card-menu-size) + 6px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
}
.card-owner {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.card-permission {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--soft);
  color: var(--accent);
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
}
.card-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding-top: 5px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.card-count { display: inline-flex; align-items: center; gap: 5px; }
.card-count svg { flex: none; }
.card-updated { margin-inline-start: auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.card-menu { position: absolute; inset: 3px 8px auto auto; }
.card-menu-trigger {
  display: grid;
  place-items: center;
  width: var(--card-menu-size);
  height: var(--card-menu-size);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
}
.card-menu-trigger:hover, .card-menu-trigger[aria-expanded="true"] {
  color: var(--accent);
}
.card-menu-danger { color: var(--el-color-danger); }
@media (hover: hover) and (pointer: fine) {
  .card-menu { opacity: 0; pointer-events: none; }
  .workspace-card-grid > li:is(:hover, :focus-within) > .card-menu,
  .card-menu:has(.card-menu-trigger[aria-expanded="true"]) {
    opacity: 1;
    pointer-events: auto;
  }
}
@container (max-width: 380px) {
  .workspace-card-grid { gap: 8px; padding: 10px; }
}
</style>
