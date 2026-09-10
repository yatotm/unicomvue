import { onScopeDispose, unref, watch } from "vue";
import { useRoute } from "vue-router";

// 一个覆盖层要能被关掉，靠的是四件事，而不是一个铺在页面上的透明按钮：
//
//   1. 面板之外的 `pointerdown`（不是 `click`）——从面板里按下、拖到外面松手不算「外部点击」，
//      选文字和拖动因此不会误关；
//   2. Escape——挂在 **document 的捕获阶段**，不挂在某个 DOM 子树上。旧写法把 `@keydown.esc`
//      挂在布局的 `<div>` 上，而 macOS 的 Chrome 点按钮**不给按钮焦点**，键盘事件于是走的是
//      body → document，根本不经过那个 div，Escape 就失灵了；
//   3. 焦点离开面板（`focusin`）——键盘用户 Tab 出去时也得关；
//   4. 路由变化——菜单里点一个链接跳走，菜单不能留在屏幕上。
//
// 关掉之后焦点必须回到触发它的控件，`aria-expanded` 由调用方绑同一个 ref。
// 打开的覆盖层按顺序入栈：Escape 只关最上面那一个，所以从对话框里打开的菜单不会连带
// 把对话框一起关掉。

const stack = [];

function resolve(target) {
  const value = unref(target);
  if (!value) return null;
  return value instanceof Element ? value : (value.$el ?? null);
}

function contains(target, node) {
  const element = resolve(target);
  return Boolean(element && node instanceof Node && element.contains(node));
}

export function useDismissable(open, options = {}) {
  const {
    panel = null,
    trigger = null,
    // 「面板之外」对模态框来说就是遮罩，所以外部按下对两者是同一条规则；不同的只有焦点：
    // 模态框有焦点陷阱，焦点永远不会合法地离开它，这条就得关掉。
    outside = true,
    focusLeave = true,
    closable = () => true,
    onDismiss = null,
    returnFocus = true,
  } = options;

  const route = useRoute();
  const entry = {};
  let previouslyFocused = null;
  let bound = false;

  // `force` 只给「任务完成了，必须关」的路径用（比如登录成功），它跳过 closable 这道闸，
  // 但焦点归还照走同一条路。
  function dismiss({ force = false } = {}) {
    if (!open.value || (!force && !closable())) return false;
    const target = returnFocus ? (resolve(trigger) ?? previouslyFocused) : null;
    open.value = false;
    onDismiss?.();
    if (target?.isConnected) target.focus({ preventScroll: true });
    return true;
  }

  function onPointerDown(event) {
    if (!outside || !open.value) return;
    if (contains(panel, event.target) || contains(trigger, event.target)) return;
    dismiss();
  }

  function onFocusIn(event) {
    if (!focusLeave || !open.value) return;
    if (contains(panel, event.target) || contains(trigger, event.target)) return;
    // 焦点被挪到别处：关掉，但焦点已经有了新主人，不要再抢回去。
    if (!closable()) return;
    open.value = false;
    onDismiss?.();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape" || !open.value) return;
    if (stack.at(-1) !== entry) return;
    if (!dismiss()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function bind(active) {
    if (active === bound) return;
    bound = active;
    const method = active ? "addEventListener" : "removeEventListener";
    document[method]("pointerdown", onPointerDown, true);
    document[method]("focusin", onFocusIn, true);
    document[method]("keydown", onKeyDown, true);
  }

  watch(open, (isOpen) => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);

    if (!isOpen) {
      bind(false);
      previouslyFocused = null;
      return;
    }

    stack.push(entry);
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bind(true);
  }, { immediate: true, flush: "post" });

  watch(() => route.fullPath, () => {
    if (open.value) dismiss();
  });

  onScopeDispose(() => {
    bind(false);
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  });

  return { dismiss };
}
