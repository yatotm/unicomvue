<template>
  <!-- 五组设置排成接缝网格：桌面两列三行（最后一组占满整行，网格因此没有空格子），
       手机一列。区块自己不带底色不带描边——分界全部来自 1px 的接缝。 -->
  <AppCard>
    <!-- 前两行按内容高度排，留白全部给最后一行：均分给六个格子会在每一组下面各挖一个洞，
         而把它留在卡片外面又会让卡片的下半截读成「多了一块空区域」。 -->
    <div class="ui-seams min-w-0 grow lg:min-h-0 @[60rem]:grid-cols-2 @[60rem]:grid-rows-[auto_auto_1fr]">
      <AppSection title="显示主题">
        <div class="max-w-sm pb-1">
          <ThemeSelector />
        </div>
      </AppSection>

      <AppSection title="自动刷新">
        <dl class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-body tabular-nums">
          <div v-for="fact in refreshFacts" :key="fact.label" class="flex min-w-0 items-baseline gap-2">
            <dt class="shrink-0 text-caption text-on-surface-muted">{{ fact.label }}</dt>
            <dd class="min-w-0 truncate text-on-surface">{{ fact.value }}</dd>
          </div>
        </dl>
        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton
            variant="filled"
            :disabled="isLoading"
            :aria-busy="isLoading"
            title="立即重新查询余量"
            @click="refresh()"
          >
            <RefreshCw :size="16" :stroke-width="1.6" class="shrink-0" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
            立即刷新
          </AppButton>
          <AppButton
            :aria-pressed="paused"
            :title="paused ? '恢复每 30 秒自动刷新' : '暂停每 30 秒自动刷新'"
            @click="togglePaused()"
          >
            <Play v-if="paused" :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            <Pause v-else :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            {{ paused ? "恢复自动刷新" : "暂停自动刷新" }}
          </AppButton>
        </div>
      </AppSection>

      <AppSection title="账号" body-class="@[60rem]:max-h-96">
        <template #meta>
          <p class="ml-auto shrink-0 text-caption text-on-surface-muted tabular-nums">已保存 {{ accounts.length }} 个</p>
        </template>

        <!-- 账号行和顶栏账号菜单是同一个组件，语义由 in-menu 切换。 -->
        <AccountList
          v-if="accounts.length"
          class="-mx-3"
          :accounts="accounts"
          :current-id="activeAccountId"
          @select="selectAccount"
        />
        <p v-else class="text-body text-on-surface-variant">还没有保存的账号</p>

        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton ref="addAccountRef" @click="addAccount">
            <Plus :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            添加账号
          </AppButton>
          <AppButton
            v-if="hasAccounts"
            variant="danger"
            title="把当前账号从本机浏览器移除，之后需要重新登录才能查询"
            @click="removeAccount()"
          >
            <LogOut :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            移除当前账号
          </AppButton>
        </div>
      </AppSection>

      <AppSection title="凭证">
        <div class="flex flex-wrap gap-2">
          <AppButton
            :disabled="!onlinToken"
            title="复制当前账号的 onlin_token；看板上点击套餐名是同样的操作"
            @click="copyText(onlinToken, 'onlin_token')"
          >
            <Copy :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            复制 onlin_token
          </AppButton>
          <AppButton
            :disabled="!ecsToken"
            title="复制当前账号的 ecs_token；看板上长按套餐名是同样的操作"
            @click="copyText(ecsToken, 'ecs_token')"
          >
            <Copy :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            复制 ecs_token
          </AppButton>
        </div>
      </AppSection>

      <AppSection class="@[60rem]:col-span-2" title="关于与隐私">
        <dl class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-body">
          <div v-for="fact in buildFacts" :key="fact.label" class="flex min-w-0 items-baseline gap-2">
            <dt class="shrink-0 text-caption text-on-surface-muted">{{ fact.label }}</dt>
            <dd class="min-w-0 truncate text-on-surface" :class="fact.mono ? 'font-mono' : 'tabular-nums'" :title="fact.hint">
              {{ fact.value }}
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton variant="text" @click="openPrivacy()">
            <ShieldCheck :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            隐私说明
          </AppButton>
          <AppButton tag="a" variant="text" :href="REPO_URL" target="_blank" rel="noopener noreferrer">
            <ExternalLink :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            源码仓库
          </AppButton>
          <AppButton tag="a" variant="text" :href="`${REPO_URL}/issues`" target="_blank" rel="noopener noreferrer">
            <ExternalLink :size="16" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
            问题反馈
          </AppButton>
        </div>
      </AppSection>
    </div>
  </AppCard>
</template>

<script setup>
import { computed, useTemplateRef } from "vue";
import {
  Copy,
  ExternalLink,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "@lucide/vue";
import AccountList from "@/components/AccountList.vue";
import AppButton from "@/components/AppButton.vue";
import AppCard from "@/components/AppCard.vue";
import AppSection from "@/components/AppSection.vue";
import ThemeSelector from "@/components/ThemeSelector.vue";
import { APP_BRANCH, APP_BUILD_TIME, APP_COMMIT } from "@/env";
import { useDashboardContext } from "@/utils/dashboardContext";

const REPO_URL = "https://github.com/yatotm/unicomvue";

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

const addAccountRef = useTemplateRef("addAccountRef");

const commit = APP_COMMIT || "";
const commitShort = commit ? String(commit).slice(0, 7) : "";

const refreshFacts = computed(() => [
  { label: "当前状态", value: statusText.value },
  { label: "上次刷新", value: lastUpdatedAt.value },
]);

const buildFacts = computed(() => [
  { label: "构建分支", value: APP_BRANCH || "local", mono: true, hint: "" },
  ...(commitShort ? [{ label: "提交", value: `#${commitShort}`, mono: true, hint: commit }] : []),
  ...(APP_BUILD_TIME
    ? [{ label: "构建时间", value: APP_BUILD_TIME.slice(0, 16).replace("T", " "), mono: false, hint: "" }]
    : []),
]);

function addAccount() {
  showAddAccount(addAccountRef.value?.$el ?? addAccountRef.value);
}
</script>
