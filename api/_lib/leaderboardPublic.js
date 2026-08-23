import { GIVEAWAY_CONFIG } from "../../shared/giveawayConfig.js";

function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function sanitizeParticipantName(value) {
  const withoutId = String(value || "").replace(/\s*\(\d+\)\s*$/, "").trim();
  return withoutId.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

export function buildPublicRows(rows = []) {
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Number(b.row?.coupons || 0) - Number(a.row?.coupons || 0) || a.index - b.index);

  let rank = 0;
  let previousCoupons = null;
  return sorted.map(({ row }) => {
    const coupons = Number(row.coupons);
    if (coupons !== previousCoupons) {
      rank += 1;
      previousCoupons = coupons;
    }
    return {
      rank,
      name: sanitizeParticipantName(row.name),
      coupons,
    };
  });
}

export function toPublicLeaderboard(data) {
  const rows = buildPublicRows(data?.rows || []);
  const totalCoupons = rows.reduce((sum, row) => sum + row.coupons, 0);
  const targetCoupons = GIVEAWAY_CONFIG.targetCoupons;
  const remainingCoupons = Math.max(0, targetCoupons - totalCoupons);
  const progressPercent = targetCoupons > 0 ? Math.min(100, (totalCoupons / targetCoupons) * 100) : 0;
  const couponStepAmount = Number(data?.couponStepAmount || 0);

  return {
    version: 2,
    updatedAt: data.updatedAt,
    periodStart: data.periodStart,
    currency: data.currency,
    couponStepAmount,
    participants: rows.length,
    totalCoupons,
    targetCoupons,
    remainingCoupons,
    targetTurnover: targetCoupons * couponStepAmount,
    progressPercent: Number(progressPercent.toFixed(1)),
    timezone: GIVEAWAY_CONFIG.timezone,
    timezoneLabel: GIVEAWAY_CONFIG.timezoneLabel,
    ctaPath: GIVEAWAY_CONFIG.ctaPath,
    rules: {
      eligiblePlans: [...GIVEAWAY_CONFIG.eligiblePlans],
      planPricesUsd: { ...GIVEAWAY_CONFIG.planPricesUsd },
      planCoupons: { ...GIVEAWAY_CONFIG.planCoupons },
      rankRule: "equal_coupons_equal_rank",
    },
    prizes: {
      main: { ...GIVEAWAY_CONFIG.mainPrize },
      extra: GIVEAWAY_CONFIG.extraPrizes.map((item) => ({ ...item })),
    },
    rows,
  };
}

export function findPublicParticipants(data, query) {
  const rawRows = Array.isArray(data?.rows) ? data.rows : [];
  const publicRows = buildPublicRows(rawRows);
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];

  const digitQuery = /^\d{6,13}$/.test(normalizedQuery);
  const matches = [];

  rawRows.forEach((rawRow) => {
    const safeName = sanitizeParticipantName(rawRow.name);
    const rawName = String(rawRow.name || "");
    const byId = digitQuery && new RegExp(`\\(${normalizedQuery}\\)\\s*$`).test(rawName);
    const byName = !digitQuery && normalizeSearch(safeName).includes(normalizedQuery);
    if (!byId && !byName) return;

    const projected = publicRows.find(
      (row) => row.name === safeName && row.coupons === Number(rawRow.coupons),
    );
    if (projected) matches.push(projected);
  });

  return matches.slice(0, 10);
}
