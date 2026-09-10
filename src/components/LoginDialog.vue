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

      <!-- Bottom sheet on phones, centred card from sm up. -->
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

          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="inline-flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-container text-on-primary-container"
                aria-hidden="true"
              >
                <LockKeyhole :size="18" />
              </span>
              <div class="min-w-0">
                <h2 :id="titleId" class="text-title text-on-surface">
                  {{ canClose ? "添加账号" : "登录" }}
                </h2>
                <p class="mt-1 text-caption text-on-surface-variant">账号只保存在当前浏览器</p>
              </div>
            </div>

            <button
              v-if="canClose"
              ref="closeButtonRef"
              type="button"
              class="inline-flex size-11 shrink-0 items-center justify-center rounded-dot text-on-surface-variant transition-colors duration-150 ease-standard hover:bg-hover-overlay hover:text-on-surface active:bg-pressed-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              title="关闭"
              aria-label="关闭登录窗口"
              @click="close"
            >
              <X :size="20" aria-hidden="true" />
            </button>
          </div>

          <div class="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <div ref="modeGroupRef" class="grid min-w-0 grid-cols-3 gap-1 rounded-card bg-surface-sunken p-1">
              <button
                v-for="option in LOGIN_MODES"
                :key="option.value"
                type="button"
                class="inline-flex h-11 min-w-0 items-center justify-center rounded-control px-2 text-caption transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:h-10"
                :class="mode === option.value
                  ? 'bg-surface-raised text-primary-ink shadow-e1'
                  : 'text-on-surface-variant hover:bg-hover-overlay hover:text-on-surface'"
                :aria-pressed="mode === option.value"
                @click="selectMode(option.value)"
              >
                <span class="truncate">{{ option.label }}</span>
              </button>
            </div>

            <template v-if="mode !== 'token'">
              <div class="min-w-0">
                <label :for="phoneInputId" class="mb-1 block text-caption text-on-surface-variant">手机号</label>
                <input
                  :id="phoneInputId"
                  ref="phoneInputRef"
                  v-model.trim="phone"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  maxlength="11"
                  class="h-11 w-full min-w-0 rounded-control border bg-surface-sunken px-3 text-body text-on-surface transition-colors duration-150 ease-standard placeholder:text-on-surface-muted hover:border-primary focus:bg-surface-raised focus:outline-2 focus:outline-offset-0"
                  :class="phoneError
                    ? 'border-danger focus:border-danger focus:outline-danger'
                    : 'border-outline focus:border-primary focus:outline-primary'"
                  :aria-invalid="phoneError ? 'true' : undefined"
                  :aria-describedby="phoneError ? phoneErrorId : undefined"
                  placeholder="11 位手机号"
                />
                <p v-if="phoneError" :id="phoneErrorId" class="mt-1 text-caption text-danger-ink">{{ phoneError }}</p>
              </div>

              <div v-if="mode === 'sms'" class="min-w-0">
                <label :for="codeInputId" class="mb-1 block text-caption text-on-surface-variant">短信验证码</label>
                <div class="grid min-w-0 grid-cols-1 gap-2 xs:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    :id="codeInputId"
                    ref="codeInputRef"
                    v-model.trim="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="6"
                    class="h-11 w-full min-w-0 rounded-control border border-outline bg-surface-sunken px-3 text-body text-on-surface tabular-nums transition-colors duration-150 ease-standard placeholder:text-on-surface-muted hover:border-primary focus:border-primary focus:bg-surface-raised focus:outline-2 focus:outline-offset-0 focus:outline-primary"
                    placeholder="6 位验证码"
                    @keydown.enter="authenticateWithPhone"
                  />
                  <button
                    type="button"
                    class="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-control px-4 text-body text-primary-ink transition-colors duration-150 ease-standard hover:bg-hover-overlay active:bg-pressed-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 xs:w-28"
                    :disabled="smsLoading || smsCountdown > 0 || !phoneIsValid"
                    :aria-busy="smsLoading ? 'true' : undefined"
                    @click="requestCode"
                  >
                    {{ smsButtonLabel }}
                  </button>
                </div>
              </div>

              <div v-else class="min-w-0">
                <label :for="passwordInputId" class="mb-1 block text-caption text-on-surface-variant">联通 App 登录密码</label>
                <input
                  :id="passwordInputId"
                  ref="passwordInputRef"
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  maxlength="20"
                  placeholder="App 使用的 8–20 位登录密码"
                  class="h-11 w-full min-w-0 rounded-control border bg-surface-sunken px-3 text-body text-on-surface transition-colors duration-150 ease-standard placeholder:text-on-surface-muted hover:border-primary focus:bg-surface-raised focus:outline-2 focus:outline-offset-0"
                  :class="passwordError
                    ? 'border-danger focus:border-danger focus:outline-danger'
                    : 'border-outline focus:border-primary focus:outline-primary'"
                  :aria-invalid="passwordError ? 'true' : undefined"
                  :aria-describedby="passwordError ? passwordErrorId : passwordHintId"
                  @keydown.enter="authenticateWithPhone"
                />
                <p v-if="passwordError" :id="passwordErrorId" class="mt-1 text-caption text-danger-ink">{{ passwordError }}</p>
                <p v-else :id="passwordHintId" class="mt-1 text-caption text-on-surface-variant">
                  密码仅用于本次登录，不保存到账号列表。联通要求图形验证时会在下方显示。
                </p>
              </div>
            </template>

            <div v-else class="min-w-0">
              <label :for="tokenInputId" class="mb-1 block text-caption text-on-surface-variant">ecs_token</label>
              <textarea
                :id="tokenInputId"
                ref="tokenInputRef"
                v-model.trim="token"
                rows="4"
                class="w-full min-w-0 resize-none rounded-control border bg-surface-sunken px-3 py-2 text-body text-on-surface transition-colors duration-150 ease-standard [overflow-wrap:anywhere] placeholder:text-on-surface-muted hover:border-primary focus:bg-surface-raised focus:outline-2 focus:outline-offset-0"
                :class="tokenError
                  ? 'border-danger focus:border-danger focus:outline-danger'
                  : 'border-outline focus:border-primary focus:outline-primary'"
                :aria-invalid="tokenError ? 'true' : undefined"
                :aria-describedby="tokenError ? tokenErrorId : undefined"
                placeholder="粘贴你的 ecs_token（会写入本地缓存）"
              ></textarea>
              <p v-if="tokenError" :id="tokenErrorId" class="mt-1 text-caption text-danger-ink">{{ tokenError }}</p>
            </div>

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

            <button
              v-if="mode !== 'token'"
              type="button"
              class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-6 text-body text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover active:bg-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
              :disabled="loginLoading || !phoneIsValid || (mode === 'password' ? !passwordIsValid : !code)"
              :aria-busy="loginLoading ? 'true' : undefined"
              @click="authenticateWithPhone"
            >
              <LoaderCircle v-if="loginLoading" :size="18" class="animate-spin" aria-hidden="true" />
              <span>{{ loginLoading ? "正在登录…" : "立即登录" }}</span>
            </button>
            <button
              v-else
              type="button"
              class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-6 text-body text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover active:bg-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
              :disabled="!tokenIsValid"
              @click="authenticateWithToken"
            >
              使用该 ecs_token 登录
            </button>

            <section v-if="operatorChallenge" class="min-w-0 rounded-card border border-outline bg-surface p-2">
              <div class="mb-2 flex min-w-0 items-center justify-between gap-2 pl-3">
                <h3 class="min-w-0 truncate text-body text-on-surface">联通官方身份验证</h3>
                <button
                  type="button"
                  class="inline-flex h-11 shrink-0 items-center justify-center rounded-control px-4 text-body text-primary-ink transition-colors duration-150 ease-standard hover:bg-hover-overlay active:bg-pressed-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-10"
                  @click="cancelOperatorVerification"
                >
                  取消验证
                </button>
              </div>
              <iframe
                :key="operatorChallenge.id"
                :src="operatorChallenge.url"
                title="联通官方身份验证"
                class="h-[min(65dvh,560px)] min-h-80 w-full rounded-card border-0 bg-surface"
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
                class="inline-flex min-h-11 items-center text-caption text-primary-ink underline underline-offset-4 transition-colors duration-150 ease-standard hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
import { CircleAlert, LoaderCircle, LockKeyhole, X } from "@lucide/vue";
import ExternalScript from "@/components/ExternalScript.vue";
import { useDismissable } from "@/composables/useDismissable";
import { useDocumentScrollLock } from "@/composables/useDocumentScrollLock";
import { useLoginFlow } from "@/composables/useLoginFlow";

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
const titleId = useId();
const phoneInputId = useId();
const phoneErrorId = useId();
const codeInputId = useId();
const passwordInputId = useId();
const passwordErrorId = useId();
const passwordHintId = useId();
const tokenInputId = useId();
const tokenErrorId = useId();
const dialogRef = useTemplateRef("dialogRef");
const closeButtonRef = useTemplateRef("closeButtonRef");
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
  if (props.canClose) closeButtonRef.value?.focus();
  else modeGroupRef.value?.querySelector("button")?.focus();
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
