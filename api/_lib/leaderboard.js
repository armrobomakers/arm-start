import crypto from "node:crypto";
import { get, put } from "@vercel/blob";

export const LEADERBOARD_PATH = "arm-leaderboard/coupons.json";
export const LEADERBOARD_MAX_BODY_BYTES = 256 * 1024;
export const LEADERBOARD_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export class LeaderboardError extends Error {
  constructor(message, { statusCode = 400, code = "leaderboard_error" } = {}) {
    super(message);
    this.name = "LeaderboardError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function verifyLeaderboardSignature({ headers, rawBody, secret, now = Date.now() }) {
  if (!secret) {
    throw new LeaderboardError("Leaderboard secret is not configured", {
      statusCode: 503,
      code: "secret_not_configured",
    });
  }

  const timestamp = String(headers["x-arm-timestamp"] || "").trim();
  const signature = String(headers["x-arm-signature"] || "").trim().toLowerCase();
  const timestampMs = Number(timestamp) * 1000;
  if (!/^\d{10,13}$/.test(timestamp) || !Number.isFinite(timestampMs)) {
    throw new LeaderboardError("Invalid signature timestamp", { code: "invalid_signature" });
  }
  if (Math.abs(now - timestampMs) > LEADERBOARD_SIGNATURE_MAX_AGE_MS) {
    throw new LeaderboardError("Signature has expired", { code: "expired_signature" });
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
    throw new LeaderboardError("Invalid signature", { code: "invalid_signature" });
  }
}

function normalizeRow(row, index) {
  const name = String(row?.name || "").trim();
  const coupons = Number(row?.coupons);
  if (!name || !Number.isInteger(coupons) || coupons < 1 || coupons > 1_000_000) return null;
  return {
    rank: index + 1,
    name: name.slice(0, 160),
    coupons,
  };
}

export function normalizeLeaderboardPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new LeaderboardError("Payload must be an object");
  }
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map(normalizeRow).filter(Boolean).slice(0, 1000)
    : [];
  const updatedAt = new Date(payload.updatedAt);
  const periodStart = String(payload.periodStart || "").trim();
  const currency = String(payload.currency || "").trim().toUpperCase();
  const couponStepAmount = Number(payload.couponStepAmount);
  if (!Number.isFinite(updatedAt.getTime()) || !periodStart || !/^[A-Z]{3}$/.test(currency)) {
    throw new LeaderboardError("Payload metadata is invalid");
  }
  if (!Number.isFinite(couponStepAmount) || couponStepAmount <= 0 || couponStepAmount > 1_000_000_000) {
    throw new LeaderboardError("Coupon step amount is invalid");
  }

  return {
    version: 1,
    updatedAt: updatedAt.toISOString(),
    periodStart: periodStart.slice(0, 40),
    currency,
    couponStepAmount,
    participants: rows.length,
    totalCoupons: rows.reduce((sum, row) => sum + row.coupons, 0),
    rows,
  };
}

export async function readLeaderboard() {
  const result = await get(LEADERBOARD_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return normalizeLeaderboardPayload(await new Response(result.stream).json());
}

export async function writeLeaderboard(payload) {
  const normalized = normalizeLeaderboardPayload(payload);
  await put(LEADERBOARD_PATH, JSON.stringify(normalized), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
  return normalized;
}
