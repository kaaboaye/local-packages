import { $ } from "bun";
import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { VersionState } from "./types";

const PROJECT_ROOT = import.meta.dir.replace("/src/lib", "");
const STATE_FILE = `${PROJECT_ROOT}/state/versions.json`;
const LOG_FILE = `${PROJECT_ROOT}/logs/update.log`;

export const log = async (msg: string) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true });
    await appendFile(LOG_FILE, line + "\n");
  } catch {
    // Ignore logging errors
  }
};

export const versionGt = (a: string, b: string): boolean => {
  const partsA = a.split(".").map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(".").map((p) => parseInt(p, 10) || 0);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return true;
    if (numA < numB) return false;
  }
  return false;
};

export const downloadFile = async (url: string, dest: string): Promise<void> => {
  await mkdir(dirname(dest), { recursive: true });
  await $`curl -fL -o ${dest} ${url}`;
};

export const sha256 = async (file: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher("sha256");
  const fileContent = Bun.file(file);
  hasher.update(await fileContent.arrayBuffer());
  return hasher.digest("hex");
};

export const loadState = async (): Promise<VersionState> => {
  try {
    const file = Bun.file(STATE_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Ignore errors, return empty state
  }
  return {};
};

export const saveState = async (state: VersionState): Promise<void> => {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
};

export const getProjectRoot = () => PROJECT_ROOT;
