import test from "node:test";
import assert from "node:assert/strict";

import { getStorageMode } from "../api/_lib/armIndicatorStorage.js";
import { loadIndicatorState, syncIndicatorState } from "../api/_lib/armIndicatorService.js";

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("Vercel Production forces durable blob storage over local", () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    ARM_INDICATOR_STORAGE: process.env.ARM_INDICATOR_STORAGE,
  };
  process.env.VERCEL_ENV = "production";
  process.env.ARM_INDICATOR_STORAGE = "local";
  try {
    assert.equal(getStorageMode(), "blob");
  } finally {
    restoreEnv(previous);
  }
});

test("Vercel Production never falls back to fixture when persisted MT5 state is absent", async () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    ARM_INDICATOR_STORAGE: process.env.ARM_INDICATOR_STORAGE,
    ARM_INDICATOR_DATA_SOURCE: process.env.ARM_INDICATOR_DATA_SOURCE,
  };
  process.env.VERCEL_ENV = "production";
  process.env.ARM_INDICATOR_STORAGE = "none";
  process.env.ARM_INDICATOR_DATA_SOURCE = "fixture";
  try {
    const state = await loadIndicatorState();
    assert.equal(state.current, null);
    assert.equal(state.source, "mt5-vps");
    assert.equal(state.storageMode, "none");
    assert.equal(state.persisted, false);
  } finally {
    restoreEnv(previous);
  }
});

test("legacy sync path is read-only in Production MT5 mode", async () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    ARM_INDICATOR_STORAGE: process.env.ARM_INDICATOR_STORAGE,
    ARM_INDICATOR_DATA_SOURCE: process.env.ARM_INDICATOR_DATA_SOURCE,
    MYFXBOOK_EMAIL: process.env.MYFXBOOK_EMAIL,
    MYFXBOOK_PASSWORD: process.env.MYFXBOOK_PASSWORD,
  };
  process.env.VERCEL_ENV = "production";
  process.env.ARM_INDICATOR_STORAGE = "none";
  process.env.ARM_INDICATOR_DATA_SOURCE = "myfxbook";
  process.env.MYFXBOOK_EMAIL = "legacy@example.com";
  process.env.MYFXBOOK_PASSWORD = "legacy-secret";
  try {
    await assert.rejects(
      () => syncIndicatorState(),
      /MT5-published indicator state is not available yet/,
    );
  } finally {
    restoreEnv(previous);
  }
});
