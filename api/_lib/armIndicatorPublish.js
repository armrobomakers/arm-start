import crypto from "node:crypto";
import {
  buildIndicatorSnapshot,
  calculateMetricsFromDailyGain,
  isDataStale,
  normalizeDailyGainEntry,
  normalizeSnapshotForTransport,
  trimDailyGainToLastCompletedDay,
} from "../../src/lib/armIndicatorCore.js";
import { readIndicatorState, writeIndicatorState } from "./armIndicatorStorage.js";

export const PUBLISH_MAX_BODY_BYTES = 512 * 1024;
export const PUBLISH_MAX_POINTS = 5000;
export const PUBLISH_TIMESTAMP_WINDOW_SECONDS = 5 * 60;
export const PUBLISH_MAX_DAILY_VALUE_PCT = 1000;
const DEFAULT_SYSTEM_ID = "11020435";
const DEFAULT_ACCOUNT_NAME = "ARM TICKMILL VIP FUND";

export class ArmIndicatorPublishError extends Error {
  constructor(message, { statusCode = 400, code = "invalid_payload" } = {}) {
    super(message);
    this.name = "ArmIndicatorPublishError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function headerValue(headers, name) {
  const target = name.toLowerCase();
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === target);
  return key ? String(headers[key] || "") : "";
}

export function createPublishSignature(secret, timestamp, rawBody) {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

export function verifyPublishSignature({ headers, rawBody, secret, now = Date.now() }) {
  if (!secret) {
    throw new ArmIndicatorPublishError("Publish secret is not configured", { statusCode: 500, code: "server_config" });
  }

  const timestampText = headerValue(headers, "x-arm-timestamp");
  const signature = headerValue(headers, "x-arm-signature");
  const timestamp = Number(timestampText);

  if (!/^\d+$/.test(timestampText) || !Number.isSafeInteger(timestamp)) {
    throw new ArmIndicatorPublishError("Invalid publish timestamp", { statusCode: 401, code: "unauthorized" });
  }

  if (Math.abs(Math.floor(now / 1000) - timestamp) > PUBLISH_TIMESTAMP_WINDOW_SECONDS) {
    throw new ArmIndicatorPublishError("Publish timestamp is outside the allowed window", { statusCode: 401, code: "replay_rejected" });
  }

  const expected = createPublishSignature(secret, timestampText, rawBody);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new ArmIndicatorPublishError("Invalid publish signature", { statusCode: 401, code: "unauthorized" });
  }

  return { timestamp };
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePublishPayload(payload, {
  systemId = process.env.MYFXBOOK_SYSTEM_ID || DEFAULT_SYSTEM_ID,
  accountName = process.env.MYFXBOOK_EXPECTED_ACCOUNT_NAME || DEFAULT_ACCOUNT_NAME,
} = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ArmIndicatorPublishError("Payload must be a JSON object");
  }

  if (payload.version !== 1) {
    throw new ArmIndicatorPublishError("Unsupported payload version");
  }

  if (String(payload.systemId) !== String(systemId)) {
    throw new ArmIndicatorPublishError("Payload systemId does not match the configured system", { statusCode: 403, code: "wrong_system" });
  }

  if (String(payload.accountName || "").trim() !== String(accountName).trim()) {
    throw new ArmIndicatorPublishError("Payload accountName does not match the configured account", { statusCode: 403, code: "wrong_account" });
  }

  if (!Array.isArray(payload.dailyGain) || payload.dailyGain.length === 0) {
    throw new ArmIndicatorPublishError("dailyGain must be a non-empty array");
  }

  if (payload.dailyGain.length > PUBLISH_MAX_POINTS) {
    throw new ArmIndicatorPublishError("dailyGain contains too many points", { statusCode: 413, code: "payload_too_large" });
  }

  const deduped = new Map();
  for (const entry of payload.dailyGain) {
    if (!parseDateOnly(entry?.date)) {
      throw new ArmIndicatorPublishError("dailyGain contains an invalid date");
    }

    const normalized = normalizeDailyGainEntry(entry);
    const value = Number(entry?.value);
    if (!normalized || !Number.isFinite(value) || Math.abs(value) > PUBLISH_MAX_DAILY_VALUE_PCT) {
      throw new ArmIndicatorPublishError("dailyGain contains an invalid value");
    }

    deduped.set(normalized.date, normalized);
  }

  return {
    version: 1,
    systemId: String(payload.systemId),
    accountName: String(payload.accountName).trim(),
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null,
    dailyGain: [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function upsertHistory(history, snapshot, maxLength = 180) {
  const next = (Array.isArray(history) ? history : []).filter((item) => item?.dataAsOf !== snapshot.dataAsOf);
  next.push(snapshot);
  next.sort((left, right) => String(left.dataAsOf).localeCompare(String(right.dataAsOf)));
  return next.slice(-maxLength);
}

export async function publishIndicatorPayload(payload, { referenceDate = new Date() } = {}) {
  const validated = validatePublishPayload(payload);
  const state = await readIndicatorState();
  const currentDataAsOf = state?.current?.dataAsOf || null;

  const completedDailyGain = trimDailyGainToLastCompletedDay(validated.dailyGain, {
    timeZone: process.env.ARM_INDICATOR_TIMEZONE || "Europe/Moscow",
    referenceDate,
  });

  if (!completedDailyGain.length) {
    throw new ArmIndicatorPublishError("dailyGain has no completed trading day");
  }

  const { dataAsOf, metrics } = calculateMetricsFromDailyGain(completedDailyGain);
  if (currentDataAsOf && dataAsOf < currentDataAsOf) {
    throw new ArmIndicatorPublishError("Payload is older than the current snapshot", { statusCode: 409, code: "stale_payload" });
  }

  const snapshot = buildIndicatorSnapshot({
    dataAsOf,
    updatedAt: new Date().toISOString(),
    source: "myfxbook-vps",
    stale: false,
    metrics,
  });
  const nextState = {
    version: 1,
    current: normalizeSnapshotForTransport(snapshot),
    history: upsertHistory(state?.history, snapshot),
    updatedAt: snapshot.updatedAt,
    source: "myfxbook-vps",
    diagnostics: {
      source: "windows-vps",
      fetchedAt: validated.fetchedAt,
      points: validated.dailyGain.length,
      dataAsOf,
    },
  };

  await writeIndicatorState(nextState);
  return { snapshot: nextState.current, dataAsOf, points: validated.dailyGain.length };
}

export function applyDynamicStale(snapshot, { referenceDate = new Date(), maxAgeDays = 4 } = {}) {
  if (!snapshot) return null;
  return { ...snapshot, stale: Boolean(snapshot.stale || isDataStale(snapshot.dataAsOf, { maxAgeDays, referenceDate })) };
}
