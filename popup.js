const RUNTIME_CONFIG = globalThis.EVENTSNAP_CONFIG || {};
const SUPABASE_URL = RUNTIME_CONFIG.supabaseUrl || "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = RUNTIME_CONFIG.supabaseAnonKey || "YOUR_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_SESSION_KEY = "eventsnap_supabase_session";
const SESSION_REFRESH_LEEWAY_SECONDS = 60;

const captureBtn = document.getElementById("captureBtn");
const saveEventBtn = document.getElementById("saveEventBtn");
const exportIcsBtn = document.getElementById("exportIcsBtn");
const eventsList = document.getElementById("eventsList");
const toastEl = document.getElementById("toast");

const themeToggleBtn = document.getElementById("theme-toggle");
const savedEventsBtn = document.getElementById("saved-events-btn");
const backBtn = document.getElementById("back-btn");
const loginBtn = document.getElementById("google-login-btn");
const authStatusEl = document.getElementById("auth-status");
const greetingEl = document.getElementById("greeting");
const greetingNameEl = document.getElementById("greeting-name");
const avatarEl = document.getElementById("user-avatar");

const formFields = [
  "title",
  "start_datetime",
  "end_datetime",
  "timezone",
  "location",
  "host",
  "registration_link",
  "cost"
];

let isDark = true;
let cameraRevertTimer = null;
let authSession = null;
let authBusy = false;
const FLASH_BEFORE_LOADING_MS = 650;

init();

async function init() {
  wireHandlers();
  await hydrateAuthSession();

  const { events } = await chrome.storage.local.get(["events"]);
  renderEventsList(events || []);
}

function wireHandlers() {
  captureBtn.addEventListener("click", onCapture);
  saveEventBtn.addEventListener("click", onSaveEvent);
  exportIcsBtn.addEventListener("click", () => exportICS(readForm(), readForm().title || "event"));
  themeToggleBtn.addEventListener("click", toggleTheme);
  savedEventsBtn.addEventListener("click", () => showScreen("idle"));
  backBtn.addEventListener("click", () => showScreen("idle"));
  loginBtn.addEventListener("click", onAuthButtonClick);
}

async function onAuthButtonClick() {
  if (authBusy) return;

  if (isSignedIn()) {
    await signOut();
    return;
  }

  await signInWithGoogle();
}

async function onCapture() {
  flashCamera();
  await delay(FLASH_BEFORE_LOADING_MS);
  showLoading();

  chrome.runtime.sendMessage({ type: "CAPTURE_EVENT" }, (response) => {
    if (!response) {
      showToast("No response from background");
      showScreen("noevt");
      revertCamera();
      return;
    }

    if (!response.ok) {
      showToast(response.error || "Capture failed");
      showScreen("noevt");
      revertCamera();
      return;
    }

    const data = response.data;
    if (!data || data.is_event !== true) {
      showScreen("noevt");
      revertCamera();
      return;
    }

    const event = data.event || {};
    if (!event.timezone) {
      event.timezone = "America/Los_Angeles";
    }
    fillForm(event);
    showScreen("result");
    revertCamera();
  });
}

async function onSaveEvent() {
  const eventData = readForm();
  if (!eventData.timezone) eventData.timezone = "America/Los_Angeles";

  const sourceUrl = await getActiveTabUrl();
  const newEvent = {
    id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()),
    created_at: new Date().toISOString(),
    source_url: sourceUrl,
    ...eventData
  };

  const { events } = await chrome.storage.local.get("events");
  const next = Array.isArray(events) ? events : [];
  next.unshift(newEvent);
  await chrome.storage.local.set({ events: next });

  renderEventsList(next);

  if (!isSignedIn()) {
    showToast("Saved locally. Log In With Google to sync.");
    showScreen("idle");
    return;
  }

  const syncResult = await syncEventToSupabase(newEvent);
  if (!syncResult.ok) {
    showToast(`Saved locally. Sync failed: ${syncResult.error}`);
    showScreen("idle");
    return;
  }

  showToast("✓ Event saved and synced.");
  showScreen("idle");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
}

function showLoading() {
  showScreen("loading");
  const pb = document.getElementById("pbar");
  pb.style.animation = "none";
  pb.offsetHeight;
  pb.style.animation = "";

  document.getElementById("step1").className = "step done";
  document.getElementById("step1").querySelector(".step-icon").textContent = "✓";
  document.getElementById("step2").className = "step active";
  document.getElementById("step2").querySelector(".step-icon").innerHTML = '<div class="spinner"></div>';
  document.getElementById("step3").className = "step";
  document.getElementById("step3").querySelector(".step-icon").textContent = "○";
}

function flashCamera() {
  const icon = document.getElementById("btn-camera");
  if (cameraRevertTimer) clearTimeout(cameraRevertTimer);
  icon.textContent = "📸";
  icon.classList.remove("flashing");
  void icon.offsetWidth;
  icon.classList.add("flashing");
}

function revertCamera() {
  const icon = document.getElementById("btn-camera");
  cameraRevertTimer = setTimeout(() => {
    icon.classList.remove("flashing");
    icon.textContent = "📷";
  }, 2500);
}

function fillForm(eventData) {
  formFields.forEach((field) => {
    document.getElementById(field).value = eventData[field] ?? "";
  });
}

function readForm() {
  const result = {};
  formFields.forEach((field) => {
    const value = document.getElementById(field).value.trim();
    result[field] = value || null;
  });
  return result;
}

function renderEventsList(events) {
  eventsList.innerHTML = "";

  if (!events.length) {
    eventsList.innerHTML = '<div class="empty-state">No saved events yet.</div>';
    return;
  }

  for (const ev of events) {
    const item = document.createElement("div");
    item.className = "saved-item";

    const dot = document.createElement("div");
    dot.className = "saved-dot";

    const info = document.createElement("div");
    info.className = "saved-info";

    const title = document.createElement("div");
    title.className = "saved-title";
    title.textContent = ev.title || "(Untitled Event)";

    const date = document.createElement("div");
    date.className = "saved-date";
    date.textContent = ev.start_datetime || "No start time";

    const exportBtn = document.createElement("button");
    exportBtn.className = "saved-export";
    exportBtn.textContent = "↓ ICS";
    exportBtn.addEventListener("click", () => exportICS(ev, ev.title || "event"));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "saved-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      const { events } = await chrome.storage.local.get("events");
      const next = (events || []).filter((eventItem) => eventItem.id !== ev.id);
      await chrome.storage.local.set({ events: next });
      renderEventsList(next);
    });

    info.appendChild(title);
    info.appendChild(date);
    item.appendChild(dot);
    item.appendChild(info);
    item.appendChild(exportBtn);
    item.appendChild(deleteBtn);
    eventsList.appendChild(item);
  }
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle("light", !isDark);
  themeToggleBtn.textContent = isDark ? "☀️" : "🌙";
}

function exportICS(eventData, filenameBase) {
  if (!eventData.timezone) eventData.timezone = "America/Los_Angeles";
  const ics = buildICS(eventData);
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(filenameBase)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  showToast(`↓ ${sanitizeFilename(filenameBase)}.ics downloaded`);
}

function buildICS(eventData) {
  const now = new Date();
  const dtstamp = formatICSDateTimeUTC(now);
  const start = parseISO(eventData.start_datetime);
  let end = parseISO(eventData.end_datetime);

  if (start && !end) {
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  }

  const dtstart = start ? formatICSDateTimeUTC(start) : "";
  const dtend = end ? formatICSDateTimeUTC(end) : "";
  const summary = escapeICS(eventData.title || "Event");
  const location = escapeICS(eventData.location || "");
  const description = escapeICS(buildDescription(eventData));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PolySync//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@polysync`,
    `DTSTAMP:${dtstamp}`
  ];

  if (dtstart) lines.push(`DTSTART:${dtstart}`);
  if (dtend) lines.push(`DTEND:${dtend}`);
  lines.push(`SUMMARY:${summary}`);
  if (location) lines.push(`LOCATION:${location}`);
  if (description) lines.push(`DESCRIPTION:${description}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

function buildDescription(eventData) {
  const parts = [];
  if (eventData.host) parts.push(`Host: ${eventData.host}`);
  if (eventData.registration_link) parts.push(`Registration: ${eventData.registration_link}`);
  if (eventData.cost) parts.push(`Cost: ${eventData.cost}`);
  if (eventData.source_url) parts.push(`Source: ${eventData.source_url}`);
  return parts.join("\\n");
}

function parseISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatICSDateTimeUTC(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeICS(text) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function sanitizeFilename(name) {
  return (name || "event").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "event";
}

function assertSupabaseConfig() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR_PROJECT_REF") ||
    SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  ) {
    throw new Error("Set supabaseUrl and supabaseAnonKey in popup.config.local.js before using Google login.");
  }
}

function isSignedIn() {
  return Boolean(authSession?.access_token && authSession?.user);
}

function setAuthBusy(nextBusy) {
  authBusy = nextBusy;
  updateAuthUI();
}

function setAuthSession(nextSession) {
  authSession = nextSession;
  updateAuthUI();
}

function updateAuthUI() {
  if (authBusy) {
    loginBtn.disabled = true;
    loginBtn.textContent = isSignedIn() ? "Working..." : "Connecting...";
  } else if (isSignedIn()) {
    loginBtn.disabled = false;
    loginBtn.textContent = "Log Out";
  } else {
    loginBtn.disabled = false;
    loginBtn.textContent = "Log In With Google";
  }

  if (isSignedIn()) {
    const user = authSession.user;
    const name = getDisplayName(user);
    const label = user.email ? `Signed in as ${user.email}` : "Signed in";
    authStatusEl.textContent = label;
    greetingNameEl.textContent = name;
    greetingEl.classList.add("visible");
    avatarEl.textContent = getInitials(name);
    avatarEl.classList.add("visible");
    return;
  }

  authStatusEl.textContent = "Not signed in. Log in to sync events to your dashboard.";
  greetingNameEl.textContent = "there";
  greetingEl.classList.remove("visible");
  avatarEl.classList.remove("visible");
  avatarEl.textContent = "";
}

function getDisplayName(user) {
  if (!user) return "there";
  const metadata = user.user_metadata || {};
  const fallback =
    metadata.display_name || metadata.full_name || metadata.name || metadata.user_name || user.email || "there";
  const firstWord = String(fallback).trim().split(/\s+/)[0];
  return firstWord || "there";
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "?";
  return parts.map((part) => part[0].toUpperCase()).join("");
}

async function hydrateAuthSession() {
  setAuthBusy(true);

  try {
    const stored = await readStoredSession();
    if (!stored) {
      setAuthSession(null);
      return;
    }

    const refreshed = await ensureFreshSession(stored, { persist: true });
    if (!refreshed) {
      await clearStoredSession();
      setAuthSession(null);
      return;
    }

    setAuthSession(refreshed);
  } catch (err) {
    console.warn("Failed to hydrate auth session:", err);
    await clearStoredSession();
    setAuthSession(null);
  } finally {
    setAuthBusy(false);
  }
}

async function signInWithGoogle() {
  setAuthBusy(true);

  try {
    assertSupabaseConfig();

    const redirectTo = chrome.identity.getRedirectURL("supabase-auth");
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set("provider", "google");
    authUrl.searchParams.set("redirect_to", redirectTo);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("access_type", "offline");

    const callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    if (!callbackUrl) {
      throw new Error("Google sign-in was cancelled.");
    }

    const session = await buildSessionFromCallback(callbackUrl);
    if (!session) {
      throw new Error("Could not create an authenticated session.");
    }

    await writeStoredSession(session);
    setAuthSession(session);
    showToast(`✓ Signed in as ${session.user.email || getDisplayName(session.user)}`);
  } catch (err) {
    showToast(`Sign-in failed: ${extractErrorMessage(err, "Could not sign in with Google.")}`);
  } finally {
    setAuthBusy(false);
  }
}

async function signOut() {
  setAuthBusy(true);

  try {
    const session = authSession;
    if (session?.access_token) {
      await fetchSupabase("/auth/v1/logout", {
        method: "POST",
        accessToken: session.access_token
      });
    }
  } catch (_err) {
    // We still clear local state even if server logout fails.
  } finally {
    await clearStoredSession();
    setAuthSession(null);
    setAuthBusy(false);
    showToast("Signed out.");
  }
}

async function buildSessionFromCallback(callbackUrl) {
  const parsed = parseAuthCallback(callbackUrl);
  if (!parsed.access_token) {
    throw new Error("No access token returned from Supabase.");
  }

  const user = await fetchSupabaseUser(parsed.access_token);
  const session = normalizeSession({
    ...parsed,
    user
  });

  return session;
}

function parseAuthCallback(callbackUrl) {
  const parsed = new URL(callbackUrl);
  const queryParams = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const params = mergeSearchParams(queryParams, hashParams);

  const error = params.get("error") || params.get("error_code");
  const errorDescription = params.get("error_description");
  if (error || errorDescription) {
    throw new Error(errorDescription || error || "Google authentication failed.");
  }

  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type") || "bearer",
    expires_in: Number(params.get("expires_in") || 3600),
    expires_at: Number(params.get("expires_at") || 0)
  };
}

function mergeSearchParams(searchParams, hashParams) {
  const merged = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    merged.set(key, value);
  }
  for (const [key, value] of hashParams.entries()) {
    merged.set(key, value);
  }
  return merged;
}

function normalizeSession(raw) {
  if (!raw || !raw.access_token) return null;

  const expiresIn = Number(raw.expires_in || 0);
  const explicitExpiresAt = Number(raw.expires_at || 0);
  const fallbackExpiresAt = Math.floor(Date.now() / 1000) + (expiresIn > 0 ? expiresIn : 3600);

  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token || null,
    token_type: raw.token_type || "bearer",
    expires_in: expiresIn > 0 ? expiresIn : 3600,
    expires_at: explicitExpiresAt > 0 ? explicitExpiresAt : fallbackExpiresAt,
    user: raw.user || null
  };
}

function isSessionExpired(session) {
  if (!session || !session.expires_at) return true;
  const now = Math.floor(Date.now() / 1000);
  return now + SESSION_REFRESH_LEEWAY_SECONDS >= Number(session.expires_at);
}

async function ensureFreshSession(candidate, { persist = false } = {}) {
  let session = normalizeSession(candidate);
  if (!session) return null;

  if (isSessionExpired(session)) {
    session = await refreshSession(session);
    if (!session) return null;
  }

  if (!session.user) {
    session.user = await fetchSupabaseUser(session.access_token);
  }

  if (persist) {
    await writeStoredSession(session);
  }

  return session;
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;

  const { response, payload } = await fetchSupabase("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token }
  });

  if (!response.ok) return null;

  const refreshed = normalizeSession(payload);
  if (!refreshed) return null;

  if (!refreshed.user) {
    refreshed.user = await fetchSupabaseUser(refreshed.access_token);
  }

  return refreshed;
}

async function fetchSupabaseUser(accessToken) {
  const { response, payload } = await fetchSupabase("/auth/v1/user", {
    method: "GET",
    accessToken
  });

  if (!response.ok) {
    throw new Error(extractApiMessage(payload, "Could not load account profile."));
  }

  return payload;
}

async function syncEventToSupabase(localEvent) {
  const session = await getSyncSession();
  if (!session || !session.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const payload = {
    user_id: session.user.id,
    title: cleanNullable(localEvent.title),
    start_datetime: cleanNullable(localEvent.start_datetime),
    end_datetime: cleanNullable(localEvent.end_datetime),
    timezone: cleanNullable(localEvent.timezone) || "America/Los_Angeles",
    location: cleanNullable(localEvent.location),
    host: cleanNullable(localEvent.host),
    registration_link: cleanNullable(localEvent.registration_link),
    cost: cleanNullable(localEvent.cost),
    source_url: cleanNullable(localEvent.source_url)
  };

  return insertEvent(payload, session, true);
}

async function insertEvent(payload, session, allowRefreshRetry) {
  const { response, payload: responsePayload } = await fetchSupabase("/rest/v1/events?select=id", {
    method: "POST",
    accessToken: session.access_token,
    body: [payload],
    headers: {
      Prefer: "return=representation"
    }
  });

  if (response.status === 401 && allowRefreshRetry) {
    const refreshed = await refreshSession(session);
    if (!refreshed) {
      await clearStoredSession();
      setAuthSession(null);
      return { ok: false, error: "Session expired. Please log in again." };
    }

    await writeStoredSession(refreshed);
    setAuthSession(refreshed);
    return insertEvent(payload, refreshed, false);
  }

  if (!response.ok) {
    return { ok: false, error: extractApiMessage(responsePayload, `Sync failed (${response.status}).`) };
  }

  return { ok: true, data: Array.isArray(responsePayload) ? responsePayload[0] : responsePayload };
}

async function getSyncSession() {
  if (!authSession) return null;

  try {
    const refreshed = await ensureFreshSession(authSession, { persist: true });
    if (!refreshed) {
      await clearStoredSession();
      setAuthSession(null);
      return null;
    }

    if (refreshed.access_token !== authSession.access_token || refreshed.expires_at !== authSession.expires_at) {
      setAuthSession(refreshed);
    }

    return refreshed;
  } catch (_err) {
    await clearStoredSession();
    setAuthSession(null);
    return null;
  }
}

async function fetchSupabase(path, { method = "GET", body, accessToken, headers = {} } = {}) {
  assertSupabaseConfig();

  const requestHeaders = {
    apikey: SUPABASE_ANON_KEY,
    ...headers
  };

  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await readJsonSafe(response);
  return { response, payload };
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_err) {
    return { message: text };
  }
}

function extractApiMessage(payload, fallback) {
  if (!payload) return fallback;
  return payload.message || payload.msg || payload.error_description || payload.error || fallback;
}

function extractErrorMessage(err, fallback) {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  return err.message || fallback;
}

function cleanNullable(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Array.isArray(tabs) || !tabs.length) return null;

  const tabUrl = tabs[0]?.url;
  if (!tabUrl || !/^https?:/i.test(tabUrl)) return null;
  return tabUrl;
}

async function readStoredSession() {
  const result = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
  return result[SUPABASE_SESSION_KEY] || null;
}

async function writeStoredSession(session) {
  await chrome.storage.local.set({ [SUPABASE_SESSION_KEY]: session });
}

async function clearStoredSession() {
  await chrome.storage.local.remove(SUPABASE_SESSION_KEY);
}
