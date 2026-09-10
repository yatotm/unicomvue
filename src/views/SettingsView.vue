<template>
  <!-- 一页一张大卡片：五组设置是它内部的圆角区域，靠留白分组。区域比外层小一档圆角（6px），
       所以读起来仍然是「一张卡片里面的几块」，不是五张浮卡。 -->
  <AppCard>
    <section class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5" :aria-labelledby="themeHeadingId">
      <h2 :id="themeHeadingId" class="text-title text-on-surface">显示主题</h2>
      <div class="mt-3 max-w-sm">
        <ThemeSelector />
      </div>
    </section>

    <section class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5" :aria-labelledby="refreshHeadingId">
      <h2 :id="refreshHeadingId" class="text-title text-on-surface">自动刷新</h2>
      <dl class="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-body tabular-nums">
        <div class="flex min-w-0 items-baseline gap-2">
          <dt class="shrink-0 text-caption text-on-surface-muted">当前状态</dt>
          <dd class="min-w-0 truncate text-on-surface">{{ statusText }}</dd>
        </div>
        <div class="flex min-w-0 items-baseline gap-2">
          <dt class="shrink-0 text-caption text-on-surface-muted">上次刷新</dt>
          <dd class="min-w-0 truncate text-on-surface">{{ lastUpdatedAt }}</dd>
        </div>
      </dl>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          :class="FILLED_BUTTON_CLASS"
          :disabled="isLoading"
          :aria-busy="isLoading"
          title="立即重新查询余量"
          @click="refresh()"
        >
          <RefreshCw :size="16" :stroke-width="1.6" class="shrink-0" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          立即刷新
        </button>
        <button
          type="button"
          :class="OUTLINED_BUTTON_CLASS"
          :aria-pressed="paused"
          :title="paused ? '恢复每 30 秒自动刷新' : '暂停每 30 秒自动刷新'"
          @click="togglePaused()"
        >
          <Play v-if="paused" :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          <Pause v-else :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          {{ paused ? "恢复自动刷新" : "暂停自动刷新" }}
        </button>
      </div>
    </section>

    <section class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5" :aria-labelledby="accountHeadingId">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 :id="accountHeadingId" class="text-title text-on-surface">账号</h2>
        <p class="text-caption text-on-surface-muted tabular-nums">已保存 {{ accounts.length }} 个</p>
      </div>

      <ul v-if="accounts.length" class="mt-3 grid gap-1">
        <li v-for="account in accounts" :key="account.id">
          <button
            type="button"
            class="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            :class="account.id === activeAccountId
              ? 'bg-surface'
              : 'hover:bg-hover-overlay active:bg-pressed-overlay'"
            :aria-pressed="account.id === activeAccountId"
            @click="selectAccount(account.id)"
          >
            <span
              class="inline-flex size-8 shrink-0 items-center justify-center rounded-dot"
              :class="account.id === activeAccountId
                ? 'bg-primary text-on-primary'
                : 'bg-surface-sunken text-on-surface-variant'"
            >
              <UserRound :size="15" :stroke-width="1.5" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-body text-on-surface tabular-nums"
              >{{ accountDisplayName(account) }}</span>
              <span
                class="block truncate text-caption text-on-surface-muted"
              >{{ accountPackageDescription(account) }}</span>
            </span>
            <Check
              v-if="account.id === activeAccountId"
              :size="16"
              class="shrink-0 text-primary-ink"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
      <p v-else class="mt-3 text-body text-on-surface-variant">还没有保存的账号</p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button ref="addAccountRef" type="button" :class="OUTLINED_BUTTON_CLASS" @click="addAccount">
          <Plus :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          添加账号
        </button>
        <button
          v-if="hasAccounts"
          type="button"
          :class="DANGER_BUTTON_CLASS"
          title="把当前账号从本机浏览器移除，之后需要重新登录才能查询"
          @click="removeAccount()"
        >
          <LogOut :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          移除当前账号
        </button>
      </div>
    </section>

    <section class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5" :aria-labelledby="tokenHeadingId">
      <h2 :id="tokenHeadingId" class="text-title text-on-surface">凭证</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          :class="OUTLINED_BUTTON_CLASS"
          :disabled="!onlinToken"
          title="复制当前账号的 onlin_token；看板上点击套餐名是同样的操作"
          @click="copyText(onlinToken, 'onlin_token')"
        >
          <Copy :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          复制 onlin_token
        </button>
        <button
          type="button"
          :class="OUTLINED_BUTTON_CLASS"
          :disabled="!ecsToken"
          title="复制当前账号的 ecs_token；看板上长按套餐名是同样的操作"
          @click="copyText(ecsToken, 'ecs_token')"
        >
          <Copy :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          复制 ecs_token
        </button>
      </div>
    </section>

    <section class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5" :aria-labelledby="aboutHeadingId">
      <h2 :id="aboutHeadingId" class="text-title text-on-surface">关于与隐私</h2>
      <dl class="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-body">
        <div class="flex min-w-0 items-baseline gap-2">
          <dt class="shrink-0 text-caption text-on-surface-muted">构建分支</dt>
          <dd class="min-w-0 truncate font-mono text-on-surface">{{ branchLabel }}</dd>
        </div>
        <div v-if="commitShort" class="flex min-w-0 items-baseline gap-2">
          <dt class="shrink-0 text-caption text-on-surface-muted">提交</dt>
          <dd class="min-w-0 truncate font-mono tabular-nums text-on-surface" :title="commit">#{{ commitShort }}</dd>
        </div>
        <div v-if="buildTimeLabel" class="flex min-w-0 items-baseline gap-2">
          <dt class="shrink-0 text-caption text-on-surface-muted">构建时间</dt>
          <dd class="min-w-0 truncate tabular-nums text-on-surface">{{ buildTimeLabel }}</dd>
        </div>
      </dl>

      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" :class="TEXT_BUTTON_CLASS" @click="openPrivacy()">
          <ShieldCheck :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          隐私说明
        </button>
        <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" :class="TEXT_BUTTON_CLASS">
          <ExternalLink :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          源码仓库
        </a>
        <a :href="`${REPO_URL}/issues`" target="_blank" rel="noopener noreferrer" :class="TEXT_BUTTON_CLASS">
          <ExternalLink :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
          问题反馈
        </a>
      </div>
    </section>
  </AppCard>
</template>

<script setup>
import { computed, useId, useTemplateRef } from "vue";
import {
  Check,
  Copy,
  ExternalLink,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "@lucide/vue";
import AppCard from "@/components/AppCard.vue";
import ThemeSelector from "@/components/ThemeSelector.vue";
import { accountDisplayName, accountPackageDescription } from "@/domain/accounts.js";
import { APP_BRANCH, APP_BUILD_TIME, APP_COMMIT } from "@/env";
import { useDashboardContext } from "@/utils/dashboardContext";

const REPO_URL = "https://github.com/yatotm/unicomvue";
const FOCUS_RING_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const DISABLED_CLASS = "disabled:cursor-not-allowed disabled:opacity-40";
const BUTTON_BASE = `inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-body transition-colors duration-150 ease-standard sm:h-9 ${FOCUS_RING_CLASS} ${DISABLED_CLASS}`;
const FILLED_BUTTON_CLASS = `${BUTTON_BASE} bg-primary font-semibold text-on-primary shadow-e1 hover:bg-primary-hover active:bg-primary-pressed`;
const OUTLINED_BUTTON_CLASS = `${BUTTON_BASE} border border-outline text-on-surface hover:bg-hover-overlay active:bg-pressed-overlay`;
const TEXT_BUTTON_CLASS = `${BUTTON_BASE} text-primary-ink hover:bg-hover-overlay active:bg-pressed-overlay`;
const DANGER_BUTTON_CLASS = `${BUTTON_BASE} text-danger-ink hover:bg-hover-overlay active:bg-pressed-overlay`;

const {
  statusText,
  lastUpdatedAt,
  isLoading,
  paused,
  refresh,
  togglePaused,
  accounts,
  activeAccountId,
  hasAccounts,
  selectAccount,
  removeAccount,
  showAddAccount,
  openPrivacy,
  copyText,
  onlinToken,
  ecsToken,
} = useDashboardContext();

const themeHeadingId = useId();
const refreshHeadingId = useId();
const accountHeadingId = useId();
const tokenHeadingId = useId();
const aboutHeadingId = useId();
const addAccountRef = useTemplateRef("addAccountRef");

const branchLabel = APP_BRANCH || "local";
const commit = APP_COMMIT || "";
const commitShort = commit ? String(commit).slice(0, 7) : "";
const buildTimeLabel = computed(() => (APP_BUILD_TIME ? APP_BUILD_TIME.slice(0, 16).replace("T", " ") : ""));

function addAccount() {
  showAddAccount(addAccountRef.value);
}
</script>
