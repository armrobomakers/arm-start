import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, normalizeDailyGain } from "../src/normalize.js";
import { signPayload, publishPayload } from "../src/publish.js";

test("normalizes only dailyGain and accepts Myfxbook date formats", () => {
  assert.equal(parseDate("02/03/2026"), "2026-02-03");
  assert.equal(parseDate("2026-02-31"), null);
  assert.deepEqual(normalizeDailyGain({ dailyGain: [[{ date: "2026-02-03", value: 1.2 }, { date: "02/04/2026", gain: -0.4 }]] }), [
    { date: "2026-02-03", value: 1.2 }, { date: "2026-02-04", value: -0.4 },
  ]);
  assert.deepEqual(normalizeDailyGain({ dataDaily: [{ date: "2026-02-03", growthEquity: 10 }] }), []);
});

test("signs the exact timestamp and body", () => {
  assert.match(signPayload("a".repeat(32), "1700000000", '{"x":1}'), /^v1=[0-9a-f]{64}$/);
});

test("publication retries twice before succeeding", async () => {
  let calls = 0;
  const sleeps = [];
  const result = await publishPayload({ version: 1 }, {
    publishUrl: "https://example.test/api/arm-indicator/publish",
    publishSecret: "a".repeat(32),
    requestTimeoutMs: 1000,
  }, {
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary");
      return { ok: true, status: 200 };
    },
    sleep: async (ms) => sleeps.push(ms),
  });
  assert.deepEqual(result, { attempts: 3 });
  assert.deepEqual(sleeps, [5000, 15000]);
});
