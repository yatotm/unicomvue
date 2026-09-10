import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter } from "../src/ratelimit.js";

function fixedClock(start = 1_000) {
  const state = { value: start };
  return { now: () => state.value, advance: (ms) => { state.value += ms; } };
}

test("createRateLimiter allows calls up to the limit", () => {
  const limiter = createRateLimiter({ now: fixedClock().now });
  assert.equal(limiter.take("phone", 2), true);
  assert.equal(limiter.take("phone", 2), true);
  assert.equal(limiter.take("phone", 2), false);
});

test("createRateLimiter keys are independent", () => {
  const limiter = createRateLimiter({ now: fixedClock().now });
  assert.equal(limiter.take("a", 1), true);
  assert.equal(limiter.take("a", 1), false);
  assert.equal(limiter.take("b", 1), true);
});

test("createRateLimiter resets after the window elapses", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ now: clock.now, windowMs: 1_000 });

  assert.equal(limiter.take("phone", 1), true);
  assert.equal(limiter.take("phone", 1), false);
  clock.advance(1_001);
  assert.equal(limiter.take("phone", 1), true);
});

test("createRateLimiter treats a non-positive limit as unlimited", () => {
  const limiter = createRateLimiter({ now: fixedClock().now });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.equal(limiter.take("phone", 0), true);
  }
});

test("容量耗尽时不能挤掉已有的限流记录", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ now: clock.now, windowMs: 1000, maxKeys: 1 });
  assert.equal(limiter.take("a", 1), true);
  assert.equal(limiter.take("b", 1), false);
  assert.equal(limiter.take("a", 1), false);
  clock.advance(1001);
  assert.equal(limiter.take("b", 1), true);
});
