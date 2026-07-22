import fs from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

const LOCAL_STORAGE_PATH = path.join(process.cwd(), ".local-data", "arm-indicator-state.json");
const BLOB_STORAGE_PATH = "arm-indicator/state.json";

function resolveStorageMode() {
  const mode = (process.env.ARM_INDICATOR_STORAGE || "local").toLowerCase();
  return ["blob", "none"].includes(mode) ? mode : "local";
}

async function readLocalState() {
  try {
    const raw = await fs.readFile(LOCAL_STORAGE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeLocalState(state) {
  await fs.mkdir(path.dirname(LOCAL_STORAGE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_STORAGE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

async function readBlobState() {
  const result = await get(BLOB_STORAGE_PATH, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function writeBlobState(state) {
  await put(BLOB_STORAGE_PATH, JSON.stringify(state, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });

  return state;
}

export async function readIndicatorState() {
  const mode = resolveStorageMode();

  if (mode === "none") {
    return null;
  }

  if (mode === "blob") {
    return readBlobState();
  }

  return readLocalState();
}

export async function writeIndicatorState(state) {
  const mode = resolveStorageMode();

  if (mode === "none") {
    return state;
  }

  if (mode === "blob") {
    return writeBlobState(state);
  }

  return writeLocalState(state);
}

export function getStorageMode() {
  return resolveStorageMode();
}

export function getStoragePathHint() {
  return resolveStorageMode() === "blob" ? BLOB_STORAGE_PATH : LOCAL_STORAGE_PATH;
}
