import test from "node:test";
import assert from "node:assert/strict";
import { createPublishSignature, validatePublishPayload, verifyPublishSignature } from "../api/_lib/armIndicatorPublish.js";
import handler from "../api/arm-indicator/publish.js";

test("publish signature validates and rejects replay", () => {
  const secret = "s".repeat(32);
  const rawBody = '{"version":1}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  assert.deepEqual(verifyPublishSignature({
    headers: { "X-ARM-Timestamp": timestamp, "X-ARM-Signature": createPublishSignature(secret, timestamp, rawBody) },
    rawBody,
    secret,
  }), { timestamp: Number(timestamp) });
  assert.throws(() => verifyPublishSignature({
    headers: { "x-arm-timestamp": timestamp, "x-arm-signature": createPublishSignature(secret, timestamp, rawBody) },
    rawBody,
    secret,
    now: Date.now() + 6 * 60 * 1000,
  }), /outside the allowed window/);
});

test("publish payload rejects invalid dates and accepts canonical dailyGain", () => {
  assert.throws(() => validatePublishPayload({ version: 1, systemId: "11020435", accountName: "ARM TICKMILL VIP FUND", dailyGain: [{ date: "2026-02-31", value: 1 }] }), /invalid date/);
  const payload = validatePublishPayload({ version: 1, systemId: "11020435", accountName: "ARM TICKMILL VIP FUND", dailyGain: [{ date: "2026-02-02", value: 1 }] });
  assert.deepEqual(payload.dailyGain, [{ date: "2026-02-02", value: 1, profit: null }]);
});

test("publish endpoint rejects non-POST without reading a body", async () => {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.body.error, "Method not allowed");
});
