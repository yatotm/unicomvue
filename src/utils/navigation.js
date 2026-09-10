import { LayoutGrid, Layers, Menu, Settings } from "@lucide/vue";

// 四个目的地，侧栏和底部标签栏共用一份，顺序即焦点顺序。
export const NAV_ITEMS = Object.freeze([
  { name: "dashboard", label: "看板", icon: LayoutGrid, hint: "余量总览与按到期时间分组的资源" },
  { name: "usage", label: "用量明细", icon: Menu, hint: "逐条列出流量、语音与短信资源" },
  { name: "services", label: "已订业务", icon: Layers, hint: "联通已订业务清单与生效日期" },
  { name: "settings", label: "设置", icon: Settings, hint: "主题、刷新、账号与隐私" },
]);
