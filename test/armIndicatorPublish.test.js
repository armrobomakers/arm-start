import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublishSignature, publishIndicatorPayload, validatePublishPayload, verifyPublishSignature } from "../api/_lib/armIndicatorPublish.js";
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

test("publish validation uses ARM indicator metadata instead of legacy Myfxbook variables", () => {
  const previous = {
    system: process.env.ARM_INDICATOR_SYSTEM_ID,
    account: process.env.ARM_INDICATOR_ACCOUNT_NAME,
    oldSystem: process.env.MYFXBOOK_SYSTEM_ID,
    oldAccount: process.env.MYFXBOOK_EXPECTED_ACCOUNT_NAME,
  };
  process.env.ARM_INDICATOR_SYSTEM_ID = "arm-system";
  process.env.ARM_INDICATOR_ACCOUNT_NAME = "ARM account";
  process.env.MYFXBOOK_SYSTEM_ID = "legacy-system";
  process.env.MYFXBOOK_EXPECTED_ACCOUNT_NAME = "Legacy account";
  try {
    const payload = validatePublishPayload({
      version: 1,
      systemId: "arm-system",
      accountName: "ARM account",
      dailyGain: [{ date: "2026-07-31", value: 1 }],
    });
    assert.equal(payload.systemId, "arm-system");
    assert.equal(payload.accountName, "ARM account");
    assert.throws(() => validatePublishPayload({
      version: 1,
      systemId: "legacy-system",
      accountName: "Legacy account",
      dailyGain: [{ date: "2026-07-31", value: 1 }],
    }), /does not match/);
  } finally {
    for (const [key, value] of Object.entries({
      ARM_INDICATOR_SYSTEM_ID: previous.system,
      ARM_INDICATOR_ACCOUNT_NAME: previous.account,
      MYFXBOOK_SYSTEM_ID: previous.oldSystem,
      MYFXBOOK_EXPECTED_ACCOUNT_NAME: previous.oldAccount,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("published snapshot and state use MT5 source metadata", async () => {
  const previous = process.env.ARM_INDICATOR_STORAGE;
  process.env.ARM_INDICATOR_STORAGE = "none";
  try {
    const result = await publishIndicatorPayload({
      version: 1,
      systemId: "11020435",
      accountName: "ARM TICKMILL VIP FUND",
      fetchedAt: "2026-08-01T00:00:00.000Z",
      dailyGain: [
        { date: "2026-07-30", value: 1 },
        { date: "2026-07-31", value: -0.5 },
      ],
    }, { referenceDate: new Date("2026-08-01T12:00:00.000Z") });
    assert.equal(result.snapshot.source, "mt5-vps");
    assert.equal(result.state.source, "mt5-vps");
    assert.equal(result.state.diagnostics.source, "windows-mt5-vps");
  } finally {
    if (previous === undefined) delete process.env.ARM_INDICATOR_STORAGE;
    else process.env.ARM_INDICATOR_STORAGE = previous;
  }
});

test("active publish path contains no legacy Myfxbook VPS source marker", () => {
  const source = readFileSync(new URL("../api/_lib/armIndicatorPublish.js", import.meta.url), "utf8");
  assert.equal(source.includes("myfxbook-vps"), false);
});
