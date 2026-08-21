import {
  LeaderboardError,
  LEADERBOARD_MAX_BODY_BYTES,
  normalizeLeaderboardPayload,
  verifyLeaderboardSignature,
  writeLeaderboard,
} from "../_lib/leaderboard.js";

async function readRawBody(request) {
  if (typeof request.body === "string") return request.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > LEADERBOARD_MAX_BODY_BYTES) {
      throw new LeaderboardError("Request body is too large", { statusCode: 413, code: "payload_too_large" });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }

  try {
    const rawBody = await readRawBody(request);
    verifyLeaderboardSignature({ headers: request.headers, rawBody, secret: process.env.LEADERBOARD_PUSH_SECRET });
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new LeaderboardError("Request body is not valid JSON", { code: "invalid_json" });
    }
    const normalized = normalizeLeaderboardPayload(payload);
    const current = await writeLeaderboard(normalized);
    return sendJson(response, 200, { ok: true, updatedAt: current.updatedAt, participants: current.participants });
  } catch (error) {
    const known = error instanceof LeaderboardError;
    return sendJson(response, known ? error.statusCode : 503, {
      ok: false,
      error: known ? error.code : "publish_failed",
      message: known ? error.message : "Leaderboard publish failed",
    });
  }
}
