<script setup>
import { RouterView } from "vue-router";
import { provide, ref } from "vue";
import PrivacyModal from "@/components/PrivacyModal.vue";
import { providePrivacy } from "@/composables/usePrivacy";
import { createThemeController, themeInjectionKey } from "@/composables/useTheme";

const privacyOpen = ref(false);
const theme = createThemeController();
const { isDark } = theme;

function openPrivacy() {
  privacyOpen.value = true;
}

providePrivacy(openPrivacy);
provide(themeInjectionKey, theme);
</script>

<template>
  <div
    class="app-shell relative isolate min-h-dvh bg-background text-on-surface"
    :class="{ dark: isDark, 'app-locked': privacyOpen }"
  >
    <!-- Sidebar + main column; the router's layout route owns both. -->
    <div
      class="relative z-10 flex min-h-dvh"
      :inert="privacyOpen"
      :aria-hidden="privacyOpen ? 'true' : undefined"
    >
      <RouterView class="flex-1" />
    </div>
    <div
      id="app-modal-root"
      class="relative z-[60]"
      :inert="privacyOpen || undefined"
      :aria-hidden="privacyOpen ? 'true' : undefined"
    ></div>
    <!-- Same z as #app-modal-root; it must stay the later sibling so it paints above dialogs. -->
    <PrivacyModal v-model:open="privacyOpen" />
    <!-- A toast reports on the dialog above it, so it outranks every dialog and is never :inert. -->
    <div id="app-toast-root" class="relative z-[70]"></div>
  </div>
</template>
