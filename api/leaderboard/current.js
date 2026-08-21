import { readLeaderboard } from "../_lib/leaderboard.js";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "method_not_allowed" });
  }
  try {
    const data = await readLeaderboard();
    if (!data) return sendJson(response, 404, { ok: false, error: "leaderboard_unavailable" });
    return sendJson(response, 200, { ok: true, data });
  } catch {
    return sendJson(response, 503, { ok: false, error: "leaderboard_unavailable" });
  }
}
