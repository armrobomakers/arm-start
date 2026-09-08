export const GIVEAWAY_CONFIG = Object.freeze({
  targetCoupons: 100,
  timezone: "Asia/Yekaterinburg",
  timezoneLabel: "UTC+5",
  ctaPath: "/arm-subscription",
  eligiblePlans: ["VIP", "PREMIUM"],
  planPricesUsd: Object.freeze({ VIP: 500, PREMIUM: 2500 }),
  planCoupons: Object.freeze({ VIP: 1, PREMIUM: 5 }),
  event: Object.freeze({
    date: "2026-10-03",
    dateLabel: "3 октября 2026 года",
    city: "Красноярск",
    venue: "конференция",
    drawMethod: "лототрон",
  }),
  prizes: Object.freeze([
    Object.freeze({ quantity: 1, label: "MacBook Pro" }),
    Object.freeze({ quantity: 2, label: "iPhone 17 Pro Max" }),
    Object.freeze({ quantity: 3, label: "AirPods 3 Pro" }),
  ]),
});
