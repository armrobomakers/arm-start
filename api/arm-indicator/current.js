import { loadPublicCurrentSnapshot } from "../_lib/armIndicatorService.js";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  try {
    const snapshot = await loadPublicCurrentSnapshot();

    if (!snapshot) {
      return sendJson(response, 503, {
        status: "unavailable",
        message: "Indicator data is not available yet",
      });
    }

    return sendJson(response, 200, snapshot);
  } catch (error) {
    return sendJson(response, 503, {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Indicator data is not available yet",
    });
  }
}
