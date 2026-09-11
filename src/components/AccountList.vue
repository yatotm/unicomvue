<template>
  <!-- 账号行。顶栏的账号菜单和设置页的账号区之前是**逐字相同**的两份 markup，只有语义
       （menuitemradio / aria-pressed）和两个图标尺寸不一样——典型的「同一件事打了两次补丁」。
       这里合成一份，语义由 inMenu 切换，尺寸只有一套。 -->
  <div class="grid gap-1" :role="inMenu ? 'none' : undefined">
    <button
      v-for="account in accounts"
      :key="account.id"
      type="button"
      :class="[NAV_ROW, 'min-h-12 w-full py-2 text-left', account.id === currentId ? 'bg-surface-sunken' : HOVER_OVERLAY]"
      :role="inMenu ? 'menuitemradio' : undefined"
      :aria-checked="inMenu ? account.id === currentId : undefined"
      :aria-pressed="inMenu ? undefined : account.id === currentId"
      @click="emit('select', account.id)"
    >
      <span
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-dot"
        :class="account.id === currentId
          ? 'bg-primary text-on-primary'
          : 'bg-surface-sunken text-on-surface-variant'"
      >
        <UserRound :size="16" :stroke-width="1.5" aria-hidden="true" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-body text-on-surface tabular-nums">{{ accountDisplayName(account) }}</span>
        <span class="block truncate text-caption text-on-surface-muted">{{ accountPackageDescription(account) }}</span>
      </span>

      <Check
        v-if="account.id === currentId"
        :size="16"
        class="shrink-0 text-primary-ink"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup>
import { Check, UserRound } from "@lucide/vue";
import { accountDisplayName, accountPackageDescription } from "@/domain/accounts.js";
import { HOVER_OVERLAY, NAV_ROW } from "@/utils/ui";

defineProps({
  accounts: { type: Array, default: () => [] },
  currentId: { type: String, default: "" },
  inMenu: { type: Boolean, default: false },
});

const emit = defineEmits(["select"]);
</script>
