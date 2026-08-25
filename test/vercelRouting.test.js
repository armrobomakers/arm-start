import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

function isArmStartHostRule(rule) {
  return rule?.has?.some(
    (condition) => condition.type === "host" && condition.value === "arm-start.vercel.app",
  );
}

test("arm-start host redirect excludes API routes", () => {
  const redirect = config.redirects.find((rule) => isArmStartHostRule(rule) && rule.source !== "/");

  assert.ok(redirect, "arm-start host redirect must exist");
  assert.match(redirect.source, /\(\?!api/, "redirect source must exclude /api routes");
  assert.equal(redirect.destination, "https://start.robomakers.org/:path*");
});

test("API routes retain noindex headers", () => {
  const apiHeaders = config.headers.find((rule) => rule.source === "/api/:path*");
  assert.ok(apiHeaders, "API header rule must exist");
  assert.ok(
    apiHeaders.headers.some(
      (header) => header.key === "X-Robots-Tag" && header.value.includes("noindex"),
    ),
  );
});
