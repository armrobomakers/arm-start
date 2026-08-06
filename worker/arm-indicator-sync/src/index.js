import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { fetchDailyGain } from "./myfxbook.js";
import { publishPayload } from "./publish.js";
import { createLogger } from "./logger.js";

const root = process.env.ARM_WORKER_ROOT || "C:\\ARM\\indicator-worker";
const paths = { config: path.join(root, "config", "worker.env"), state: path.join(root, "state"), outbox: path.join(root, "outbox"), logs: path.join(root, "logs"), lock: path.join(root, "state", "worker.lock") };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLock() {
  await fs.mkdir(paths.state, { recursive: true });
  try { const handle = await fs.open(paths.lock, "wx"); await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return handle; }
  catch { throw Object.assign(new Error("Another worker run is already active"), { exitCode: 50 }); }
}

async function main() {
  const lock = await acquireLock();
  const log = await createLogger(paths.logs);
  try {
    const config = await loadConfig(process.env.ARM_WORKER_ENV_PATH || paths.config);
    await log("started", { dryRun: process.argv.includes("--dry-run") });
    const pendingFiles = (await fs.readdir(paths.outbox).catch(() => []))
      .filter((file) => file.startsWith("pending-") && file.endsWith(".json"))
      .sort();
    if (pendingFiles.length && !process.argv.includes("--dry-run")) {
      const pendingPath = path.join(paths.outbox, pendingFiles[0]);
      const pendingPayload = JSON.parse(await fs.readFile(pendingPath, "utf8"));
      await publishPayload(pendingPayload, config, { sleep });
      await fs.rm(pendingPath, { force: true });
      await log("outbox_replayed", { points: pendingPayload.dailyGain?.length || 0 });
    }
    let result;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try { result = await fetchDailyGain(config); break; }
      catch (error) {
        await log("myfxbook_failed", { attempt, code: error.code || "unknown" });
        if (attempt === 2 || !["session", "api", "http"].includes(error.code)) throw error;
      }
    }
    const payload = { version: 1, systemId: String(config.systemId), accountName: config.accountName, fetchedAt: new Date().toISOString(), dailyGain: result.dailyGain };
    if (process.argv.includes("--dry-run")) { await log("dry_run_ok", { points: payload.dailyGain.length }); return; }
    try {
      await publishPayload(payload, config, { sleep });
    } catch (error) {
      await fs.mkdir(paths.outbox, { recursive: true });
      await fs.writeFile(path.join(paths.outbox, `pending-${new Date().toISOString().replaceAll(":", "-")}.json`), `${JSON.stringify(payload)}\n`);
      await log("publish_failed", { code: error.code || "publish_failed" });
      throw Object.assign(error, { exitCode: 30 });
    }
    await fs.writeFile(path.join(paths.state, "last-success.json"), `${JSON.stringify({ finishedAt: new Date().toISOString(), dataAsOf: result.dailyGain.at(-1).date, points: result.dailyGain.length, publishStatus: "ok" }, null, 2)}\n`);
    await log("success", { dataAsOf: result.dailyGain.at(-1).date, points: result.dailyGain.length });
  } catch (error) {
    throw Object.assign(error, { exitCode: error.exitCode || 30 });
  } finally {
    await lock.close();
    await fs.rm(paths.lock, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = error.exitCode || 1; });
