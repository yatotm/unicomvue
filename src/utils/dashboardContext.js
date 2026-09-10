// The shell owns the polling dashboard; the four routed views read it. Kept out of
// `src/composables/` so the frozen data pipeline stays exactly as it is — this file only
// carries the injection key.
import { inject, provide } from "vue";

export const dashboardInjectionKey = Symbol("dashboard");

export function provideDashboard(context) {
  provide(dashboardInjectionKey, context);
}

export function useDashboardContext() {
  const context = inject(dashboardInjectionKey, null);
  if (!context) throw new Error("Dashboard context is not available");
  return context;
}
