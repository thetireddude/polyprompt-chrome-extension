import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const LOCAL_DEV_USER = {
  id: "local-dev-user",
  email: "local@eventsnap.dev"
};

const STORE_DIR = path.join(process.cwd(), ".eventsnap-local");
const STORE_FILE = path.join(STORE_DIR, "store.json");

const DEFAULT_STORE = {
  profiles: [],
  events: [],
  extension_tokens: []
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeStoreShape(store) {
  return {
    profiles: Array.isArray(store?.profiles) ? store.profiles : [],
    events: Array.isArray(store?.events) ? store.events : [],
    extension_tokens: Array.isArray(store?.extension_tokens) ? store.extension_tokens : []
  };
}

function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const left = new Date(a?.created_at || 0).getTime();
    const right = new Date(b?.created_at || 0).getTime();
    return right - left;
  });
}

export async function readStore() {
  await mkdir(STORE_DIR, { recursive: true });

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return normalizeStoreShape(JSON.parse(raw));
  } catch (_err) {
    return { ...DEFAULT_STORE };
  }
}

export async function writeStore(nextStore) {
  await mkdir(STORE_DIR, { recursive: true });
  const shaped = normalizeStoreShape(nextStore);
  await writeFile(STORE_FILE, `${JSON.stringify(shaped, null, 2)}\n`, "utf8");
  return shaped;
}

export async function listEvents() {
  const store = await readStore();
  return sortByCreatedAtDesc(store.events);
}

export async function upsertExtensionEvent(rawEvent) {
  const store = await readStore();
  const now = nowIso();

  const event = {
    client_event_id: cleanText(rawEvent?.id) || cleanText(rawEvent?.client_event_id) || randomUUID(),
    title: cleanText(rawEvent?.title),
    start_datetime: cleanText(rawEvent?.start_datetime),
    end_datetime: cleanText(rawEvent?.end_datetime),
    timezone: cleanText(rawEvent?.timezone) || "America/Los_Angeles",
    location: cleanText(rawEvent?.location),
    host: cleanText(rawEvent?.host),
    registration_link: cleanText(rawEvent?.registration_link),
    cost: cleanText(rawEvent?.cost),
    source_url: cleanText(rawEvent?.source_url)
  };

  const existingIndex = store.events.findIndex(
    (row) => row.user_id === LOCAL_DEV_USER.id && row.client_event_id === event.client_event_id
  );

  if (existingIndex >= 0) {
    const updated = {
      ...store.events[existingIndex],
      ...event,
      updated_at: now
    };
    store.events[existingIndex] = updated;
    await writeStore(store);
    return updated;
  }

  const inserted = {
    id: randomUUID(),
    user_id: LOCAL_DEV_USER.id,
    created_at: now,
    updated_at: now,
    ...event
  };

  store.events.unshift(inserted);
  await writeStore(store);
  return inserted;
}

export async function getEventById(id) {
  const store = await readStore();
  return store.events.find((row) => row.id === id) || null;
}

export async function updateEventById(id, payload) {
  const store = await readStore();
  const index = store.events.findIndex((row) => row.id === id);
  if (index === -1) return null;

  const prev = store.events[index];
  const next = {
    ...prev,
    title: cleanText(payload?.title),
    start_datetime: cleanText(payload?.start_datetime),
    end_datetime: cleanText(payload?.end_datetime),
    timezone: cleanText(payload?.timezone) || "America/Los_Angeles",
    location: cleanText(payload?.location),
    host: cleanText(payload?.host),
    registration_link: cleanText(payload?.registration_link),
    cost: cleanText(payload?.cost),
    source_url: cleanText(payload?.source_url),
    updated_at: nowIso()
  };

  store.events[index] = next;
  await writeStore(store);
  return next;
}

export async function deleteEventById(id) {
  const store = await readStore();
  const existing = store.events.find((row) => row.id === id) || null;
  if (!existing) return false;

  store.events = store.events.filter((row) => row.id !== id);
  await writeStore(store);
  return true;
}

export async function getProfile() {
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === LOCAL_DEV_USER.id);

  if (profile) return profile;

  const now = nowIso();
  const created = {
    id: LOCAL_DEV_USER.id,
    display_name: null,
    default_timezone: "America/Los_Angeles",
    created_at: now,
    updated_at: now
  };

  store.profiles.push(created);
  await writeStore(store);
  return created;
}

export async function upsertProfile(profile) {
  const store = await readStore();
  const now = nowIso();
  const payload = {
    id: LOCAL_DEV_USER.id,
    display_name: cleanText(profile?.display_name),
    default_timezone: cleanText(profile?.default_timezone) || "America/Los_Angeles",
    updated_at: now
  };

  const index = store.profiles.findIndex((item) => item.id === LOCAL_DEV_USER.id);
  if (index >= 0) {
    store.profiles[index] = { ...store.profiles[index], ...payload };
  } else {
    store.profiles.push({
      ...payload,
      created_at: now
    });
  }

  await writeStore(store);
  return store.profiles.find((item) => item.id === LOCAL_DEV_USER.id) || null;
}

export async function listTokens() {
  const store = await readStore();
  return sortByCreatedAtDesc(store.extension_tokens);
}

export async function createToken(payload) {
  const store = await readStore();
  const now = nowIso();

  const row = {
    id: randomUUID(),
    user_id: LOCAL_DEV_USER.id,
    name: cleanText(payload?.name) || "Extension Token",
    token_hash: cleanText(payload?.token_hash),
    token_prefix: cleanText(payload?.token_prefix),
    last_used_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now
  };

  store.extension_tokens.unshift(row);
  await writeStore(store);
  return row;
}

export async function revokeToken(tokenId, { requireNotRevoked } = { requireNotRevoked: false }) {
  const store = await readStore();
  const index = store.extension_tokens.findIndex((token) => token.id === tokenId);
  if (index === -1) return null;

  const existing = store.extension_tokens[index];
  if (requireNotRevoked && existing.revoked_at) {
    return null;
  }

  const next = {
    ...existing,
    revoked_at: nowIso(),
    updated_at: nowIso()
  };

  store.extension_tokens[index] = next;
  await writeStore(store);
  return next;
}
