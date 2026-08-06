import {
  addDays,
  buildIndicatorSnapshot,
  getDefaultUpdateTimeIso,
  previousBusinessDay,
} from "./armIndicatorCore.js";

const CURRENT_METRICS = {
  currentDrawdownPct: -33.9,
  return30dPct: -15.5,
  return60dPct: -16.7,
  return90dPct: -23.1,
  daysSinceHigh: 164,
};

const FIXTURE_ANCHORS = [
  {
    metrics: {
      currentDrawdownPct: -4.2,
      return30dPct: 14.6,
      return60dPct: 19.8,
      return90dPct: 24.5,
      daysSinceHigh: 9,
    },
  },
  {
    metrics: {
      currentDrawdownPct: -6.8,
      return30dPct: 9.5,
      return60dPct: 14.1,
      return90dPct: 18.2,
      daysSinceHigh: 15,
    },
  },
  {
    metrics: {
      currentDrawdownPct: -11.4,
      return30dPct: 4.3,
      return60dPct: 7.9,
      return90dPct: 10.8,
      daysSinceHigh: 28,
    },
  },
  {
    metrics: {
      currentDrawdownPct: -18.9,
      return30dPct: -3.6,
      return60dPct: -1.8,
      return90dPct: 2.4,
      daysSinceHigh: 54,
    },
  },
  {
    metrics: {
      currentDrawdownPct: -27.5,
      return30dPct: -11.2,
      return60dPct: -12.8,
      return90dPct: -16.4,
      daysSinceHigh: 103,
    },
  },
  {
    metrics: CURRENT_METRICS,
  },
];

function lerp(left, right, factor) {
  return left + (right - left) * factor;
}

function lerpMetrics(start, end, factor) {
  return {
    currentDrawdownPct: lerp(start.currentDrawdownPct, end.currentDrawdownPct, factor),
    return30dPct: lerp(start.return30dPct, end.return30dPct, factor),
    return60dPct: lerp(start.return60dPct, end.return60dPct, factor),
    return90dPct: lerp(start.return90dPct, end.return90dPct, factor),
    daysSinceHigh: lerp(start.daysSinceHigh, end.daysSinceHigh, factor),
  };
}

export function createFixtureSnapshot(referenceDate = new Date()) {
  const dataAsOf = previousBusinessDay(referenceDate);
  const updatedAt = getDefaultUpdateTimeIso(referenceDate);

  return buildIndicatorSnapshot({
    dataAsOf: dataAsOf ? dataAsOf.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    updatedAt,
    source: "fixture",
    stale: false,
    metrics: CURRENT_METRICS,
  });
}

export function createFixtureHistory(days = 90, referenceDate = new Date()) {
  const normalizedDays = Math.max(2, Math.min(365, Math.round(days) || 90));
  const endDate = previousBusinessDay(referenceDate) ?? referenceDate;
  const startDate = addDays(endDate, -(normalizedDays - 1)) ?? endDate;
  const history = [];

  for (let index = 0; index < normalizedDays; index += 1) {
    const progress = normalizedDays === 1 ? 1 : index / (normalizedDays - 1);
    const segmentPosition = progress * (FIXTURE_ANCHORS.length - 1);
    const segmentIndex = Math.min(FIXTURE_ANCHORS.length - 2, Math.floor(segmentPosition));
    const localFactor = segmentPosition - segmentIndex;
    const metrics = lerpMetrics(FIXTURE_ANCHORS[segmentIndex].metrics, FIXTURE_ANCHORS[segmentIndex + 1].metrics, localFactor);
    const day = addDays(startDate, index) ?? startDate;

    history.push(
      buildIndicatorSnapshot({
        dataAsOf: day.toISOString().slice(0, 10),
        updatedAt: getDefaultUpdateTimeIso(referenceDate),
        source: "fixture",
        stale: false,
        metrics,
      }),
    );
  }

  return history;
}

export const ARM_INDICATOR_FIXTURE_METRICS = CURRENT_METRICS;
