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
  calculatePointerEndpoint,
} from "../src/lib/armIndicatorCore.js";
import { ARM_INDICATOR_FIXTURE_METRICS } from "../src/lib/armIndicatorFixture.js";

test("score-to-angle mapping keeps the gauge endpoints and center", () => {
  assert.deepEqual([-100, -60, -20, 0, 20, 60, 100].map(scoreToAngle), [-90, -54, -18, 0, 18, 54, 90]);
  assert.equal(scoreToAngle(-82), -73.8);
});

test("score -82 produces direct pointer coordinates", () => {
  const pointer = calculatePointerEndpoint(-82);
  assert.ok(Math.abs(pointer.x - 87.8) < 0.1);
  assert.ok(Math.abs(pointer.y - 105.2) < 0.1);
});

test("indicator UI keeps approved Russian labels and data states", () => {
  const source = readFileSync(new URL("../src/components/ArmInvestorIndicator.jsx", import.meta.url), "utf8");
  assert.match(source, /Сильная зона пополнения/);
  assert.match(source, /Зона фиксации прибыли/);
  assert.match(source, /Текущая зона/);
  assert.match(source, /Данные по состоянию на/);
  assert.match(source, /Данные временно не обновляются/);
  assert.match(source, /arm-indicator-card/);
  assert.match(source, /arm-indicator-main-grid arm-dashboard-grid/);
  assert.match(source, /Что это значит/);
  assert.match(source, /Как читать шкалу/);
  assert.match(source, /arm-indicator-info-panel/);
  assert.match(source, /arm-indicator-center/);
  assert.match(source, /arm-indicator-legend-panel/);
  assert.match(source, /arm-indicator-status-pill/);
  assert.match(source, /NEEDLE_LENGTH = 116/);
  assert.match(source, /className="arm-gauge-pointer"/);
  assert.match(source, /className="arm-gauge-pointer-tip"/);
  assert.match(source, /arm-gauge-score-overlay/);
  assert.match(source, /arm-score-value/);
  assert.match(source, /arm-score-label/);
  assert.match(source, /--arm-zone-color/);
  assert.ok(source.indexOf('className="arm-gauge-pointer"') < source.indexOf('className="arm-indicator-needle-hub"'));
  assert.ok(source.indexOf('className="arm-gauge-pointer-tip"') < source.indexOf('className="arm-indicator-needle-hub"'));
  assert.doesNotMatch(source, /className="arm-gauge-pointer"[^>]*transform|markerEnd|clipPath|mask=/s);
  assert.match(source, /viewBox="0 0 420 215"/);
  assert.ok(source.indexOf("</svg>") < source.indexOf('className="arm-gauge-score-overlay"'));
  assert.doesNotMatch(source, /className="arm-indicator-score|score-caption/);
  assert.doesNotMatch(source, /arm-indicator-logo|brandLogo|arm-indicator-layout/);
  assert.doesNotMatch(source, /Сильная покупка|Покупка|Risk Zone/);
});

test("indicator dashboard keeps the implementable three-panel hierarchy", () => {
  const css = readFileSync(new URL("../src/styles/armIndicator.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-areas:\s*"info gauge legend"/);
  assert.match(css, /\.arm-indicator-info-panel/);
  assert.match(css, /\.arm-indicator-legend-panel/);
  assert.match(css, /\.arm-indicator-gauge-wrap\s*\{[^}]*520px/s);
  assert.match(css, /\.arm-score-value\s*\{[^}]*font-size:\s*clamp\(58px, 5\.5vw, 76px\)/s);
  assert.match(css, /\.arm-indicator-signal-title\s*\{[^}]*font-size:\s*clamp\(30px, 3\.2vw, 42px\)/s);
  assert.match(css, /\.arm-indicator-legend-line strong[^}]*font-size:\s*12px/s);
  assert.match(css, /\.arm-indicator-legend-copy p[^}]*font-size:\s*10\.5px/s);
  assert.match(css, /color-mix\(in srgb, var\(--arm-zone-color\)/);
  assert.doesNotMatch(css, /\.arm-indicator-card\s*\{[^}]*min-height/s);
  assert.doesNotMatch(css, /\.arm-gauge-pointer\s*\{[^}]*(?:transform|transform-origin|filter)/s);
});

test("mobile layout separates score from the gauge and keeps readable sizing", () => {
  const css = readFileSync(new URL("../src/styles/armIndicator.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.arm-gauge-score-overlay\s*\{[^}]*position:\s*static/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.arm-gauge-score-overlay\s*\{[^}]*transform:\s*none/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.arm-score-value\s*\{[^}]*clamp\(50px, 14\.5vw, 56px\)/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.arm-gauge-pointer\s*\{[^}]*stroke-width:\s*5/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.arm-indicator-signal-title\s*\{[^}]*clamp\(26px, 7\.6vw, 29px\)/s);
});

test("page content uses the browser-verified top offsets", () => {
  const css = readFileSync(new URL("../src/styles/armIndicator.css", import.meta.url), "utf8");
  assert.match(css, /\.doc-page-indicator\s*\{[^}]*padding-top:\s*16px/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.doc-page-indicator\s*\{[^}]*padding-top:\s*12px/s);
});

test("visual fixture intercepts the current endpoint with the approved snapshot", () => {
  const fixture = readFileSync(new URL("../scripts/arm-indicator-visual-fixture.cjs", import.meta.url), "utf8");
  assert.match(fixture, /\/api\/arm-indicator\/current/);
  assert.match(fixture, /score: -82/);
  assert.match(fixture, /dataAsOf: "2026-07-31"/);
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
