import test from "node:test";
import assert from "node:assert/strict";
import {
  ARM_INDICATOR_MODEL_VERSION,
  calculateIndicatorScoreV2,
  calculateMetricsFromDailyGainV2,
  normalizeReturnTo30Days,
} from "../src/lib/armIndicatorV2.js";

test("V2 normalizes different horizons to a comparable 30-day rate", () => {
  assert.ok(Math.abs(normalizeReturnTo30Days(21, 60) - 10) < 0.1);
  assert.ok(Math.abs(normalizeReturnTo30Days(46.41, 90) - 13.5) < 0.2);
});

test("recovery lock keeps the fund in replenishment zone until the prior balance high is recovered", () => {
  const result = calculateIndicatorScoreV2({
    currentDrawdownPct: -5,
    shortMomentumPct: 1.2,
    longMomentumPct: 0.8,
    momentumPct: 0.94,
    daysSinceHigh: 120,
    recoveryActive: true,
  });
  assert.equal(result.score, -21);
  assert.equal(result.zone, "buy");
});

test("profit zone requires near-high balance plus positive short and long momentum", () => {
  assert.equal(calculateIndicatorScoreV2({
    currentDrawdownPct: -1,
    shortMomentumPct: 2,
    longMomentumPct: 1.5,
    momentumPct: 1.675,
    daysSinceHigh: 5,
    recoveryActive: false,
  }).zone, "profit");
  assert.notEqual(calculateIndicatorScoreV2({
    currentDrawdownPct: -4,
    shortMomentumPct: 2,
    longMomentumPct: 1.5,
    momentumPct: 1.675,
    daysSinceHigh: 5,
    recoveryActive: false,
  }).zone, "profit");
});

test("V2 calculates 180-day and 365-day horizons and exposes model metadata", () => {
  const points = [];
  const cursor = new Date("2025-01-01T00:00:00.000Z");
  for (let index = 0; index < 400; index += 1) {
    points.push({ date: cursor.toISOString().slice(0, 10), value: index < 200 ? 0.05 : index < 250 ? -0.4 : 0.08 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const { metrics } = calculateMetricsFromDailyGainV2(points);
  assert.equal(metrics.modelVersion, ARM_INDICATOR_MODEL_VERSION);
  assert.equal(typeof metrics.return180dPct, "number");
  assert.equal(typeof metrics.return365dPct, "number");
  assert.ok(metrics.coverage365d >= 0.99);
  assert.equal(metrics.recoveryActive, true);
});
