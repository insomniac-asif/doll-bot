// Generic per-guild JSON store, namespaced by feature.
// Keeps volatile feature data (levels, economy, etc.) out of the main config.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

function featureDir(feature) {
  const dir = join(DATA_DIR, feature);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getStore(feature, guildId, fallback = {}) {
  const path = join(featureDir(feature), `${guildId}.json`);
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function saveStore(feature, guildId, data) {
  writeFileSync(join(featureDir(feature), `${guildId}.json`), JSON.stringify(data, null, 2));
}

// Global (non-guild) store for cross-guild data like reminders.
export function getGlobal(feature, fallback = {}) {
  const path = join(featureDir(feature), `_global.json`);
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function saveGlobal(feature, data) {
  writeFileSync(join(featureDir(feature), `_global.json`), JSON.stringify(data, null, 2));
}
