<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import EtReviewWorkspaceContent from './EtReviewWorkspaceContent.vue'
import type { EtReviewVersion } from './etReviewDrawing'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ openVersion: [version: EtReviewVersion, indices?: number[]] }>()
</script>

<template>
  <ElDrawer v-model="open" title="共享空间" size="min(500px, 100vw)" append-to-body destroy-on-close>
    <EtReviewWorkspaceContent @open-version="(version, indices) => emit('openVersion', version, indices)" />
  </ElDrawer>
</template>
