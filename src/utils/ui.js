// 收敛层的**配方**部分：只有 class 串重复、markup 不重复的图形写在这里，一份定义，
// 每个 call site 原样引用。markup 也重复的那些做成了组件（AppButton / AppSection /
// StatusChip / SegmentedControl / AccountList / SkeletonSection / SectionNote / ProgressTrack）。
//
// 这里不许出现任何字面颜色值，只许出现 token 派生的工具类名——和 .vue 文件同一条规矩。

// 过渡：全项目只有一种时长和一条曲线用在颜色变化上。
export const TRANSITION = "transition-colors duration-150 ease-standard";

// 覆盖层 hover/active。选中态**不**叠它：一个已经是当前的东西不需要再被强调一次。
export const HOVER_OVERLAY = "hover:bg-hover-overlay active:bg-pressed-overlay";

export const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

// 焦点环只有两种，按「控件离容器边有多近」二选一，不许两不沾：
//   · FOCUS_RING       —— 控件四周有余量（按钮、图标钮、输入框），环画在外面；
//   · FOCUS_RING_INSET —— 控件贴着容器边（整行的导航项、账号行、分段控件的一格），
//                          环画在里面，否则它会被相邻元素或容器的 overflow 裁掉。
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
export const FOCUS_RING_INSET = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

// 按钮：一套底座，五个变体。高度 44px（触摸基线）→ 36px（指针），全项目同一档；
// 之前对话框里那一套 40px 是补丁留下的第三档，已经并回来了。
export const BUTTON_BASE = `inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-body ${TRANSITION} ${FOCUS_RING} ${DISABLED} sm:h-9`;

// 变体各有各的岗位，不是同一件事的五种画法：
//   filled   主操作，一屏最多一个。600 的粗细就是「这是主要的那一个」的全部含义。
//   outlined 次操作，需要一条 3:1 的边界才站得住。
//   text     第三档操作，只有墨色。
//   danger   破坏性操作，永远是 text 的形状 + 危险墨，不做成实心（实心红是警报，不是按钮）。
//   shell    站在**外壳面**（顶栏）上的控件：外壳是半透明的画布色，控件必须自带一块纸色面，
//            否则它就是「写在画布上的字」换了个形状。这是顶栏专用的一档。
export const BUTTON_VARIANTS = Object.freeze({
  filled: `bg-primary font-semibold text-on-primary hover:bg-primary-hover active:bg-primary-pressed`,
  outlined: `border border-outline text-on-surface ${HOVER_OVERLAY}`,
  text: `text-primary-ink ${HOVER_OVERLAY}`,
  danger: `text-danger-ink ${HOVER_OVERLAY}`,
  shell: `bg-surface-raised text-on-surface-variant hover:text-on-surface ${HOVER_OVERLAY}`,
});

// 标题行：一个可换行的基线行，左边标题、右边（ml-auto）计数或状态。抬头 band 和每个区块的
// 标题行是同一个形状，只有字号和竖向节奏不同，所以行本身在这里定义一次。
// px-5 / sm:px-6 就是全项目唯一的左右插入量（手机 20px，指针 24px）：卡片不再有内边距，
// 分隔线必须通到两边，所以文字到卡片外沿的距离全部由这一个值给出。
export const HEADING_ROW = "flex flex-wrap items-baseline gap-x-3 gap-y-1.5 px-5 sm:px-6";

// 抬头 band 里那个标题的字号：手机 17px，指针 22px。两个 call site（PageHeader 的默认标题，
// 以及看板那个「点击复制 token」的标题按钮）必须原样引用同一个串——套餐名在两条路由上
// 用两种字号，正是补丁式改法留下的痕迹。
export const PAGE_TITLE = "text-title text-on-surface sm:text-display";

// 只有一个图标的按钮（对话框的关闭）。44px 见方的圆形命中区，两个对话框共用。
export const ICON_BUTTON = `inline-flex size-11 shrink-0 items-center justify-center rounded-dot text-on-surface-variant ${TRANSITION} hover:text-on-surface ${HOVER_OVERLAY} ${FOCUS_RING}`;

// 一行可点的条目：侧栏导航项、顶栏菜单里的链接、账号行。它们贴着容器边，所以用内嵌焦点环。
export const NAV_ROW = `flex min-h-11 min-w-0 items-center gap-3 rounded-control px-3 text-body ${TRANSITION} ${FOCUS_RING_INSET}`;

// 看板那三段 band 的落位。真实视图和骨架屏必须**逐字**一致，否则数字落地时整页会跳一下——
// 之前它们是两份抄写（连 DashboardHero 那两段 grid CSS 都在骨架屏里抄了一遍）。现在是同一个
// 常量，一致性由 import 保证，不再靠一条「两边都得写这串」的测试去追。
// 流量占满左列的两行，语音和短信各占右列一行：显式落位同时保证网格没有空格子——
// 接缝网格的底色就是分隔线色，空格子会露成一整块分隔线色的矩形。
export const HERO_BAND = "ui-seams grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr]";
export const FACT_BAND = "ui-seams grid-cols-2 sm:grid-cols-4";
export const CHART_BAND = "ui-seams min-w-0 grow lg:min-h-0 @[60rem]:grid-cols-[minmax(0,1fr)_21.25rem]";
export const CHART_CELLS = Object.freeze([
  "@[60rem]:col-start-1 @[60rem]:row-start-1 @[60rem]:row-span-2",
  "@[60rem]:col-start-2 @[60rem]:row-start-1",
  "@[60rem]:col-start-2 @[60rem]:row-start-2",
]);
