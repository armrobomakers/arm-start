import { ArmIndicatorPublishError, PUBLISH_MAX_BODY_BYTES, publishIndicatorPayload, verifyPublishSignature } from "../_lib/armIndicatorPublish.js";

async function readRawBody(request) {
  if (typeof request.body === "string") {
    return request.body;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > PUBLISH_MAX_BODY_BYTES) {
      throw new ArmIndicatorPublishError("Request body is too large", { statusCode: 413, code: "payload_too_large" });
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
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  try {
    const rawBody = await readRawBody(request);
    if (Buffer.byteLength(rawBody, "utf8") > PUBLISH_MAX_BODY_BYTES) {
      throw new ArmIndicatorPublishError("Request body is too large", { statusCode: 413, code: "payload_too_large" });
    }

    verifyPublishSignature({
      headers: request.headers,
      rawBody,
      secret: process.env.ARM_INDICATOR_PUBLISH_SECRET,
    });

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new ArmIndicatorPublishError("Request body is not valid JSON");
    }

    const result = await publishIndicatorPayload(payload);
    return sendJson(response, 200, {
      ok: true,
      dataAsOf: result.dataAsOf,
      points: result.points,
      updatedAt: result.snapshot.updatedAt,
      score: result.snapshot.score,
      zone: result.snapshot.zone,
      source: result.snapshot.source,
    });
  } catch (error) {
    const statusCode = error instanceof ArmIndicatorPublishError ? error.statusCode : 503;
    return sendJson(response, statusCode, {
      ok: false,
      error: error instanceof ArmIndicatorPublishError ? error.code : "publish_failed",
      message: error instanceof ArmIndicatorPublishError ? error.message : "Indicator publish failed",
    });
  }
}
