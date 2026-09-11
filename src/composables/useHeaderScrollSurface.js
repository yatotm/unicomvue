import { computed, onBeforeUnmount, onMounted, readonly, ref } from "vue";

export const HEADER_SCROLL_DISTANCE = 160;
export const HEADER_BACKGROUND_MAX_PERCENT = 88;
export const HEADER_BORDER_MAX_PERCENT = 100;
export const HEADER_BACKDROP_MAX_PX = 18;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundCssValue(value) {
  return Math.round(value * 1_000) / 1_000;
}

export function getHeaderScrollProgress(scrollTop, distance = HEADER_SCROLL_DISTANCE) {
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const safeDistance = Number.isFinite(distance) && distance > 0
    ? distance
    : HEADER_SCROLL_DISTANCE;

  return clamp(safeScrollTop / safeDistance, 0, 1);
}

export function getHeaderSurfaceStyle(progress) {
  const safeProgress = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;

  return {
    "--header-background-mix": `${roundCssValue(safeProgress * HEADER_BACKGROUND_MAX_PERCENT)}%`,
    "--header-border-mix": `${roundCssValue(safeProgress * HEADER_BORDER_MAX_PERCENT)}%`,
    "--header-backdrop-blur": `${roundCssValue(safeProgress * HEADER_BACKDROP_MAX_PX)}px`,
  };
}

// 滚动主人随断点变：lg: 以上是 .main-scroll，以下是文档（见 ui-guidelines §0.1.1）。
// 绑死 window.scrollY 会让顶栏在桌面端永远停在「未滚动」态。
function readScrollTop() {
  const owner = globalThis.document?.querySelector(".main-scroll");
  if (owner && owner.scrollHeight > owner.clientHeight) {
    return Number.isFinite(owner.scrollTop) ? owner.scrollTop : 0;
  }
  const scrollTop = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
  return Number.isFinite(scrollTop) ? scrollTop : 0;
}

export function useHeaderScrollSurface(options = {}) {
  const distance = options.distance ?? HEADER_SCROLL_DISTANCE;
  const progress = ref(0);
  let animationFrameId = null;

  function syncProgress() {
    animationFrameId = null;
    progress.value = getHeaderScrollProgress(readScrollTop(), distance);
  }

  function scheduleSync() {
    if (animationFrameId !== null) return;
    animationFrameId = globalThis.requestAnimationFrame(syncProgress);
  }

  onMounted(() => {
    syncProgress();
    globalThis.addEventListener("scroll", scheduleSync, { passive: true, capture: true });
  });

  onBeforeUnmount(() => {
    globalThis.removeEventListener("scroll", scheduleSync, { capture: true });
    if (animationFrameId !== null) globalThis.cancelAnimationFrame(animationFrameId);
  });

  return {
    progress: readonly(progress),
    surfaceStyle: computed(() => getHeaderSurfaceStyle(progress.value)),
  };
}
