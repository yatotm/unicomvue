<template>
  <div v-show="open" class="fixed inset-0 z-[60] overflow-hidden">
    <!-- 同 LoginDialog：遮罩只是遮罩。这块以前是个按钮，但它被后面那个 `relative` 的
         居中容器整个盖住了，点上去永远不会触发——正是「自己写一遍关闭逻辑」的典型下场。 -->
    <div class="absolute inset-0 bg-scrim" aria-hidden="true"></div>

    <div class="relative grid h-full min-h-0 place-items-center p-4 sm:p-6">
      <div
        ref="dialogRef"
        class="flex max-h-full w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-card bg-surface-raised shadow-e3 outline-none"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
      >
        <span class="sr-only" tabindex="0" @focus="focusConfirmButton"></span>

        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-divider p-4 sm:p-5">
          <div class="flex min-w-0 items-start gap-3">
            <span
              class="inline-flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-container text-on-primary-container"
              aria-hidden="true"
            >
              <ShieldCheck :size="18" />
            </span>
            <div class="min-w-0">
              <h2 :id="titleId" class="text-title text-on-surface">
                {{ privacyDocument.title }}
              </h2>
              <p class="mt-1 text-caption text-on-surface-variant">
                账号凭证仅用于登录和查询，请在可信设备上使用
              </p>
            </div>
          </div>

          <button
            ref="closeButtonRef"
            type="button"
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-dot text-on-surface-variant transition-colors duration-150 ease-standard hover:bg-hover-overlay hover:text-on-surface active:bg-pressed-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-label="关闭隐私说明"
            title="关闭"
            @click="close"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </div>

        <div
          ref="contentScrollRef"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface"
        >
          <!-- markdown-it escapes raw HTML; the source is bundled from this repository. -->
          <!-- eslint-disable vue/no-v-html -->
          <article
            v-if="privacyDocument.sections.length"
            class="privacy-markdown"
          >
            <section
              v-for="(section, index) in privacyDocument.sections"
              :key="`${index}-${section.title}`"
              class="privacy-section"
              :class="{ 'privacy-intro': !section.title }"
            >
              <h2 v-if="section.title" class="privacy-section-title">
                {{ section.title }}
              </h2>
              <div class="privacy-section-body" v-html="section.html"></div>
            </section>
          </article>
          <!-- eslint-enable vue/no-v-html -->
          <div
            v-else
            class="flex min-h-56 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
            role="status"
            :aria-busy="privacyError ? undefined : 'true'"
          >
            <p class="text-body text-on-surface-variant">{{ privacyError || "正在加载隐私说明…" }}</p>
            <button
              v-if="privacyError"
              type="button"
              class="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-outline bg-transparent px-6 text-body text-on-surface transition-colors duration-150 ease-standard hover:border-primary hover:bg-hover-overlay active:bg-pressed-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-10"
              @click="loadPrivacyDocument"
            >
              重新加载
            </button>
          </div>
        </div>

        <div class="flex shrink-0 items-center justify-end border-t border-divider p-4 sm:px-5">
          <button
            ref="confirmButtonRef"
            type="button"
            class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-6 text-body text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover active:bg-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus xs:w-auto sm:h-10"
            @click="close"
          >
            我知道了
          </button>
        </div>

        <span class="sr-only" tabindex="0" @focus="focusCloseButton"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, shallowRef, useId, useTemplateRef, watch } from "vue";
import { ShieldCheck, X } from "@lucide/vue";
import privacyMarkdown from "../../docs/api-and-privacy.md?raw";
import { useDismissable } from "@/composables/useDismissable";
import { useDocumentScrollLock } from "@/composables/useDocumentScrollLock";

function extractDocumentTitle(source) {
  const heading = String(source).match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || "隐私、Cookie 与 Token 说明";
}

function renderPrivacyDocument(source, MarkdownIt) {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  });
  const defaultLinkOpen = markdown.renderer.rules.link_open
    || ((tokens, index, options, _environment, renderer) => (
      renderer.renderToken(tokens, index, options)
    ));

  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const href = tokens[index].attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, index, options, environment, renderer);
  };

  const environment = {};
  const tokens = markdown.parse(source, environment);
  const titleIndex = tokens.findIndex(
    (token) => token.type === "heading_open" && token.tag === "h1",
  );
  const title = titleIndex >= 0 && tokens[titleIndex + 1]?.type === "inline"
    ? tokens[titleIndex + 1].content.trim()
    : "隐私、Cookie 与 Token 说明";

  if (titleIndex >= 0) tokens.splice(titleIndex, 3);

  const sections = [];
  let sectionTitle = "";
  let sectionTokens = [];

  function appendSection() {
    if (!sectionTokens.length) return;
    sections.push(Object.freeze({
      title: sectionTitle,
      html: markdown.renderer.render(sectionTokens, markdown.options, environment),
    }));
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open" && token.tag === "h2") {
      appendSection();
      sectionTitle = tokens[index + 1]?.type === "inline"
        ? tokens[index + 1].content.trim()
        : "";
      sectionTokens = [];
      index += 2;
      continue;
    }
    sectionTokens.push(token);
  }
  appendSection();

  return Object.freeze({
    title,
    sections: Object.freeze(sections),
  });
}

const open = defineModel("open", { type: Boolean, default: false });
useDocumentScrollLock(open);
// 同 LoginDialog：外部按下（＝点遮罩）、Escape、路由变化、焦点归还全部来自共享原语；
// 焦点离开这一条关掉，因为对话框自己有焦点陷阱。
const { dismiss } = useDismissable(open, {
  panel: () => dialogRef.value,
  focusLeave: false,
});
const dialogRef = useTemplateRef("dialogRef");
const closeButtonRef = useTemplateRef("closeButtonRef");
const confirmButtonRef = useTemplateRef("confirmButtonRef");
const contentScrollRef = useTemplateRef("contentScrollRef");
const titleId = useId();
const privacyDocument = shallowRef(Object.freeze({
  title: extractDocumentTitle(privacyMarkdown),
  sections: Object.freeze([]),
}));
const privacyError = ref("");
let privacyLoadPromise = null;

async function loadPrivacyDocument() {
  if (privacyDocument.value.sections.length) return privacyDocument.value;
  if (privacyLoadPromise) return privacyLoadPromise;

  privacyError.value = "";
  privacyLoadPromise = import("markdown-it")
    .then(({ default: MarkdownIt }) => {
      privacyDocument.value = renderPrivacyDocument(privacyMarkdown, MarkdownIt);
      return privacyDocument.value;
    })
    .catch(() => {
      privacyError.value = "隐私说明加载失败，请重试";
      return null;
    })
    .finally(() => {
      privacyLoadPromise = null;
    });

  return privacyLoadPromise;
}

function close() {
  dismiss();
}

function focusCloseButton() {
  closeButtonRef.value?.focus();
}

function focusConfirmButton() {
  confirmButtonRef.value?.focus();
}

function handleDialogTab(event) {
  if (event.target !== dialogRef.value) return;
  event.preventDefault();
  if (event.shiftKey) focusConfirmButton();
  else focusCloseButton();
}

async function focusDialog(isOpen) {
  if (!isOpen) return;
  void loadPrivacyDocument();
  await nextTick();
  if (!open.value) return;
  if (contentScrollRef.value) contentScrollRef.value.scrollTop = 0;
  dialogRef.value?.focus();
}

watch(open, focusDialog, { immediate: true, flush: "post" });
</script>

<style scoped>
/* Long-form prose: looser leading than the utility type scale, tokens for every colour. */
.privacy-markdown {
  color: var(--ui-on-surface-variant);
  font-size: var(--text-body);
  /* 长文的行距比工具类更松：这是唯一一处散文排版，其余一切仍然是那五级阶梯。 */
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.privacy-section {
  border-bottom: 1px solid var(--ui-divider);
  padding: 1.25rem;
}

.privacy-section:last-child {
  border-bottom: 0;
}

.privacy-intro {
  color: var(--ui-on-surface);
}

.privacy-section-title {
  margin-bottom: 0.75rem;
  color: var(--ui-on-surface);
  font-size: var(--text-title);
  font-weight: 600;
  line-height: var(--text-title--line-height);
}

.privacy-section-body :deep(> :first-child) {
  margin-top: 0;
}

.privacy-markdown :deep(h3) {
  margin-top: 1.5rem;
  color: var(--ui-on-surface);
  font-size: var(--text-body);
  font-weight: 600;
  line-height: var(--text-body--line-height);
}

.privacy-markdown :deep(p),
.privacy-markdown :deep(ul),
.privacy-markdown :deep(ol),
.privacy-markdown :deep(table) {
  margin-top: 0.75rem;
}

.privacy-markdown :deep(strong) {
  color: var(--ui-on-surface);
  font-weight: 600;
}

.privacy-markdown :deep(ul),
.privacy-markdown :deep(ol) {
  padding-left: 1.5rem;
}

.privacy-markdown :deep(ul) {
  list-style: disc;
}

.privacy-markdown :deep(ol) {
  list-style: decimal;
}

.privacy-markdown :deep(li + li) {
  margin-top: 0.25rem;
}

.privacy-markdown :deep(li::marker) {
  color: var(--ui-on-surface-muted);
}

.privacy-markdown :deep(a) {
  color: var(--ui-primary-ink);
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: color var(--ui-duration-fast) var(--ease-standard);
}

.privacy-markdown :deep(a:hover) {
  color: var(--ui-primary-pressed);
}

.privacy-markdown :deep(code) {
  border-radius: var(--radius-chip);
  background: var(--ui-surface-sunken);
  padding: 0 0.25rem;
  color: var(--ui-on-surface);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
}

.privacy-markdown :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--ui-outline);
  border-radius: var(--radius-control);
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-caption);
  line-height: 1.5;
}

.privacy-markdown :deep(th),
.privacy-markdown :deep(td) {
  min-width: 8rem;
  border-bottom: 1px solid var(--ui-divider);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

.privacy-markdown :deep(tbody tr:last-child td) {
  border-bottom: 0;
}

.privacy-markdown :deep(th) {
  background: var(--ui-surface-sunken);
  color: var(--ui-on-surface);
  font-weight: 600;
}

@media (min-width: 40rem) {
  .privacy-section {
    padding: 1.5rem;
  }
}
</style>
