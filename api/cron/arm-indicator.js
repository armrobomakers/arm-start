import { syncIndicatorState, toPublicCurrentResponse } from "../_lib/armIndicatorService.js";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function getBearerToken(headerValue) {
  const raw = String(headerValue || "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const expectedSecret = String(process.env.CRON_SECRET || "");
  const receivedSecret = getBearerToken(request.headers.authorization);

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  try {
    const result = await syncIndicatorState({ days: 365 });
    return sendJson(response, 200, {
      ok: true,
      current: toPublicCurrentResponse(result.current),
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    return sendJson(response, 503, {
      ok: false,
      error: error instanceof Error ? error.message : "Indicator sync failed",
    });
  }
}
