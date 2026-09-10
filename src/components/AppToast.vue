<template>
  <!-- Outside every :inert subtree, so a toast raised by a dialog stays visible and announced. -->
  <Teleport defer to="#app-toast-root">
    <!-- The live region is always mounted; only its content swaps, which is what screen readers announce. -->
    <div
      class="pointer-events-none fixed inset-x-4 bottom-6 flex justify-center"
      role="status"
      aria-live="polite"
    >
      <Transition
        enter-active-class="transition duration-250 ease-emphasized"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-accelerate"
        leave-to-class="translate-y-2 opacity-0"
      >
        <div v-if="message" class="flex max-w-md min-w-0 items-center gap-2 rounded-control bg-surface-raised px-4 py-3 text-body text-on-surface shadow-e1">
          <CircleAlert v-if="kind === 'error'" :size="18" class="shrink-0 text-danger-ink" aria-hidden="true" />
          <Download v-else-if="kind === 'download'" :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
          <Check v-else :size="18" class="shrink-0 text-primary-ink" aria-hidden="true" />
          <span class="min-w-0">{{ message }}</span>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { Check, CircleAlert, Download } from "@lucide/vue";

defineProps({
  message: { type: String, default: "" },
  kind: { type: String, default: "ok" },
});
</script>
