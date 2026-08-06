export function parseDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) match = [us[0], us[3], us[1], us[2]];
  }
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

export function normalizeDailyGain(payload) {
  const series = Array.isArray(payload?.dailyGain) ? payload.dailyGain.flat(2) : [];
  const points = new Map();
  for (const entry of series) {
    const date = parseDate(entry?.date ?? entry?.Date ?? entry?.day ?? entry?.time ?? entry?.timestamp);
    const value = Number(entry?.value ?? entry?.gain ?? entry?.dailyGain);
    if (!date || !Number.isFinite(value) || Math.abs(value) > 1000) continue;
    points.set(date, { date, value: Math.round(value * 10000) / 10000 });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
