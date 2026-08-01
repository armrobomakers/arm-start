const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.ARM_VISUAL_FIXTURE_PORT || 4173);
const root = path.resolve(__dirname, "../dist");
const snapshot = {
  score: -82,
  zone: "strong_buy",
  zoneLabel: "СИЛЬНАЯ ЗОНА ПОПОЛНЕНИЯ",
  recommendation: "Хорошая точка для увеличения капитала",
  dataAsOf: "2026-07-31",
  updatedAt: "2026-08-01T09:14:24.281Z",
  stale: false,
};

const server = http.createServer((request, response) => {
  if (request.url === "/api/arm-indicator/current") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(snapshot));
    return;
  }

  const requestedPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.end(fs.readFileSync(filePath));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ARM visual fixture: http://127.0.0.1:${port}/`);
});
