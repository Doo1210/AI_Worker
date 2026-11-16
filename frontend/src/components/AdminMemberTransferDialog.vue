<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElCheckboxGroup, ElDrawer, ElMessage } from 'element-plus'
import { capabilityResponsibilities, useOrganizationAdminStore } from '@/stores/organizationAdmin'
import { usePlatformStore, type User } from '@/stores/platform'

const props = defineProps<{ member: User }>()
const open = defineModel<boolean>({ required: true })
const platform = usePlatformStore()
const organization = useOrganizationAdminStore()
const transfer = reactive({
  departmentId: '', title: '', revokeIds: [] as string[], handoverIds: [] as string[], successorId: '',
})
const destinations = computed(() => organization.departments.filter(department => department.id !== props.member.departmentId))
const grants = computed(() => organization.capabilities.filter(item => item.memberIds.includes(props.member.id)))
const duties = computed(() => organization.capabilities.flatMap(item => {
  const label = capabilityResponsibilities(item, props.member.id)
  return label ? [{ item, label }] : []
}))
const successors = computed(() => platform.users.filter(member => member.id !== props.member.id && member.status !== 'disabled'))

watch(open, visible => {
  if (!visible) return
  Object.assign(transfer, { departmentId: '', title: props.member.title, revokeIds: [], handoverIds: [], successorId: '' })
})

function submit() {
  if (!organization.transferMember(props.member.id, transfer)) {
    ElMessage.warning('请核对调入部门、授权及交接人员')
    return
  }
  open.value = false
  ElMessage.success('调岗交接已保存')
}
</script>

<template>
  <el-drawer v-model="open" title="调岗交接" size="min(100vw, 540px)" append-to-body>
    <el-form class="transfer-form" label-position="top" @submit.prevent="submit">
      <p class="transfer-member"><strong>{{ member.name }}</strong><span>{{ member.department }} · {{ member.title || '未设置岗位' }}</span></p>
      <div class="transfer-destination">
        <el-form-item label="调入部门" required>
          <el-select v-model="transfer.departmentId" aria-label="调入部门" placeholder="选择调入部门">
            <el-option v-for="item in destinations" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="调入后岗位">
          <el-input v-model="transfer.title" aria-label="调入后岗位" maxlength="60" />
        </el-form-item>
      </div>
      <section aria-labelledby="transfer-grants">
        <h3 id="transfer-grants">使用授权</h3>
        <p v-if="grants.length" class="muted">勾选此次要收回的直接授权，其余授权继续有效。调入后可单独分配所需能力。</p>
        <div v-if="grants.length" class="transfer-checks">
          <el-checkbox-group v-model="transfer.revokeIds" aria-label="要收回的授权">
            <el-checkbox v-for="item in grants" :key="item.id" :value="item.id">{{ item.name }} · {{ item.type }}</el-checkbox>
          </el-checkbox-group>
        </div>
        <p v-else class="muted">当前没有直接授权。</p>
      </section>
      <section aria-labelledby="transfer-duties">
        <h3 id="transfer-duties">负责维护</h3>
        <p v-if="duties.length" class="muted">勾选要交接的对象，并选择接手人。</p>
        <template v-if="duties.length">
          <div class="transfer-checks">
            <el-checkbox-group v-model="transfer.handoverIds" aria-label="要交接的职责">
              <el-checkbox v-for="{ item, label } in duties" :key="item.id" :value="item.id">{{ item.name }} · {{ label }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <el-form-item v-if="transfer.handoverIds.length" label="接手人" required>
            <el-select v-model="transfer.successorId" aria-label="接手人" placeholder="选择接手人" filterable>
              <el-option v-for="item in successors" :key="item.id" :value="item.id" :label="`${item.name} · ${item.department}`" />
            </el-select>
          </el-form-item>
        </template>
        <p v-else class="muted">当前没有维护或发布职责。</p>
      </section>
      <div class="transfer-actions">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" native-type="submit" :disabled="!transfer.departmentId || (!!transfer.handoverIds.length && !transfer.successorId)">确认调岗</el-button>
      </div>
    </el-form>
  </el-drawer>
</template>

<style scoped>
.transfer-form { display: grid; gap: 16px; }
.transfer-member { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin: 0; }
.transfer-member span, .transfer-form section p { color: var(--muted); font-size: 13px; }
.transfer-destination { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(178px, 100%), 1fr)); gap: 10px; }
.transfer-form .el-form-item { margin-bottom: 0; }
.transfer-form h3 { font-size: 14px; margin: 0 0 5px; }
.transfer-form section p { margin: 0; line-height: 1.5; }
.transfer-checks { margin: 8px 0; padding: 7px 10px; background: var(--canvas); border-radius: 8px; }
.transfer-checks .el-checkbox-group { display: grid; }
.transfer-checks .el-checkbox { height: auto; min-height: 30px; margin: 0; white-space: normal; }
.transfer-actions { display: flex; justify-content: flex-end; }
</style>
