<template>
  <!-- 顶栏只有三个控件：刷新、截图、账号。页面标题由 `document.title` 和主区里那个只给
       读屏器的一级标题承担——屏幕上再印一遍「看板 / 套餐余量总览」只是又一块要读的文字。 -->
  <header
    class="app-header sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-end gap-2 px-4 py-2 lg:px-4"
    :style="surfaceStyle"
  >
    <div class="flex shrink-0 items-center gap-2">
      <AppButton
        variant="filled"
        :disabled="isLoading"
        :aria-busy="isLoading"
        title="立即重新查询余量"
        @click="emit('refresh')"
      >
        <RefreshCw :size="15" :stroke-width="1.6" class="shrink-0" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
        刷新
      </AppButton>

      <AppButton
        variant="shell"
        :disabled="!canShare || isSharing"
        :aria-busy="isSharing"
        :title="shareTitle"
        aria-label="截图分享当前页面"
        @click="emit('share')"
      >
        <LoaderCircle v-if="isSharing" :size="15" class="shrink-0 animate-spin" aria-hidden="true" />
        <Camera v-else :size="15" :stroke-width="1.4" class="shrink-0" aria-hidden="true" />
        <span class="hidden sm:inline">截图</span>
      </AppButton>

      <div class="relative">
        <AppButton
          ref="accountButtonRef"
          variant="shell"
          :title="`切换账号${currentAccountLabel ? `（${currentAccountLabel}）` : ''}`"
          aria-label="账号切换"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
          @keydown="handleTriggerKeydown"
        >
          <UserRound :size="15" :stroke-width="1.4" class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 max-w-32 truncate tabular-nums">{{ currentAccountLabel || "账号" }}</span>
          <ChevronDown
            :size="12"
            :stroke-width="1.6"
            class="hidden shrink-0 transition-transform duration-150 ease-standard sm:block"
            :class="{ 'rotate-180': menuOpen }"
            aria-hidden="true"
          />
        </AppButton>

        <div
          v-if="menuOpen"
          ref="menuPanelRef"
          class="absolute right-0 top-12 z-30 max-h-[min(70dvh,34rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card bg-surface-raised p-2 shadow-e3"
          role="menu"
          aria-label="账号切换"
          @keydown="handleMenuKeydown"
        >
          <AccountMenu
            :accounts="accounts"
            :current-id="activeAccountId"
            @select="handleSelect"
          />

          <div class="my-2 h-px bg-divider" role="separator"></div>

          <RouterLink
            :to="{ name: 'settings' }"
            role="menuitem"
            :class="[NAV_ROW, HOVER_OVERLAY, 'w-full text-primary-ink']"
            @click="closeMenu"
          >
            <Settings :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            账号与显示设置
          </RouterLink>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import {
  Camera,
  ChevronDown,
  LoaderCircle,
  RefreshCw,
  Settings,
  UserRound,
} from "@lucide/vue";
import AccountMenu from "@/components/AccountMenu.vue";
import AppButton from "@/components/AppButton.vue";
import { useDismissable } from "@/composables/useDismissable";
import { useHeaderScrollSurface } from "@/composables/useHeaderScrollSurface";
import { HOVER_OVERLAY, NAV_ROW } from "@/utils/ui";

const MENU_ITEM_SELECTOR = "[role='menuitem'],[role='menuitemradio']";
const MENU_KEY_STEPS = { ArrowDown: 1, ArrowUp: -1 };

const props = defineProps({
  isLoading: { type: Boolean, default: false },
  isSharing: { type: Boolean, default: false },
  canShare: { type: Boolean, default: false },
  shareHint: { type: String, default: "" },
  accounts: { type: Array, default: () => [] },
  activeAccountId: { type: String, default: "" },
  currentAccountLabel: { type: String, default: "" },
});

const emit = defineEmits(["refresh", "share", "select-account"]);

const menuOpen = ref(false);
const accountButtonRef = useTemplateRef("accountButtonRef");
const menuPanelRef = useTemplateRef("menuPanelRef");
const { surfaceStyle } = useHeaderScrollSurface();

// 外部按下、Escape、焦点离开、路由变化——四种关闭方式全部来自同一个共享原语，
// 顶栏自己不再铺一个「透明遮罩按钮」（那个按钮的定位祖先是带 backdrop-filter 的顶栏，
// 所以它根本没铺满视口，只盖住了顶栏那一条）。
const { dismiss: dismissMenu } = useDismissable(menuOpen, {
  panel: menuPanelRef,
  trigger: accountButtonRef,
});

const shareTitle = computed(() => props.shareHint || "把当前页面的数据区截图并复制或下载");

function closeMenu() {
  menuOpen.value = false;
}

function toggleMenu() {
  if (menuOpen.value) dismissMenu();
  else menuOpen.value = true;
}

function handleSelect(accountId) {
  closeMenu();
  emit("select-account", accountId);
}

function menuItems(panel) {
  return Array.from(panel?.querySelectorAll(MENU_ITEM_SELECTOR) ?? []).filter((item) => !item.disabled);
}

// The panel owns the roving focus, so it spans every item the menu renders, not just one fragment.
function handleMenuKeydown(event) {
  const step = MENU_KEY_STEPS[event.key];
  const isEdgeKey = event.key === "Home" || event.key === "End";
  if (step === undefined && !isEdgeKey) return;

  const items = menuItems(event.currentTarget);
  if (!items.length) return;

  event.preventDefault();
  if (isEdgeKey) {
    items.at(event.key === "Home" ? 0 : -1).focus();
    return;
  }

  const current = items.indexOf(event.target);
  const next = current < 0 ? 0 : (current + step + items.length) % items.length;
  items[next].focus();
}

async function handleTriggerKeydown(event) {
  const step = MENU_KEY_STEPS[event.key];
  if (step === undefined) return;

  event.preventDefault();
  menuOpen.value = true;
  await nextTick();
  menuItems(menuPanelRef.value).at(step > 0 ? 0 : -1)?.focus();
}

defineExpose({ closeMenu });
</script>

<style scoped>
/* 顶栏的**面**在 base.css 的 `.app-header` 上：和侧栏同一层纸色、薄一档，铺在带渐变的画布上。
   这里只写它随滚动变化的那三样，而且它们只在 lg: 以下才会动——lg: 以上滚的是主区，顶栏在滚动
   容器外面，进度恒为 0，于是它就是一块纯粹的半透明外壳面，和侧栏读起来是一家人。
   lg: 以下内容真的从它底下过：那时候 background-image 这一层把外壳面盖成不透明（内容不许
   透到数字上），发丝线画出来，模糊也才有可模糊的东西——这一层不是空操作，§16.2 有实测。 */
.app-header {
  --header-background-mix: 0%;
  --header-border-mix: 0%;
  --header-backdrop-blur: 0px;

  background-image: linear-gradient(
    color-mix(in srgb, var(--ui-background) var(--header-background-mix), transparent),
    color-mix(in srgb, var(--ui-background) var(--header-background-mix), transparent)
  );
  box-shadow:
    inset 0 1px 0 var(--ui-shell-sheen),
    inset 0 -1px 0 color-mix(in srgb, var(--ui-divider) var(--header-border-mix), transparent);
  -webkit-backdrop-filter: blur(var(--header-backdrop-blur));
  backdrop-filter: blur(var(--header-backdrop-blur));
}

@media (prefers-reduced-motion: no-preference) {
  .app-header {
    transition:
      background-image 80ms linear,
      box-shadow 80ms linear,
      -webkit-backdrop-filter 80ms linear,
      backdrop-filter 80ms linear;
  }
}
</style>
