import {
  ARM_INDICATOR_ZONE_META,
  addDays,
  buildGrowthCurve,
  clamp,
  diffCalendarDays,
  getZoneForScore,
  pointAtOrBefore,
  roundTo,
} from "./armIndicatorCore.js";

export const ARM_INDICATOR_MODEL_VERSION = "balance-v2";
export const ARM_INDICATOR_RECOVERY_TRIGGER_PCT = 8;

function rollingWindow(curve, daysBack, asOfDate) {
  if (!curve.length) return { returnPct: 0, actualDays: 0, coverage: 0, normalized30dPct: 0 };
  const endPoint = pointAtOrBefore(curve, asOfDate) ?? curve[curve.length - 1];
  const startPoint = pointAtOrBefore(curve, addDays(endPoint.date, -daysBack)) ?? curve[0];
  if (!endPoint || !startPoint || !Number.isFinite(startPoint.indexValue) || startPoint.indexValue <= 0) {
    return { returnPct: 0, actualDays: 0, coverage: 0, normalized30dPct: 0 };
  }
  const actualDays = Math.max(0, diffCalendarDays(startPoint.date, endPoint.date));
  const returnPct = roundTo(((endPoint.indexValue / startPoint.indexValue) - 1) * 100, 1);
  const coverage = clamp(actualDays / daysBack, 0, 1);
  const normalized30dPct = actualDays > 0 ? normalizeReturnTo30Days(returnPct, actualDays) : 0;
  return { returnPct, actualDays, coverage, normalized30dPct };
}

export function normalizeReturnTo30Days(returnPct, actualDays) {
  const days = Number(actualDays);
  const value = Number(returnPct);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(value)) return 0;
  const growth = 1 + value / 100;
  if (growth <= 0) return -100;
  return roundTo((growth ** (30 / days) - 1) * 100, 2);
}

function coveredWeightedAverage(items, fallback = 0) {
  const eligible = items.filter((item) => Number.isFinite(item.value) && item.coverage >= 0.5);
  if (!eligible.length) return roundTo(fallback, 2);
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return roundTo(fallback, 2);
  return roundTo(eligible.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight, 2);
}

export function calculateMetricsFromDailyGainV2(dailyPoints, { asOfDate } = {}) {
  const curve = buildGrowthCurve(dailyPoints);
  if (!curve.length) throw new Error("Daily gain series is empty");
  const latestPoint = pointAtOrBefore(curve, asOfDate) ?? curve[curve.length - 1];
  if (!latestPoint) throw new Error("Unable to resolve the latest completed point");

  const w30 = rollingWindow(curve, 30, latestPoint.date);
  const w60 = rollingWindow(curve, 60, latestPoint.date);
  const w90 = rollingWindow(curve, 90, latestPoint.date);
  const w180 = rollingWindow(curve, 180, latestPoint.date);
  const w365 = rollingWindow(curve, 365, latestPoint.date);

  const shortMomentumPct = coveredWeightedAverage([
    { value: w30.normalized30dPct, coverage: w30.coverage, weight: 0.5 },
    { value: w60.normalized30dPct, coverage: w60.coverage, weight: 0.3 },
    { value: w90.normalized30dPct, coverage: w90.coverage, weight: 0.2 },
  ], w90.normalized30dPct);

  const longMomentumPct = coveredWeightedAverage([
    { value: w180.normalized30dPct, coverage: w180.coverage, weight: 0.4 },
    { value: w365.normalized30dPct, coverage: w365.coverage, weight: 0.6 },
  ], w180.coverage > 0 ? w180.normalized30dPct : shortMomentumPct);

  const momentumPct = roundTo(shortMomentumPct * 0.35 + longMomentumPct * 0.65, 2);
  const daysSinceHigh = Math.max(0, diffCalendarDays(latestPoint.peakDate, latestPoint.date));
  const currentDrawdownPct = roundTo(latestPoint.drawdownPct, 1);
  const cycle = curve.filter((point) => point.date >= latestPoint.peakDate && point.date <= latestPoint.date);
  const cycleMaxDrawdownPct = roundTo(Math.abs(Math.min(0, ...cycle.map((point) => Number(point.drawdownPct) || 0))), 1);
  const recoveryActive = cycleMaxDrawdownPct >= ARM_INDICATOR_RECOVERY_TRIGGER_PCT && Math.abs(currentDrawdownPct) > 0;
  const historyDays = Math.max(0, diffCalendarDays(curve[0].date, latestPoint.date));

  return {
    dataAsOf: latestPoint.date,
    metrics: {
      modelVersion: ARM_INDICATOR_MODEL_VERSION,
      currentDrawdownPct,
      return30dPct: w30.returnPct,
      return60dPct: w60.returnPct,
      return90dPct: w90.returnPct,
      return180dPct: w180.returnPct,
      return365dPct: w365.returnPct,
      normalized30dPct: w30.normalized30dPct,
      normalized60dPct: w60.normalized30dPct,
      normalized90dPct: w90.normalized30dPct,
      normalized180dPct: w180.normalized30dPct,
      normalized365dPct: w365.normalized30dPct,
      shortMomentumPct,
      longMomentumPct,
      momentumPct,
      daysSinceHigh,
      cycleMaxDrawdownPct,
      recoveryActive,
      historyDays,
      coverage180d: roundTo(w180.coverage, 2),
      coverage365d: roundTo(w365.coverage, 2),
    },
    curve,
  };
}

export function calculateIndicatorScoreV2(metrics) {
  const drawdown = Math.abs(Number(metrics.currentDrawdownPct) || 0);
  const shortMomentumPct = Number(metrics.shortMomentumPct) || 0;
  const longMomentumPct = Number(metrics.longMomentumPct) || 0;
  const momentumPct = Number.isFinite(Number(metrics.momentumPct)) ? Number(metrics.momentumPct) : shortMomentumPct * 0.35 + longMomentumPct * 0.65;
  const daysSinceHigh = Math.max(0, Math.round(Number(metrics.daysSinceHigh) || 0));
  const recoveryActive = Boolean(metrics.recoveryActive);

  const ddNormalized = clamp((drawdown - 5) / 25, 0, 1);
  const negativeShortNormalized = clamp(-shortMomentumPct / 4, 0, 1);
  const negativeLongNormalized = clamp(-longMomentumPct / 3, 0, 1);
  const stagnationNormalized = clamp((daysSinceHigh - 30) / 335, 0, 1);
  const buyIntensity = ddNormalized * 0.45 + negativeShortNormalized * 0.20 + negativeLongNormalized * 0.20 + stagnationNormalized * 0.15;

  let score;
  if (recoveryActive || drawdown >= ARM_INDICATOR_RECOVERY_TRIGGER_PCT || momentumPct <= -1) {
    score = -Math.round(buyIntensity * 100);
    if (recoveryActive) score = Math.min(score, -21);
  } else if (drawdown < 3 && shortMomentumPct > 0 && longMomentumPct > 0) {
    const positiveShortNormalized = clamp(shortMomentumPct / 4, 0, 1);
    const positiveLongNormalized = clamp(longMomentumPct / 3, 0, 1);
    const trendIntensity = positiveShortNormalized * 0.35 + positiveLongNormalized * 0.65;
    const nearHighNormalized = clamp(1 - drawdown / 3, 0, 1);
    const recentHighNormalized = clamp((60 - daysSinceHigh) / 60, 0, 1);
    const profitIntensity = trendIntensity * (0.75 + nearHighNormalized * 0.15 + recentHighNormalized * 0.10);
    score = Math.round(profitIntensity * 100);
  } else {
    score = Math.round(clamp((momentumPct / 1.5) * 20, -20, 20));
  }

  score = clamp(score, -100, 100);
  const zone = getZoneForScore(score);
  const zoneMeta = ARM_INDICATOR_ZONE_META[zone];
  return { score, zone, zoneLabel: zoneMeta.label, recommendation: zoneMeta.recommendation, momentumPct: roundTo(momentumPct, 1) };
}

export function buildIndicatorSnapshotV2({ metrics, dataAsOf, updatedAt = new Date().toISOString(), source = "fixture", stale = false }) {
  const scoreResult = calculateIndicatorScoreV2(metrics);
  const numericKeys = [
    "currentDrawdownPct", "return30dPct", "return60dPct", "return90dPct", "return180dPct", "return365dPct",
    "normalized30dPct", "normalized60dPct", "normalized90dPct", "normalized180dPct", "normalized365dPct",
    "shortMomentumPct", "longMomentumPct", "momentumPct", "cycleMaxDrawdownPct", "coverage180d", "coverage365d",
  ];
  const normalizedMetrics = { ...metrics };
  for (const key of numericKeys) {
    if (Number.isFinite(Number(normalizedMetrics[key]))) normalizedMetrics[key] = roundTo(normalizedMetrics[key], key.startsWith("coverage") ? 2 : 1);
  }
  normalizedMetrics.daysSinceHigh = Math.max(0, Math.round(Number(metrics.daysSinceHigh) || 0));
  normalizedMetrics.historyDays = Math.max(0, Math.round(Number(metrics.historyDays) || 0));
  normalizedMetrics.recoveryActive = Boolean(metrics.recoveryActive);
  normalizedMetrics.modelVersion = ARM_INDICATOR_MODEL_VERSION;

  return {
    date: dataAsOf,
    dataAsOf,
    updatedAt,
    score: scoreResult.score,
    zone: scoreResult.zone,
    zoneLabel: scoreResult.zoneLabel,
    recommendation: scoreResult.recommendation,
    metrics: normalizedMetrics,
    source,
    stale,
  };
}
