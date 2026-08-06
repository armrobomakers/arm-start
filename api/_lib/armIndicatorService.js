import { createFixtureHistory, createFixtureSnapshot } from "../../src/lib/armIndicatorFixture.js";
import {
  buildIndicatorSnapshot,
  normalizeSnapshotForTransport,
} from "../../src/lib/armIndicatorCore.js";
import { readIndicatorState, writeIndicatorState } from "./armIndicatorStorage.js";
import {
  MyfxbookAccountNotFoundError,
  MyfxbookApiError,
  MyfxbookHttpError,
  MyfxbookInvalidPayloadError,
  MyfxbookInvalidSessionError,
  MyfxbookStaleDataError,
} from "./myfxbookErrors.js";
import { syncIndicatorFromMyfxbook } from "./myfxbookClient.js";
import { applyDynamicStale } from "./armIndicatorPublish.js";

const MAX_HISTORY_LENGTH = 180;

function resolveDataSource() {
  return (process.env.ARM_INDICATOR_DATA_SOURCE || "fixture").toLowerCase();
}

function resolveStorageMode() {
  return (process.env.ARM_INDICATOR_STORAGE || "local").toLowerCase();
}

function upsertHistory(history, snapshot) {
  const nextHistory = (history || []).filter((item) => item?.dataAsOf !== snapshot.dataAsOf);
  nextHistory.push(snapshot);
  nextHistory.sort((left, right) => String(left.dataAsOf).localeCompare(String(right.dataAsOf)));
  return nextHistory.slice(-MAX_HISTORY_LENGTH);
}

function sanitizeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message
    .replaceAll(process.env.MYFXBOOK_EMAIL || "", "[redacted]")
    .replaceAll(process.env.MYFXBOOK_PASSWORD || "", "[redacted]");
}

function isMyfxbookUnavailableError(error) {
  return (
    error instanceof MyfxbookHttpError ||
    error instanceof MyfxbookApiError ||
    error instanceof MyfxbookInvalidSessionError ||
    error instanceof MyfxbookInvalidPayloadError
  );
}

function buildStateSnapshot(snapshot, extras = {}) {
  return {
    ...normalizeSnapshotForTransport(snapshot),
    ...extras,
  };
}

export async function loadIndicatorState({ days = 90 } = {}) {
  const state = await readIndicatorState();
  const dataSource = resolveDataSource();

  if (state?.current) {
    return {
      current: normalizeSnapshotForTransport(state.current),
      history: Array.isArray(state.history) ? state.history.slice(-days).map(normalizeSnapshotForTransport) : [],
      source: state.current.source || dataSource,
      storageMode: resolveStorageMode(),
      persisted: true,
    };
  }

  if (dataSource === "fixture") {
    const current = createFixtureSnapshot();
    return {
      current: normalizeSnapshotForTransport(current),
      history: createFixtureHistory(days),
      source: "fixture",
      storageMode: resolveStorageMode(),
      persisted: false,
    };
  }

  return {
    current: null,
    history: [],
    source: dataSource,
    storageMode: resolveStorageMode(),
    persisted: false,
  };
}

export async function loadPublicCurrentSnapshot() {
  const state = await loadIndicatorState({ days: 90 });

  if (!state.current) {
    return null;
  }

  return {
    ...applyDynamicStale(state.current, {
      maxAgeDays: Number(process.env.ARM_INDICATOR_MAX_AGE_DAYS || 4),
    }),
  };
}

export async function loadPublicHistory(days = 90) {
  const normalizedDays = Math.max(1, Math.min(365, Math.round(Number(days) || 90)));
  const state = await loadIndicatorState({ days: normalizedDays });

  if (state.history?.length) {
    return state.history.slice(-normalizedDays).map((snapshot) => ({
      ...snapshot,
      stale: Boolean(snapshot.stale),
    }));
  }

  if (state.current) {
    return [state.current];
  }

  return null;
}

export async function syncIndicatorState({ referenceDate = new Date(), days = 365 } = {}) {
  const dataSource = resolveDataSource();
  const storageMode = resolveStorageMode();

  if (dataSource === "fixture") {
    const current = createFixtureSnapshot(referenceDate);
    const history = createFixtureHistory(days, referenceDate);
    const state = {
      version: 1,
      current: normalizeSnapshotForTransport(current),
      history: history.map(normalizeSnapshotForTransport),
      updatedAt: new Date().toISOString(),
      source: "fixture",
      sourceSystemId: process.env.MYFXBOOK_SYSTEM_ID || "11020435",
      account: {
        id: Number(process.env.MYFXBOOK_SYSTEM_ID || 11020435),
        name: process.env.MYFXBOOK_EXPECTED_ACCOUNT_NAME || "ARM TICKMILL VIP FUND",
      },
      diagnostics: {
        mode: "fixture",
      },
    };

    if (storageMode !== "none") {
      await writeIndicatorState(state);
    }

    return {
      current: state.current,
      history: state.history,
      diagnostics: state.diagnostics,
      persisted: storageMode !== "none",
    };
  }

  const config = {
    email: process.env.MYFXBOOK_EMAIL,
    password: process.env.MYFXBOOK_PASSWORD,
    systemId: process.env.MYFXBOOK_SYSTEM_ID || 11020435,
    expectedAccountName: process.env.MYFXBOOK_EXPECTED_ACCOUNT_NAME || "ARM TICKMILL VIP FUND",
    historyStart: process.env.MYFXBOOK_HISTORY_START || "2024-07-01",
    timezone: process.env.ARM_INDICATOR_TIMEZONE || "Europe/Moscow",
  };

  if (!config.email || !config.password) {
    throw new MyfxbookInvalidPayloadError("Myfxbook credentials are not configured", {
      endpoint: "syncIndicatorState",
    });
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const liveResult = await syncIndicatorFromMyfxbook(config);
      const previousState = (await readIndicatorState()) ?? null;
      const currentSnapshot = buildIndicatorSnapshot({
        dataAsOf: liveResult.dataAsOf,
        updatedAt: new Date().toISOString(),
        source: "myfxbook",
        stale: false,
        metrics: liveResult.metrics,
      });

      const state = {
        version: 1,
        current: buildStateSnapshot(currentSnapshot, {
          sourceSystemId: liveResult.sourceSystemId,
          account: liveResult.account,
          warnings: liveResult.warnings,
          rawSeriesLength: liveResult.rawSeriesLength,
          crossCheck: liveResult.crossCheck,
        }),
        history: upsertHistory(previousState?.history || [], currentSnapshot),
        updatedAt: new Date().toISOString(),
        source: "myfxbook",
        sourceSystemId: liveResult.sourceSystemId,
        account: liveResult.account,
        diagnostics: {
          syncStartedAt: new Date().toISOString(),
          syncFinishedAt: new Date().toISOString(),
          dataAsOf: liveResult.dataAsOf,
          dailyPointsCount: liveResult.rawSeriesLength,
          warnings: liveResult.warnings,
          crossCheck: liveResult.crossCheck,
          myfxbook: liveResult.diagnostics,
        },
      };

      if (storageMode !== "none") {
        await writeIndicatorState(state);
      }

      return {
        current: state.current,
        history: state.history,
        diagnostics: state.diagnostics,
        persisted: storageMode !== "none",
      };
    } catch (error) {
      lastError = error;

      if (error instanceof MyfxbookAccountNotFoundError) {
        throw error;
      }

      if (error instanceof MyfxbookInvalidPayloadError) {
        throw error;
      }

      if (attempt === 2 || !isMyfxbookUnavailableError(error)) {
        break;
      }
    }
  }

  const previousState = await readIndicatorState();
  if (previousState?.current) {
    const staleSnapshot = buildStateSnapshot(previousState.current, {
      stale: true,
      dataAsOf: previousState.current.dataAsOf,
    });

    const nextState = {
      ...previousState,
      current: staleSnapshot,
      updatedAt: new Date().toISOString(),
      diagnostics: {
        ...(previousState.diagnostics || {}),
        stale: true,
        errorType: lastError?.name || "UnknownError",
        errorMessage: sanitizeErrorMessage(lastError),
        errorStage: lastError?.syncStage || null,
        myfxbook: lastError?.myfxbookDiagnostics || null,
        recovered: true,
      },
    };

    if (storageMode !== "none") {
      await writeIndicatorState(nextState);
    }

    return {
      current: staleSnapshot,
      history: (previousState.history || []).slice(-days).map(normalizeSnapshotForTransport),
      diagnostics: nextState.diagnostics,
      persisted: storageMode !== "none",
      warning: sanitizeErrorMessage(lastError),
    };
  }

  const staleError = new MyfxbookStaleDataError("Indicator data is not available yet", {
    cause: lastError?.name || "UnknownError",
  });
  staleError.cause = lastError;
  throw staleError;
}

export function toPublicCurrentResponse(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    score: snapshot.score,
    zone: snapshot.zone,
    zoneLabel: snapshot.zoneLabel,
    recommendation: snapshot.recommendation,
    dataAsOf: snapshot.dataAsOf,
    updatedAt: snapshot.updatedAt,
    stale: Boolean(snapshot.stale),
  };
}

export function toPublicHistoryResponse(history) {
  if (!Array.isArray(history)) {
    return null;
  }

  return history.map((snapshot) => toPublicCurrentResponse(snapshot)).filter(Boolean);
}
