<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <header class="page-controls">
    <div class="page-title-row">
      <div class="page-title-start">
        <slot name="back" />
        <h1>{{ title }}</h1>
      </div>
      <div v-if="$slots.actions" class="page-toolbar-controls">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </header>
</template>
