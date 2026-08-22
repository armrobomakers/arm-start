import { readLeaderboard } from "../_lib/leaderboard.js";
import { findPublicParticipants } from "../_lib/leaderboardPublic.js";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { ok: false, error: "method_not_allowed" });
  }

  const query = String(request.query?.q || "").trim().slice(0, 80);
  const isId = /^\d+$/.test(query);
  if ((!isId && query.length < 2) || (isId && query.length < 6)) {
    return sendJson(response, 400, { ok: false, error: "query_too_short" });
  }

  try {
    const data = await readLeaderboard();
    if (!data) return sendJson(response, 404, { ok: false, error: "leaderboard_unavailable" });
    return sendJson(response, 200, { ok: true, matches: findPublicParticipants(data, query) });
  } catch {
    return sendJson(response, 503, { ok: false, error: "leaderboard_unavailable" });
  }
}
