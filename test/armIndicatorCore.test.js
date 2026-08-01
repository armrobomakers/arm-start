import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildIndicatorSnapshot,
  calculateIndicatorScore,
  getZoneForScore,
  normalizeDataDailyPayload,
  normalizeDailyGainPayload,
  parseMyfxbookDate,
  trimDailyGainToLastCompletedDay,
  scoreToAngle,
  scoreToNeedleTransform,
} from "../src/lib/armIndicatorCore.js";
import { ARM_INDICATOR_FIXTURE_METRICS } from "../src/lib/armIndicatorFixture.js";
test("score-to-angle mapping keeps the gauge endpoints and center", () => {
  assert.deepEqual([-100, -60, -20, 0, 20, 60, 100].map(scoreToAngle), [-90, -54, -18, 0, 18, 54, 90]);
  assert.equal(scoreToAngle(-82), -73.8);
});

test("score -82 produces a visible SVG needle transform", () => {
  assert.equal(scoreToNeedleTransform(-82), "rotate(-73.8 180 166)");
});

test("indicator UI keeps approved Russian labels and data states", () => {
  const source = readFileSync(new URL("../src/components/ArmInvestorIndicator.jsx", import.meta.url), "utf8");
  assert.match(source, /Сильная зона пополнения/);
  assert.match(source, /Зона фиксации прибыли/);
  assert.match(source, /Текущая зона/);
  assert.match(source, /Данные по состоянию на/);
  assert.match(source, /Данные временно не обновляются/);
  assert.match(source, /scoreToNeedleTransform\(score, GAUGE_CENTER\.x, GAUGE_CENTER\.y\)/);
  assert.doesNotMatch(source, /arm-indicator-logo|brandLogo/);
  assert.doesNotMatch(source, /Сильная покупка|Покупка|Risk Zone/);
});

test("fixture snapshot stays in strong buy zone and close to the expected score", () => {
  const snapshot = buildIndicatorSnapshot({
    metrics: ARM_INDICATOR_FIXTURE_METRICS,
    dataAsOf: "2026-07-20",
    updatedAt: "2026-07-21T06:15:00.000Z",
  });

  assert.equal(snapshot.zone, "strong_buy");
  assert.equal(getZoneForScore(snapshot.score), "strong_buy");
  assert.ok(Math.abs(snapshot.score + 72) <= 2);
});

test("approved score formula covers buy, neutral and profit control cases", () => {
  assert.equal(calculateIndicatorScore({ currentDrawdownPct: -40, momentumPct: -30, daysSinceHigh: 240 }).score, -100);
  assert.ok(Math.abs(calculateIndicatorScore({
    currentDrawdownPct: -33.9,
    return30dPct: -15.5,
    return60dPct: -16.7,
    return90dPct: -23.1,
    daysSinceHigh: 164,
  }).score + 72) <= 1);
  assert.equal(calculateIndicatorScore({ currentDrawdownPct: -3, momentumPct: 0, daysSinceHigh: 0 }).zone, "neutral");
  assert.equal(calculateIndicatorScore({ currentDrawdownPct: -3, momentumPct: 15, daysSinceHigh: 15 }).zone, "profit");
  assert.equal(calculateIndicatorScore({ currentDrawdownPct: -1, momentumPct: 30, daysSinceHigh: 10 }).zone, "strong_profit");
});

test("zone mapping keeps the five approved boundaries", () => {
  assert.deepEqual([-100, -60, -59, -21, -20, 0, 20, 21, 59, 60, 100].map(getZoneForScore), [
    "strong_buy", "strong_buy", "buy", "buy", "neutral", "neutral", "neutral", "profit", "profit", "strong_profit", "strong_profit",
  ]);
});

test("normalizeDailyGainPayload flattens, sorts and deduplicates dates", () => {
  const payload = {
    dailyGain: [
      [{ date: "02/02/2026", value: 1.2, profit: 1 }],
      { date: "02/01/2026", value: 0.8, profit: 0.6 },
      [{ date: "02/02/2026", value: 1.6, profit: 1.4 }],
    ],
  };

  const normalized = normalizeDailyGainPayload(payload);

  assert.deepEqual(normalized, [
    { date: "2026-02-01", value: 0.8, profit: 0.6 },
    { date: "2026-02-02", value: 1.6, profit: 1.4 },
  ]);
});

test("daily gain never treats growthEquity as a return value", () => {
  assert.deepEqual(normalizeDailyGainPayload({ dailyGain: [{ date: "02/01/2026", growthEquity: 18 }] }), []);
});

test("data daily has a separate normalized shape", () => {
  assert.deepEqual(normalizeDataDailyPayload({ dataDaily: [{ date: "02/01/2026", balance: 100, growthEquity: 4, lots: 2 }] }), [
    { date: "2026-02-01", balance: 100, floatingPL: null, profit: null, growthEquity: 4, pips: null, lots: 2 },
  ]);
});

test("parseMyfxbookDate keeps month/day order", () => {
  assert.equal(parseMyfxbookDate("02/01/2010").toISOString().slice(0, 10), "2010-02-01");
});

test("trimDailyGainToLastCompletedDay removes the unfinished current day", () => {
  const trimmed = trimDailyGainToLastCompletedDay(
    [
      { date: "2026-07-20", value: 1 },
      { date: "2026-07-21", value: 2 },
    ],
    {
      timeZone: "UTC",
      referenceDate: new Date("2026-07-21T12:00:00.000Z"),
    },
  );

  assert.deepEqual(trimmed, [{ date: "2026-07-20", value: 1 }]);
});
