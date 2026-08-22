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

test("buildPublicRows gives equal coupon totals equal dense ranks", () => {
  const rows = buildPublicRows([
    { name: "Первый Иван (1000000001)", coupons: 22 },
    { name: "Второй Петр (1000000002)", coupons: 10 },
    { name: "Третий Алексей (1000000003)", coupons: 6 },
    { name: "Четвертый Сергей (1000000004)", coupons: 6 },
    { name: "Пятый Роман (1000000005)", coupons: 5 },
  ]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 3, 4]);
});

test("toPublicLeaderboard never exposes raw ids or patronymics", () => {
  const result = toPublicLeaderboard({
    updatedAt: "2026-08-22T03:00:35.737Z",
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
  assert.equal(result.targetCoupons, 600);
  assert.equal(result.targetTurnover, 300000);
});

test("private-backed lookup accepts an id but returns only safe fields", () => {
  const data = {
    rows: [
      { name: "Козлова Татьяна Геннадьевна (1937546046)", coupons: 2 },
      { name: "Васильченко Евгений (9997166787)", coupons: 22 },
    ],
  };
  assert.deepEqual(findPublicParticipants(data, "1937546046"), [
    { rank: 2, name: "Козлова Татьяна", coupons: 2 },
  ]);
  assert.deepEqual(findPublicParticipants(data, "Васильченко"), [
    { rank: 1, name: "Васильченко Евгений", coupons: 22 },
  ]);
});
