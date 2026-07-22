import crypto from "node:crypto";

export function signPayload(secret, timestamp, body) {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
}

export async function publishPayload(payload, config, { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const body = JSON.stringify(payload);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetchImpl(config.publishUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-arm-timestamp": timestamp,
          "x-arm-signature": signPayload(config.publishSecret, timestamp, body),
          ...(config.protectionBypass ? { "x-vercel-protection-bypass": config.protectionBypass } : {}),
        },
        body,
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`Publish returned HTTP ${response.status}`);
      return { attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep([5000, 15000][attempt]);
    }
  }
  throw lastError;
}
