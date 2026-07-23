import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, 'data', 'db.json');

const defaultData = {
  users: [],
  publishers: [],
  campaigns: [],
  leads: [],
  placements: [],
  chatMessages: [],
  contentDrafts: [],
  teamMembers: []
};

export const db = await JSONFilePreset(dbFile, defaultData);

// Backfill any collections that didn't exist yet in an already-saved db.json
for (const key of Object.keys(defaultData)) {
  if (db.data[key] === undefined) db.data[key] = defaultData[key];
}

// Simple auto-increment id helper
export function nextId(collection) {
  const items = db.data[collection];
  if (!items.length) return 1;
  return Math.max(...items.map(i => i.id)) + 1;
}

export async function save() {
  await db.write();
}
