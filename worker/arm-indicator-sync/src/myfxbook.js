import { normalizeDailyGain } from "./normalize.js";

export class MyfxbookError extends Error {
  constructor(message, code = "myfxbook_error") { super(message); this.name = "MyfxbookError"; this.code = code; }
}

async function request(endpoint, params, { fetchImpl, timeoutMs }) {
  const url = new URL(`https://www.myfxbook.com/api/${endpoint}.json`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new MyfxbookError(`Myfxbook HTTP ${response.status}`, "http");
  const body = await response.json();
  if (body.error === true || body.error === "true") {
    const message = body.message || "Myfxbook API error";
    const code = String(message).toLowerCase().includes("invalid session") ? "session" : "api";
    throw new MyfxbookError(message, code);
  }
  return body;
}

export async function fetchDailyGain(config, { fetchImpl = fetch } = {}) {
  let sessionId;
  try {
    const login = await request("login", { email: config.email, password: config.password }, { fetchImpl, timeoutMs: config.requestTimeoutMs });
    sessionId = login.session;
    if (!sessionId) throw new MyfxbookError("Myfxbook login returned no session", "session");
    const accounts = await request("get-my-accounts", { session: sessionId }, { fetchImpl, timeoutMs: config.requestTimeoutMs });
    const account = (accounts.accounts || []).find((item) => String(item.id) === String(config.systemId));
    if (!account) throw new MyfxbookError("Configured Myfxbook account was not found", "account");
    if (String(account.name || "").trim() !== config.accountName.trim()) throw new MyfxbookError("Myfxbook account name mismatch", "account");
    const daily = await request("get-daily-gain", { session: sessionId, id: config.systemId, start: config.historyStart }, { fetchImpl, timeoutMs: config.requestTimeoutMs });
    const dailyGain = normalizeDailyGain(daily);
    if (!dailyGain.length) throw new MyfxbookError("Myfxbook dailyGain is empty or invalid", "payload");
    return { dailyGain, account };
  } finally {
    if (sessionId) {
      try { await request("logout", { session: sessionId }, { fetchImpl, timeoutMs: config.requestTimeoutMs }); } catch { /* logout must not hide the primary result */ }
    }
  }
}
