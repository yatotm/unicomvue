<template>
  <!-- role="none" keeps the rows attached to the parent menu in the accessibility tree. -->
  <div role="none">
    <div role="group" :aria-label="accountGroupLabel">
      <div class="flex min-h-8 items-center justify-between gap-2 px-3 pb-1" aria-hidden="true">
        <span class="text-caption text-on-surface-variant">账号切换</span>
        <span class="shrink-0 text-caption text-on-surface-variant tabular-nums">{{ accounts.length }} 个</span>
      </div>

      <p
        v-if="!accounts.length"
        class="px-3 py-2 text-caption text-on-surface-variant"
      >
        还没有保存的账号
      </p>

      <div v-else class="grid gap-1" role="none">
        <button
          v-for="account in accounts"
          :key="account.id"
          type="button"
          role="menuitemradio"
          class="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          :class="account.id === currentId
            ? 'bg-surface'
            : 'hover:bg-hover-overlay active:bg-pressed-overlay'"
          :aria-checked="account.id === currentId"
          @click="emitSelect(account.id)"
        >
          <span
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-dot"
            :class="account.id === currentId
              ? 'bg-primary text-on-primary'
              : 'bg-surface-sunken text-on-surface-variant'"
          >
            <UserRound :size="16" aria-hidden="true" />
          </span>

          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-body text-on-surface"
            >{{ accountDisplayName(account) }}</span>
            <span
              class="block truncate text-caption text-on-surface-variant"
            >{{ accountPackageDescription(account) }}</span>
          </span>

          <Check
            v-if="account.id === currentId"
            :size="18"
            class="shrink-0 text-primary-ink"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Check, UserRound } from "@lucide/vue";
import { accountDisplayName, accountPackageDescription } from "@/domain/accounts.js";

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  currentId: { type: String, default: "" },
});

const emit = defineEmits(["select"]);
const accountGroupLabel = computed(() => `账号切换（${props.accounts.length} 个）`);

function emitSelect(accountId) {
  emit("select", accountId);
}
</script>
