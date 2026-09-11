<template>
  <!-- role="none" keeps the rows attached to the parent menu in the accessibility tree. -->
  <div role="none">
    <div role="group" :aria-label="accountGroupLabel">
      <div class="flex min-h-8 items-center justify-between gap-2 px-3 pb-1" aria-hidden="true">
        <span class="text-caption text-on-surface-variant">账号切换</span>
        <span class="shrink-0 text-caption text-on-surface-variant tabular-nums">{{ accounts.length }} 个</span>
      </div>

      <p v-if="!accounts.length" class="px-3 py-2 text-caption text-on-surface-variant">
        还没有保存的账号
      </p>

      <AccountList
        v-else
        :accounts="accounts"
        :current-id="currentId"
        in-menu
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import AccountList from "@/components/AccountList.vue";

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  currentId: { type: String, default: "" },
});

const emit = defineEmits(["select"]);
const accountGroupLabel = computed(() => `账号切换（${props.accounts.length} 个）`);
</script>
