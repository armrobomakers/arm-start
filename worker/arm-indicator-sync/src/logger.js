import fs from "node:fs/promises";
import path from "node:path";

export async function createLogger(logDir) {
  await fs.mkdir(logDir, { recursive: true });
  const file = path.join(logDir, `worker-${new Date().toISOString().slice(0, 10)}.log`);
  return async (event, details = {}) => {
    const safe = { event, at: new Date().toISOString(), ...details };
    await fs.appendFile(file, `${JSON.stringify(safe)}\n`, "utf8");
  };
}
