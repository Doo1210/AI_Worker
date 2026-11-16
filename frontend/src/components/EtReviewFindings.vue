<script setup lang="ts">
import type { EtReviewFinding } from './etReviewDrawing'

defineProps<{ findings: EtReviewFinding[] }>()
const emit = defineEmits<{ locate: [indices: number[]] }>()
</script>

<template>
  <ul class="review-findings">
    <li v-for="finding in findings" :key="finding.layer">
      <div class="finding-heading">
        <strong>{{ finding.layer }}</strong>
        <button type="button" :aria-label="`定位已确认依据：${finding.layer}`" @click="emit('locate', finding.entityIndices)">定位依据</button>
      </div>
      <small>{{ finding.evidence }}</small>
      <p>{{ finding.conclusion }}</p>
    </li>
  </ul>
</template>

<style scoped>
.review-findings { display: grid; gap: 7px; margin: 8px 0 0; padding: 0; list-style: none; }
.review-findings li { display: grid; gap: 3px; padding: 6px 0 0; border-top: 1px solid var(--line); }
.finding-heading { display: flex; justify-content: space-between; align-items: center; gap: 7px; }
strong { font-size: 13px; overflow-wrap: anywhere; }
small { color: var(--muted); font-size: 11px; }
p { margin: 0; color: #42516a; font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
button { padding: 3px 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; font-weight: 620; white-space: nowrap; }
button:hover { text-decoration: underline; }
</style>
