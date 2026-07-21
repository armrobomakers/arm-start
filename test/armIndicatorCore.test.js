import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIndicatorSnapshot,
  getZoneForScore,
  normalizeDailyGainPayload,
  parseMyfxbookDate,
  trimDailyGainToLastCompletedDay,
} from "../src/lib/armIndicatorCore.js";
import { ARM_INDICATOR_FIXTURE_METRICS } from "../src/lib/armIndicatorFixture.js";

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
