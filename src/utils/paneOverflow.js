import { onBeforeUnmount, ref, watch } from "vue";

// A pane that scrolls internally has to be reachable from the keyboard and has to announce
// itself — but a pane that happens to fit must not add a dead tab stop. So the flag is measured,
// not assumed, and re-measured whenever either the pane or its content changes size.
export function usePaneOverflow(paneRef, contentRef) {
  const overflowing = ref(false);
  let observer = null;

  function measure() {
    const pane = paneRef.value;
    overflowing.value = Boolean(pane) && pane.scrollHeight - pane.clientHeight > 2;
  }

  function observe() {
    observer?.disconnect();
    if (typeof ResizeObserver !== "function") return;
    observer ??= new ResizeObserver(measure);
    for (const element of [paneRef.value, contentRef.value]) {
      if (element) observer.observe(element);
    }
    measure();
  }

  watch([paneRef, contentRef], observe, { immediate: true, flush: "post" });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { overflowing };
}
