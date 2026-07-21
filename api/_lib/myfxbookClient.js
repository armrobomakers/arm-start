import {
  calculateMetricsFromDailyGain,
  formatYmdInTimeZone,
  normalizeDailyGainPayload,
  parseMyfxbookDate,
  trimDailyGainToLastCompletedDay,
} from "../../src/lib/armIndicatorCore.js";
import {
  MyfxbookAccountNotFoundError,
  MyfxbookApiError,
  MyfxbookHttpError,
  MyfxbookInvalidPayloadError,
  MyfxbookInvalidSessionError,
} from "./myfxbookErrors.js";

const MYFXBOOK_BASE_URL = "https://www.myfxbook.com/api";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRY_DELAY_MS = [5000, 15000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(method, params) {
  const url = new URL(`${MYFXBOOK_BASE_URL}/${method}.json`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function fetchJson(method, params, { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  try {
    const url = buildUrl(method, params);
    let response;

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      throw new MyfxbookHttpError(`Myfxbook ${method} request failed`, {
        status: 0,
        url: url.toString(),
        cause: error,
      });
    }

    const responseText = await response.text();
    let body = null;

    try {
      body = JSON.parse(responseText);
    } catch {
      throw new MyfxbookInvalidPayloadError(`Myfxbook ${method} returned invalid JSON`, {
        endpoint: method,
      });
    }

    if (!response.ok) {
      throw new MyfxbookHttpError(`Myfxbook ${method} failed with HTTP ${response.status}`, {
        status: response.status,
        url: response.url,
        responseText,
      });
    }

    if (typeof body !== "object" || body === null) {
      throw new MyfxbookInvalidPayloadError(`Myfxbook ${method} returned a non-object payload`, {
        endpoint: method,
      });
    }

    if (!("error" in body) || !("message" in body)) {
      throw new MyfxbookInvalidPayloadError(`Myfxbook ${method} payload is missing error/message fields`, {
        endpoint: method,
        payload: body,
      });
    }

    if (body.error === true) {
      const message = String(body.message || "Unknown Myfxbook API error");
      const lower = message.toLowerCase();

      if (lower.includes("invalid session") || lower.includes("session expired")) {
        throw new MyfxbookInvalidSessionError(message, {
          endpoint: method,
          payload: body,
        });
      }

      throw new MyfxbookApiError(message, {
        endpoint: method,
        payload: body,
      });
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loginMyfxbook({ email, password, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const payload = await fetchJson("login", { email, password }, { timeoutMs });
  const session = String(payload.session || "");

  if (!session) {
    throw new MyfxbookInvalidPayloadError("Myfxbook login returned an empty session", {
      endpoint: "login",
      payload,
    });
  }

  return session;
}

export async function logoutMyfxbook({ session, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!session) {
    return;
  }

  try {
    await fetchJson("logout", { session }, { timeoutMs });
  } catch {
    // Logout is best effort only.
  }
}

export async function getMyfxbookAccounts({ session, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const payload = await fetchJson("get-my-accounts", { session }, { timeoutMs });
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : null;

  if (!accounts) {
    throw new MyfxbookInvalidPayloadError("Myfxbook get-my-accounts payload does not contain accounts[]", {
      endpoint: "get-my-accounts",
      payload,
    });
  }

  return accounts;
}

export async function getMyfxbookDailyGain({
  session,
  accountId,
  startDate,
  endDate,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const payload = await fetchJson(
    "get-daily-gain",
    {
      session,
      id: accountId,
      start: startDate,
      end: endDate,
    },
    { timeoutMs },
  );

  const normalized = normalizeDailyGainPayload(payload);
  if (!normalized.length) {
    throw new MyfxbookInvalidPayloadError("Myfxbook get-daily-gain payload does not contain valid dailyGain points", {
      endpoint: "get-daily-gain",
      payload,
    });
  }

  return normalized;
}

export async function getMyfxbookDataDaily({
  session,
  accountId,
  startDate,
  endDate,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const payload = await fetchJson(
    "get-data-daily",
    {
      session,
      id: accountId,
      start: startDate,
      end: endDate,
    },
    { timeoutMs },
  );

  const normalized = normalizeDailyGainPayload(payload);
  if (!normalized.length) {
    throw new MyfxbookInvalidPayloadError("Myfxbook get-data-daily payload does not contain valid data points", {
      endpoint: "get-data-daily",
      payload,
    });
  }

  return normalized;
}

function resolveAccountId(accounts, systemId) {
  const expectedId = Number(systemId);
  return accounts.find((account) => Number(account.id) === expectedId) ?? null;
}

export function parseMyfxbookResponseDate(value) {
  return parseMyfxbookDate(value);
}

export async function syncIndicatorFromMyfxbook({
  email,
  password,
  systemId,
  expectedAccountName,
  historyStart,
  timezone = "Europe/Moscow",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryInvalidSession = true,
}) {
  async function runSingleSyncAttempt() {
    const session = await loginMyfxbook({ email, password, timeoutMs });
    let account = null;

    try {
      const accounts = await getMyfxbookAccounts({ session, timeoutMs });
      account = resolveAccountId(accounts, systemId);

      if (!account) {
        throw new MyfxbookAccountNotFoundError(`Account ${systemId} not found in get-my-accounts response`, {
          systemId,
          expectedAccountName,
        });
      }

      const accountName = String(account.name || "").trim();
      const warnings = [];

      if (expectedAccountName && accountName && accountName !== expectedAccountName) {
        warnings.push(`Account name mismatch: expected "${expectedAccountName}", got "${accountName}"`);
      }

      const latestDate = formatYmdInTimeZone(new Date(), timezone) ?? new Date().toISOString().slice(0, 10);
      const dailyGain = await getMyfxbookDailyGain({
        session,
        accountId: account.id,
        startDate: historyStart,
        endDate: latestDate,
        timeoutMs,
      });

      const trimmedSeries = trimDailyGainToLastCompletedDay(dailyGain, {
        timeZone: timezone,
        referenceDate: new Date(),
      });

      let series = trimmedSeries;

      if (!series.length) {
        series = await getMyfxbookDataDaily({
          session,
          accountId: account.id,
          startDate: historyStart,
          endDate: latestDate,
          timeoutMs,
        });
      }

      if (!series.length) {
        throw new MyfxbookInvalidPayloadError("Myfxbook returned no daily data", {
          endpoint: "get-daily-gain",
          payload: { dailyGain },
        });
      }

      const asOfPoint = series.at(-1)?.date ?? latestDate;
      const { dataAsOf, metrics } = calculateMetricsFromDailyGain(series, { asOfDate: asOfPoint });
      const dataDaily = await getMyfxbookDataDaily({
        session,
        accountId: account.id,
        startDate: historyStart,
        endDate: latestDate,
        timeoutMs,
      }).catch((error) => {
        warnings.push(`get-data-daily cross-check unavailable: ${error.message}`);
        return [];
      });
      const dataDailyLastPoint = dataDaily.at(-1) ?? null;

      if (dataDailyLastPoint?.date && dataDailyLastPoint.date !== dataAsOf) {
        warnings.push(`Cross-check latest date mismatch: dailyGain=${dataAsOf}, dataDaily=${dataDailyLastPoint.date}`);
      }

      const accountDrawdown = Number(account.drawdown);
      if (Number.isFinite(accountDrawdown)) {
        const drawdownDelta = Math.abs(accountDrawdown - Math.abs(metrics.currentDrawdownPct));
        if (drawdownDelta > 8) {
          warnings.push(
            `Drawdown cross-check warning: account.drawdown=${accountDrawdown.toFixed(2)} vs reconstructed=${Math.abs(metrics.currentDrawdownPct).toFixed(2)}`,
          );
        }
      }

      return {
        dataAsOf,
        metrics,
        source: "myfxbook",
        sourceSystemId: String(systemId),
        account: {
          id: account.id,
          accountId: account.accountId,
          name: accountName,
        },
        warnings,
        rawSeriesLength: series.length,
        timezone,
        crossCheck: {
          dailyGainLastDate: dataAsOf,
          dataDailyLastDate: dataDailyLastPoint?.date ?? null,
          dataDailyLength: dataDaily.length,
        },
      };
    } finally {
      await logoutMyfxbook({ session, timeoutMs });
    }
  }

  try {
    return await runSingleSyncAttempt();
  } catch (error) {
    if (!(error instanceof MyfxbookInvalidSessionError) || !retryInvalidSession) {
      throw error;
    }

    await sleep(200);
    return runSingleSyncAttempt();
  }
}

export function getRetryDelays() {
  return [...DEFAULT_RETRY_DELAY_MS];
}
