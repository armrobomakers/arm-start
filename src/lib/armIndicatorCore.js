const DEFAULT_TIME_ZONE = "Europe/Moscow";
const DEFAULT_UPDATE_HOUR_UTC = 6;

export const ARM_INDICATOR_TICKS = [-100, -60, -20, 0, 20, 60, 100];

export const ARM_INDICATOR_ZONE_META = {
  strong_buy: {
    label: "СИЛЬНАЯ ЗОНА ПОПОЛНЕНИЯ",
    recommendation: "Хорошая точка для увеличения капитала",
    tone: "buy",
  },
  buy: {
    label: "ЗОНА ПОПОЛНЕНИЯ",
    recommendation: "Можно рассмотреть увеличение капитала",
    tone: "buy",
  },
  neutral: {
    label: "НЕЙТРАЛЬНАЯ ЗОНА",
    recommendation: "Ждать / ничего не делать",
    tone: "neutral",
  },
  profit: {
    label: "ЗОНА ФИКСАЦИИ ПРИБЫЛИ",
    recommendation: "Можно зафиксировать часть прибыли",
    tone: "profit",
  },
  strong_profit: {
    label: "СИЛЬНАЯ ЗОНА ФИКСАЦИИ ПРИБЫЛИ",
    recommendation: "Хорошая точка для фиксации прибыли",
    tone: "profit",
  },
};

Object.assign(ARM_INDICATOR_ZONE_META, {
  strong_buy: { ...ARM_INDICATOR_ZONE_META.strong_buy, label: "Сильная зона пополнения", recommendation: "Хорошая точка для увеличения капитала" },
  buy: { ...ARM_INDICATOR_ZONE_META.buy, label: "Зона пополнения", recommendation: "Можно рассмотреть увеличение капитала" },
  neutral: { ...ARM_INDICATOR_ZONE_META.neutral, label: "Нейтральная зона", recommendation: "Ждать / ничего не делать" },
  profit: { ...ARM_INDICATOR_ZONE_META.profit, label: "Зона фиксации прибыли", recommendation: "Можно зафиксировать часть прибыли" },
  strong_profit: { ...ARM_INDICATOR_ZONE_META.strong_profit, label: "Сильная зона фиксации прибыли", recommendation: "Хорошая точка для фиксации прибыли" },
});

export function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

export function scoreToAngle(score) {
  return (clamp(score, -100, 100) / 100) * 90;
}

export function scoreToNeedleTransform(score, centerX = 180, centerY = 166) {
  return `rotate(${scoreToAngle(score)} ${centerX} ${centerY})`;
}

export function roundTo(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function parseIndicatorNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatSignedPercent(value, digits = 1) {
  const rounded = roundTo(value, digits);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toFixed(digits)}%`;
}

export function formatSignedValue(value, digits = 1) {
  const rounded = roundTo(value, digits);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toFixed(digits)}`;
}

export function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function toUtcDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function parseMyfxbookDate(value) {
  const date = toUtcDate(value);

  if (!date) {
    throw new Error(`Invalid Myfxbook date: ${String(value)}`);
  }

  return date;
}

export function toYmd(value) {
  const date = value instanceof Date ? value : toUtcDate(value);

  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function formatYmdInTimeZone(referenceDate = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function fromYmd(ymd) {
  return toUtcDate(ymd);
}

export function addDays(date, amount) {
  const base = toUtcDate(date);
  if (!base) return null;

  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function previousBusinessDay(referenceDate = new Date()) {
  let cursor = toUtcDate(referenceDate);

  if (!cursor) {
    return null;
  }

  cursor = addDays(cursor, -1);

  while (cursor && isWeekend(cursor)) {
    cursor = addDays(cursor, -1);
  }

  return cursor;
}

export function diffCalendarDays(left, right) {
  const leftDate = toUtcDate(left);
  const rightDate = toUtcDate(right);

  if (!leftDate || !rightDate) {
    return 0;
  }

  const millis = rightDate.getTime() - leftDate.getTime();
  return Math.round(millis / 86400000);
}

export function formatDisplayDate(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = toUtcDate(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone,
  }).format(date);
}

export function formatDisplayDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function normalizeDailyGainEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const rawDate = entry.date ?? entry.Date ?? entry.day ?? entry.time ?? entry.timestamp;
  const date = toYmd(rawDate);
  const value = parseIndicatorNumber(entry.value ?? entry.gain ?? entry.dailyGain);
  const profit = parseIndicatorNumber(entry.profit ?? entry.balance ?? entry.equity);

  if (!date || !Number.isFinite(value)) {
    return null;
  }

  return {
    date,
    value: roundTo(value, 4),
    profit: Number.isFinite(profit) ? roundTo(profit, 2) : null,
  };
}

export function normalizeDailyGainPayload(payload) {
  const rawSeries = payload?.dailyGain ?? payload?.data ?? payload?.series ?? [];
  const flattened = Array.isArray(rawSeries) ? rawSeries.flat(2) : [];
  const deduped = new Map();

  for (const entry of flattened) {
    const normalized = normalizeDailyGainEntry(entry);
    if (!normalized) {
      continue;
    }

    deduped.set(normalized.date, normalized);
  }

  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeDataDailyEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const date = toYmd(entry.date ?? entry.Date ?? entry.day ?? entry.time ?? entry.timestamp);
  if (!date) {
    return null;
  }

  const read = (...keys) => {
    const value = keys.map((key) => entry[key]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    const parsed = parseIndicatorNumber(value);
    return Number.isFinite(parsed) ? roundTo(parsed, 4) : null;
  };

  return {
    date,
    balance: read("balance", "Balance"),
    floatingPL: read("floatingPL", "floatingProfit", "floating_profit", "FloatingPL"),
    profit: read("profit", "Profit"),
    growthEquity: read("growthEquity", "equity", "Equity"),
    pips: read("pips", "Pips"),
    lots: read("lots", "Lots"),
  };
}

export function normalizeDataDailyPayload(payload) {
  const rawSeries = payload?.dataDaily ?? payload?.data ?? payload?.series ?? [];
  const flattened = Array.isArray(rawSeries) ? rawSeries.flat(2) : [];
  const deduped = new Map();

  for (const entry of flattened) {
    const normalized = normalizeDataDailyEntry(entry);
    if (normalized) {
      deduped.set(normalized.date, normalized);
    }
  }

  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildGrowthCurve(dailyPoints) {
  const sorted = [...dailyPoints]
    .filter((point) => point && point.date && Number.isFinite(point.value))
    .sort((left, right) => left.date.localeCompare(right.date));

  const curve = [];
  let indexValue = 100;
  let peakValue = 100;
  let peakDate = sorted[0]?.date ?? null;

  for (const point of sorted) {
    indexValue *= 1 + point.value / 100;

    if (indexValue >= peakValue) {
      peakValue = indexValue;
      peakDate = point.date;
    }

    curve.push({
      ...point,
      indexValue: roundTo(indexValue, 4),
      peakValue: roundTo(peakValue, 4),
      peakDate,
      drawdownPct: peakValue > 0 ? roundTo(((indexValue - peakValue) / peakValue) * 100, 2) : 0,
    });
  }

  return curve;
}

export function pointAtOrBefore(curve, targetDate) {
  const targetYmd = toYmd(targetDate);

  if (!targetYmd || !curve.length) {
    return null;
  }

  let left = 0;
  let right = curve.length - 1;
  let candidate = null;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const current = curve[middle];

    if (current.date <= targetYmd) {
      candidate = current;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return candidate;
}

export function calculateRollingReturn(curve, daysBack, asOfDate) {
  if (!curve.length) {
    return 0;
  }

  const endPoint = pointAtOrBefore(curve, asOfDate) ?? curve[curve.length - 1];
  const startPoint = pointAtOrBefore(curve, addDays(endPoint.date, -daysBack)) ?? curve[0];

  if (!endPoint || !startPoint || !Number.isFinite(startPoint.indexValue) || startPoint.indexValue === 0) {
    return 0;
  }

  return roundTo(((endPoint.indexValue / startPoint.indexValue) - 1) * 100, 1);
}

export function calculateMomentumPct({ return30dPct = 0, return60dPct = 0, return90dPct = 0 }) {
  return roundTo(return30dPct * 0.5 + return60dPct * 0.3 + return90dPct * 0.2, 1);
}

export function getZoneForScore(score) {
  if (score <= -60) return "strong_buy";
  if (score <= -21) return "buy";
  if (score <= 20) return "neutral";
  if (score <= 59) return "profit";
  return "strong_profit";
}

export function getRecommendationForZone(zone) {
  return ARM_INDICATOR_ZONE_META[zone]?.recommendation ?? ARM_INDICATOR_ZONE_META.neutral.recommendation;
}

export function calculateIndicatorScore(metrics) {
  const drawdown = Math.abs(parseIndicatorNumber(metrics.currentDrawdownPct) ?? 0);
  const return30dPct = parseIndicatorNumber(metrics.return30dPct) ?? 0;
  const return60dPct = parseIndicatorNumber(metrics.return60dPct) ?? 0;
  const return90dPct = parseIndicatorNumber(metrics.return90dPct) ?? 0;
  const daysSinceHigh = Math.max(0, Math.round(parseIndicatorNumber(metrics.daysSinceHigh) ?? 0));
  const momentumPct = Number.isFinite(metrics.momentumPct)
    ? roundTo(metrics.momentumPct, 1)
    : calculateMomentumPct({ return30dPct, return60dPct, return90dPct });

  const ddNormalized = clamp((drawdown - 10) / 30, 0, 1);
  const negativeMomentumNormalized = clamp(-momentumPct / 30, 0, 1);
  const stagnationNormalized = clamp((daysSinceHigh - 30) / 210, 0, 1);
  const buyIntensity = ddNormalized * 0.6 + negativeMomentumNormalized * 0.25 + stagnationNormalized * 0.15;

  const positiveMomentumNormalized = clamp(momentumPct / 30, 0, 1);
  const nearHighNormalized = clamp(1 - drawdown / 10, 0, 1);
  const recentHighNormalized = clamp((30 - daysSinceHigh) / 20, 0, 1);
  const profitIntensity = positiveMomentumNormalized * (0.7 + nearHighNormalized * 0.2 + recentHighNormalized * 0.1);

  let score;
  if (drawdown < 10 && Math.abs(momentumPct) < 3) {
    score = Math.round(clamp((momentumPct / 3) * 20, -20, 20));
  } else if (drawdown >= 10 || momentumPct <= -3) {
    score = -Math.round(buyIntensity * 100);
  } else {
    score = Math.round(profitIntensity * 100);
  }

  score = clamp(score, -100, 100);

  const zone = getZoneForScore(score);
  const zoneMeta = ARM_INDICATOR_ZONE_META[zone];

  return {
    score,
    zone,
    zoneLabel: zoneMeta.label,
    recommendation: zoneMeta.recommendation,
    momentumPct,
  };
}

export function buildIndicatorSnapshot({
  metrics,
  dataAsOf,
  updatedAt = new Date().toISOString(),
  source = "fixture",
  stale = false,
}) {
  const scoreResult = calculateIndicatorScore(metrics);

  return {
    date: dataAsOf,
    dataAsOf,
    updatedAt,
    score: scoreResult.score,
    zone: scoreResult.zone,
    zoneLabel: scoreResult.zoneLabel,
    recommendation: scoreResult.recommendation,
    metrics: {
      currentDrawdownPct: roundTo(metrics.currentDrawdownPct, 1),
      return30dPct: roundTo(metrics.return30dPct, 1),
      return60dPct: roundTo(metrics.return60dPct, 1),
      return90dPct: roundTo(metrics.return90dPct, 1),
      momentumPct: roundTo(scoreResult.momentumPct, 1),
      daysSinceHigh: Math.max(0, Math.round(metrics.daysSinceHigh)),
    },
    source,
    stale,
  };
}

export function calculateMetricsFromDailyGain(dailyPoints, { asOfDate } = {}) {
  const curve = buildGrowthCurve(dailyPoints);

  if (!curve.length) {
    throw new Error("Daily gain series is empty");
  }

  const latestPoint = pointAtOrBefore(curve, asOfDate) ?? curve[curve.length - 1];

  if (!latestPoint) {
    throw new Error("Unable to resolve the latest completed point");
  }

  const return30dPct = calculateRollingReturn(curve, 30, latestPoint.date);
  const return60dPct = calculateRollingReturn(curve, 60, latestPoint.date);
  const return90dPct = calculateRollingReturn(curve, 90, latestPoint.date);
  const momentumPct = calculateMomentumPct({ return30dPct, return60dPct, return90dPct });
  const daysSinceHigh = Math.max(0, diffCalendarDays(latestPoint.peakDate, latestPoint.date));

  return {
    dataAsOf: latestPoint.date,
    metrics: {
      currentDrawdownPct: roundTo(latestPoint.drawdownPct, 1),
      return30dPct,
      return60dPct,
      return90dPct,
      momentumPct,
      daysSinceHigh,
    },
    curve,
  };
}

export function trimDailyGainToLastCompletedDay(dailyPoints, { timeZone = DEFAULT_TIME_ZONE, referenceDate = new Date() } = {}) {
  if (!Array.isArray(dailyPoints) || !dailyPoints.length) {
    return [];
  }

  const currentBrokerDate = formatYmdInTimeZone(referenceDate, timeZone);
  if (!currentBrokerDate) {
    return [...dailyPoints];
  }

  const sorted = [...dailyPoints].sort((left, right) => left.date.localeCompare(right.date));
  const lastPoint = sorted[sorted.length - 1];

  if (lastPoint?.date === currentBrokerDate) {
    return sorted.slice(0, -1);
  }

  return sorted;
}

export function isDataStale(dataAsOf, { maxAgeDays = 4, referenceDate = new Date() } = {}) {
  const asOfDate = toUtcDate(dataAsOf);
  const reference = previousBusinessDay(referenceDate) ?? referenceDate;

  if (!asOfDate) {
    return true;
  }

  return diffCalendarDays(asOfDate, reference) > maxAgeDays;
}

export function getDefaultUpdateTimeIso(referenceDate = new Date()) {
  const base = previousBusinessDay(referenceDate) ?? referenceDate;
  const updated = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), DEFAULT_UPDATE_HOUR_UTC, 15, 0));
  return updated.toISOString();
}

export function normalizeSnapshotForTransport(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    metrics: {
      ...snapshot.metrics,
      currentDrawdownPct: roundTo(snapshot.metrics.currentDrawdownPct, 1),
      return30dPct: roundTo(snapshot.metrics.return30dPct, 1),
      return60dPct: roundTo(snapshot.metrics.return60dPct, 1),
      return90dPct: roundTo(snapshot.metrics.return90dPct, 1),
      momentumPct: roundTo(snapshot.metrics.momentumPct, 1),
      daysSinceHigh: Math.max(0, Math.round(snapshot.metrics.daysSinceHigh)),
    },
  };
}
