import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicRows,
  findPublicParticipants,
  sanitizeParticipantName,
  toPublicLeaderboard,
} from "../api/_lib/leaderboardPublic.js";

test("sanitizeParticipantName removes ids and patronymics", () => {
  assert.equal(sanitizeParticipantName("Козлова Татьяна Геннадьевна (1937546046)"), "Козлова Татьяна");
  assert.equal(sanitizeParticipantName("Borovik Denis Borisovich (4720838313)"), "Borovik Denis");
});

test("buildPublicRows keeps unique positions and preserves source order on equal coupons", () => {
  const rows = buildPublicRows([
    { name: "Первый Иван (1000000001)", coupons: 22 },
    { name: "Второй Петр (1000000002)", coupons: 10 },
    { name: "Третий Алексей (1000000003)", coupons: 6 },
    { name: "Четвертый Сергей (1000000004)", coupons: 6 },
    { name: "Пятый Роман (1000000005)", coupons: 5 },
  ]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 4, 5]);
  assert.equal(rows[2].name, "Третий Алексей");
  assert.equal(rows[3].name, "Четвертый Сергей");
});

test("toPublicLeaderboard uses the 100-coupon Apple giveaway and never exposes raw ids", () => {
  const result = toPublicLeaderboard({
    updatedAt: "2026-09-08T03:01:19.534Z",
    periodStart: "2026-02-04 00:00:00",
    currency: "USD",
    couponStepAmount: 500,
    rows: [
      { name: "Козлова Татьяна Геннадьевна (1937546046)", coupons: 2 },
      { name: "Васильченко Евгений (9997166787)", coupons: 22 },
    ],
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("1937546046"), false);
  assert.equal(serialized.includes("9997166787"), false);
  assert.equal(serialized.includes("Геннадьевна"), false);
  assert.equal(result.targetCoupons, 100);
  assert.equal(result.targetTurnover, 50000);
  assert.equal(result.totalCoupons, 24);
  assert.equal(result.remainingCoupons, 76);
  assert.equal(result.progressPercent, 24);
  assert.equal(result.rules.rankRule, "coupons_desc_source_order_tiebreak");
  assert.deepEqual(result.event, {
    date: "2026-10-03",
    dateLabel: "3 октября 2026 года",
    city: "Красноярск",
    venue: "конференция",
    drawMethod: "лототрон",
  });
  assert.deepEqual(result.prizes.items, [
    { quantity: 1, label: "MacBook Pro" },
    { quantity: 2, label: "iPhone 17 Pro Max" },
    { quantity: 3, label: "AirPods 3 Pro" },
  ]);
});

test("participant lookup searches only by safe first or last name", () => {
  const data = {
    rows: [
      { name: "Козлова Татьяна Геннадьевна (1937546046)", coupons: 2 },
      { name: "Васильченко Евгений (9997166787)", coupons: 22 },
    ],
  };
  assert.deepEqual(findPublicParticipants(data, "1937546046"), []);
  assert.deepEqual(findPublicParticipants(data, "Васильченко"), [
    { rank: 1, name: "Васильченко Евгений", coupons: 22 },
  ]);
  assert.deepEqual(findPublicParticipants(data, "Татьяна"), [
    { rank: 2, name: "Козлова Татьяна", coupons: 2 },
  ]);
});
