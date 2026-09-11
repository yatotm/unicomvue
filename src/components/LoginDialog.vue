<template>
  <Teleport defer to="#app-modal-root">
    <div
      v-if="open"
      class="fixed z-[60] overflow-hidden text-on-surface"
      :style="loginViewportStyle"
    >
      <!-- 遮罩只是遮罩：关闭由共享原语在 document 上处理，不再需要一个铺在页面上的按钮
           （那种按钮的定位祖先一旦变了，或者后面来了个兄弟节点盖住它，就会静默失效）。 -->
      <div class="absolute inset-0 bg-scrim" aria-hidden="true"></div>

      <!-- Bottom sheet on phones, centred card from sm up. 对话框是真正的浮层，
           所以它是全项目仅有的几处还带阴影的东西之一。 -->
      <div class="login-dialog-viewport relative grid h-full min-h-0 items-end justify-items-center overflow-clip sm:place-items-center">
        <div
          ref="dialogRef"
          class="login-dialog-sheet max-h-full w-full min-w-0 max-w-md overflow-y-auto overscroll-contain rounded-t-card bg-surface-raised px-4 pt-4 shadow-e3 outline-none sm:rounded-card sm:px-5 sm:pt-5"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <span class="sr-only" tabindex="0" @focus="focusLastControl"></span>

          <DialogHeader
            ref="headerRef"
            :title-id="titleId"
            :title="canClose ? '添加账号' : '登录'"
            subtitle="账号只保存在当前浏览器"
            close-label="关闭登录窗口"
            :closable="canClose"
            @close="close"
          >
            <template #icon><LockKeyhole :size="18" /></template>
          </DialogHeader>

          <div class="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <SegmentedControl
              ref="modeGroupRef"
              :options="LOGIN_MODES"
              :model-value="mode"
              label="登录方式"
              @update:model-value="selectMode"
            />

            <template v-if="mode !== 'token'">
              <TextField
                ref="phoneInputRef"
                v-model="phone"
                label="手机号"
                type="tel"
                inputmode="numeric"
                autocomplete="tel"
                :maxlength="11"
                placeholder="11 位手机号"
                :error="phoneError"
              />

              <TextField
                v-if="mode === 'sms'"
                ref="codeInputRef"
                v-model="code"
                label="短信验证码"
                inputmode="numeric"
                autocomplete="one-time-code"
                :maxlength="6"
                placeholder="6 位验证码"
                numeric
                @submit="authenticateWithPhone"
              >
                <template #suffix>
                  <AppButton
                    variant="text"
                    class="w-full xs:w-28"
                    :disabled="smsLoading || smsCountdown > 0 || !phoneIsValid"
                    :aria-busy="smsLoading ? 'true' : undefined"
                    @click="requestCode"
                  >
                    {{ smsButtonLabel }}
                  </AppButton>
                </template>
              </TextField>

              <TextField
                v-else
                ref="passwordInputRef"
                v-model="password"
                label="联通 App 登录密码"
                type="password"
                autocomplete="current-password"
                :maxlength="20"
                placeholder="App 使用的 8–20 位登录密码"
                :trim="false"
                :error="passwordError"
                hint="密码仅用于本次登录，不保存到账号列表。联通要求图形验证时会在下方显示。"
                @submit="authenticateWithPhone"
              />
            </template>

            <TextField
              v-else
              ref="tokenInputRef"
              v-model="token"
              label="ecs_token"
              multiline
              :rows="4"
              placeholder="粘贴你的 ecs_token（会写入本地缓存）"
              :error="tokenError"
            />

            <p
              v-if="message && messageKind === 'ok'"
              class="min-w-0 text-caption text-on-surface-variant [overflow-wrap:anywhere]"
              role="status"
            >
              {{ message }}
            </p>
            <p
              v-else-if="message"
              class="flex min-w-0 items-start gap-2 text-caption text-danger-ink [overflow-wrap:anywhere]"
              role="alert"
            >
              <CircleAlert :size="16" class="mt-1 shrink-0" aria-hidden="true" />
              <span class="min-w-0">{{ message }}</span>
            </p>

            <AppButton
              v-if="mode !== 'token'"
              variant="filled"
              class="w-full"
              :disabled="loginLoading || !phoneIsValid || (mode === 'password' ? !passwordIsValid : !code)"
              :aria-busy="loginLoading ? 'true' : undefined"
              @click="authenticateWithPhone"
            >
              <LoaderCircle v-if="loginLoading" :size="18" class="animate-spin" aria-hidden="true" />
              <span>{{ loginLoading ? "正在登录…" : "立即登录" }}</span>
            </AppButton>
            <AppButton
              v-else
              variant="filled"
              class="w-full"
              :disabled="!tokenIsValid"
              @click="authenticateWithToken"
            >
              使用该 ecs_token 登录
            </AppButton>

            <!-- 第三方内容的容器：一条 3:1 的边界 + sunken 的井底色，和输入框同一档面。 -->
            <section v-if="operatorChallenge" class="min-w-0 rounded-control border border-outline p-2">
              <div class="mb-2 flex min-w-0 items-center justify-between gap-2 pl-3">
                <h3 class="min-w-0 truncate text-body text-on-surface">联通官方身份验证</h3>
                <AppButton variant="text" @click="cancelOperatorVerification">取消验证</AppButton>
              </div>
              <iframe
                :key="operatorChallenge.id"
                :src="operatorChallenge.url"
                title="联通官方身份验证"
                class="h-[min(65dvh,560px)] min-h-80 w-full rounded-control border-0 bg-surface-sunken"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                allow="camera 'none'; microphone 'none'"
                referrerpolicy="no-referrer"
                @load="onOperatorFrameLoad($event.target.contentWindow)"
              ></iframe>
              <p class="mt-2 px-3 text-caption text-on-surface-variant">
                此区域由中国联通提供，验证信息直接提交给联通；人脸验证需要官方 App。
              </p>
            </section>

            <div class="min-w-0">
              <p class="text-caption text-on-surface-variant [overflow-wrap:anywhere]">
                点击登录即表示您同意本工具获取您的
                <span class="font-mono text-on-surface">ecs_token</span>，仅用于查询您本人联通账号信息。
              </p>
              <button
                ref="privacyButtonRef"
                type="button"
                class="inline-flex min-h-11 items-center text-caption text-primary-ink underline underline-offset-4 hover:decoration-2"
                :class="[TRANSITION, FOCUS_RING]"
                @click="emit('open-privacy')"
              >
                查看隐私说明
              </button>
            </div>
          </div>

          <span class="sr-only" tabindex="0" @focus="focusFirstControl"></span>
        </div>
      </div>

      <ExternalScript
        v-if="captchaScriptRequested"
        :src="captchaScriptSrc"
        @load="onCaptchaScriptLoad"
        @error="onCaptchaScriptError"
      />
    </div>
  </Teleport>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { CircleAlert, LoaderCircle, LockKeyhole } from "@lucide/vue";
import AppButton from "@/components/AppButton.vue";
import DialogHeader from "@/components/DialogHeader.vue";
import ExternalScript from "@/components/ExternalScript.vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
import TextField from "@/components/TextField.vue";
import { useDismissable } from "@/composables/useDismissable";
import { useDocumentScrollLock } from "@/composables/useDocumentScrollLock";
import { useLoginFlow } from "@/composables/useLoginFlow";
import { FOCUS_RING, TRANSITION } from "@/utils/ui";

const LOGIN_MODES = [
  { value: "sms", label: "短信登录" },
  { value: "password", label: "密码登录" },
  { value: "token", label: "Token 登录" },
];

const props = defineProps({
  canClose: { type: Boolean, default: false },
  notice: { type: String, default: "" },
  returnFocusTarget: { type: Object, default: null },
});
const emit = defineEmits(["authenticated", "open-privacy"]);
const open = defineModel("open", { type: Boolean, default: false });
useDocumentScrollLock(open);
// 遮罩上的按下就是「面板之外的按下」，所以它走的是和账号菜单同一条规则；只有焦点离开
// 这一条被关掉——对话框有焦点陷阱，焦点不会合法地离开它。
const { dismiss } = useDismissable(open, {
  panel: () => dialogRef.value,
  trigger: () => props.returnFocusTarget,
  focusLeave: false,
  closable: () => props.canClose,
});
// 每个字段自己的 id / aria-describedby 归 TextField 管，这里只留对话框自己的标题 id。
const titleId = useId();
const dialogRef = useTemplateRef("dialogRef");
const headerRef = useTemplateRef("headerRef");
const modeGroupRef = useTemplateRef("modeGroupRef");
const phoneInputRef = useTemplateRef("phoneInputRef");
const codeInputRef = useTemplateRef("codeInputRef");
const passwordInputRef = useTemplateRef("passwordInputRef");
const tokenInputRef = useTemplateRef("tokenInputRef");
const privacyButtonRef = useTemplateRef("privacyButtonRef");
const visualViewportWidth = ref("100vw");
const visualViewportHeight = ref("100dvh");
const visualViewportLeft = ref("0px");
const visualViewportTop = ref("0px");
const loginViewportStyle = computed(() => ({
  width: visualViewportWidth.value,
  height: visualViewportHeight.value,
  left: visualViewportLeft.value,
  top: visualViewportTop.value,
}));

let viewportTracking = false;

const {
  mode,
  phone,
  code,
  password,
  token,
  message,
  messageKind,
  smsLoading,
  loginLoading,
  smsCountdown,
  captchaScriptRequested,
  captchaScriptSrc,
  operatorChallenge,
  onOperatorFrameLoad,
  cancelOperatorVerification,
  phoneIsValid,
  tokenIsValid,
  passwordIsValid,
  setMessage,
  setMode,
  sendCode,
  submitSmsLogin,
  submitPasswordLogin,
  submitTokenLogin,
  onCaptchaScriptLoad,
  onCaptchaScriptError,
} = useLoginFlow(open);

const smsButtonLabel = computed(() => {
  if (smsLoading.value) return "发送中...";
  if (smsCountdown.value > 0) return `${smsCountdown.value}s`;
  return "获取验证码";
});

// Presentation-only hints derived from the flow's existing validators.
const phoneError = computed(() => (
  phone.value && !phoneIsValid.value ? "请输入 11 位手机号码" : ""
));
const passwordError = computed(() => (
  password.value && !passwordIsValid.value ? "登录密码为 8–20 位" : ""
));
const tokenError = computed(() => (
  token.value && !tokenIsValid.value ? "ecs_token 长度不足，请确认已完整粘贴" : ""
));

function close() {
  dismiss();
}

function focusFirstControl() {
  if (props.canClose) headerRef.value?.focus();
  else modeGroupRef.value?.$el?.querySelector("button")?.focus();
}

function focusLastControl() {
  privacyButtonRef.value?.focus();
}

function updateVisualViewport() {
  if (typeof window === "undefined" || !window.visualViewport) {
    visualViewportWidth.value = "100vw";
    visualViewportHeight.value = "100dvh";
    visualViewportLeft.value = "0px";
    visualViewportTop.value = "0px";
    return;
  }

  visualViewportWidth.value = `${window.visualViewport.width}px`;
  visualViewportHeight.value = `${Math.round(window.visualViewport.height)}px`;
  visualViewportLeft.value = `${Math.max(0, window.visualViewport.offsetLeft)}px`;
  visualViewportTop.value = `${Math.max(0, Math.round(window.visualViewport.offsetTop))}px`;
}

function trackVisualViewport(active) {
  if (typeof window === "undefined" || !window.visualViewport) return;
  if (active === viewportTracking) return;

  const method = active ? "addEventListener" : "removeEventListener";
  window.visualViewport[method]("resize", updateVisualViewport);
  window.visualViewport[method]("scroll", updateVisualViewport);
  viewportTracking = active;

  if (active) updateVisualViewport();
  else {
    visualViewportWidth.value = "100vw";
    visualViewportHeight.value = "100dvh";
    visualViewportLeft.value = "0px";
    visualViewportTop.value = "0px";
  }
}

function shouldAutoFocusInput() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

function focusInitialControl() {
  if (shouldAutoFocusInput()) {
    const preferredInput = mode.value === "token"
      ? tokenInputRef.value
      : phoneInputRef.value;
    if (preferredInput) {
      preferredInput.focus({ preventScroll: true });
      return;
    }
  }

  focusFirstControl();
}

async function selectMode(nextMode) {
  setMode(nextMode);
  await nextTick();
  if (!open.value) return;
  if (nextMode === "token") tokenInputRef.value?.focus();
  else if (nextMode === "password" && phoneIsValid.value) passwordInputRef.value?.focus();
  else phoneInputRef.value?.focus();
}

async function requestCode() {
  if (await sendCode()) {
    await nextTick();
    if (open.value) codeInputRef.value?.focus();
  }
}

async function authenticateWithPhone() {
  const payload = await (mode.value === "password" ? submitPasswordLogin() : submitSmsLogin());
  if (!payload) return;
  emit("authenticated", payload);
  // 登录成功是「任务完成了，必须关」，即使这是第一次登录（canClose 为假）也一样。
  dismiss({ force: true });
}

function authenticateWithToken() {
  const payload = submitTokenLogin();
  if (!payload) return;
  emit("authenticated", payload);
  dismiss({ force: true });
}

watch(open, async (isOpen) => {
  trackVisualViewport(isOpen);
  if (!isOpen) return;
  await nextTick();
  if (open.value) focusInitialControl();
}, { flush: "post" });

watch(
  [open, () => props.notice],
  ([isOpen, notice]) => {
    if (isOpen) setMessage(notice);
  },
  { immediate: true, flush: "post" },
);

onBeforeUnmount(() => trackVisualViewport(false));
</script>

<style scoped>
/* The sheet sits on the bottom edge, so the safe area is padded inside it. */
.login-dialog-viewport {
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-right: env(safe-area-inset-right);
  padding-left: env(safe-area-inset-left);
}

.login-dialog-sheet {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

@media (min-width: 40rem) {
  .login-dialog-viewport {
    padding:
      max(1.5rem, env(safe-area-inset-top))
      max(1.5rem, env(safe-area-inset-right))
      max(1.5rem, env(safe-area-inset-bottom))
      max(1.5rem, env(safe-area-inset-left));
  }

  .login-dialog-sheet {
    padding-bottom: 1.5rem;
  }
}
</style>
