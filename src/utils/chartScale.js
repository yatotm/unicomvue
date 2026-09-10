// 图表几何：共用刻度、刻度线位置、点图坐标。全部是纯计算，没有 DOM。

// 落在这几个尾数上的刻度间隔读起来才是整数：15 / 25 / 500 而不是 14.3 / 23 / 512。
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];

function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const mantissa = rough / magnitude;
  return (NICE_STEPS.find((step) => mantissa <= step + 1e-9) ?? 10) * magnitude;
}

// 条长＝绝对额度，所以所有条共用一把从 0 开始的尺子；上界取一个整数刻度，不贴着最大值。
export function niceScale(maxValue, intervals = 4) {
  const safeIntervals = Math.max(1, Math.round(intervals));
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 0, step: 0, intervals: safeIntervals, ticks: [] };
  }

  const step = niceStep(maxValue / safeIntervals);
  const max = step * safeIntervals;
  const ticks = Array.from({ length: safeIntervals + 1 }, (_, index) => index * step);
  return { max, step, intervals: safeIntervals, ticks };
}

export function ratio(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

export function percent(value, max) {
  return ratio(value, max) * 100;
}

// 网格线只画中间那几根：两端由坐标轴的首末刻度交代。
export function gridRatios(tickCount) {
  return Array.from({ length: Math.max(0, tickCount - 2) }, (_, index) => (index + 1) / (tickCount - 1));
}
