import fs from "node:fs/promises";

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export async function loadConfig(envPath, env = process.env) {
  const file = await fs.readFile(envPath, "utf8").catch(() => "");
  const values = { ...parseEnv(file), ...env };
  const config = {
    email: values.MYFXBOOK_EMAIL,
    password: values.MYFXBOOK_PASSWORD,
    systemId: values.MYFXBOOK_SYSTEM_ID || "11020435",
    accountName: values.MYFXBOOK_EXPECTED_ACCOUNT_NAME || "ARM TICKMILL VIP FUND",
    historyStart: values.MYFXBOOK_HISTORY_START || "2024-07-01",
    publishUrl: values.ARM_INDICATOR_PUBLISH_URL,
    publishSecret: values.ARM_INDICATOR_PUBLISH_SECRET,
    protectionBypass: values.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    requestTimeoutMs: Number(values.ARM_WORKER_REQUEST_TIMEOUT_MS || 20000),
  };
  for (const key of ["email", "password", "publishUrl", "publishSecret"]) if (!config[key]) throw new Error(`Missing worker config: ${key}`);
  if (config.publishSecret.length < 32) throw new Error("Publish secret must be at least 32 characters");
  return config;
}
