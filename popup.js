/*
  EventSnap Popup Script
  - Handles OpenAI and Supabase config storage
  - Supports local dashboard sync for local development
  - Authenticates with Supabase (Google OAuth via background)
  - Triggers screenshot capture via background service worker
  - Saves events locally and auto-syncs to Supabase
  - Exports ICS files client-side
*/

const DEFAULT_TIMEZONE = "America/Los_Angeles";

const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const keyStatus = document.getElementById("keyStatus");

const supabaseUrlInput = document.getElementById("supabaseUrlInput");
const supabaseAnonKeyInput = document.getElementById("supabaseAnonKeyInput");
const saveSupabaseBtn = document.getElementById("saveSupabaseBtn");
const supabaseConfigStatus = document.getElementById("supabaseConfigStatus");

const localDashboardUrlInput = document.getElementById("localDashboardUrlInput");
const saveLocalDashboardBtn = document.getElementById("saveLocalDashboardBtn");
const localDashboardStatus = document.getElementById("localDashboardStatus");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");

const captureBtn = document.getElementById("captureBtn");
const saveEventBtn = document.getElementById("saveEventBtn");
const exportIcsBtn = document.getElementById("exportIcsBtn");
const eventsList = document.getElementById("eventsList");
const toastEl = document.getElementById("toast");

const themeToggleBtn = document.getElementById("theme-toggle");
const savedEventsBtn = document.getElementById("saved-events-btn");
const backBtn = document.getElementById("back-btn");
const loginBtn = document.getElementById("simulate-login-btn");

const formFields = [
  "title",
  "start_datetime",
  "end_datetime",
  "timezone",
  "location",
  "host",
  "registration_link",
  "cost",
  "source_url"
];

let currentEvent = null;
let authState = {
  authenticated: false,
  user: null
};

init();

async function init() {
  const { openai_api_key, supabase_url, supabase_anon_key, local_dashboard_url, events } = await chrome.storage.local.get([
    "openai_api_key",
    "supabase_url",
    "supabase_anon_key",
    "local_dashboard_url",
    "events"
  ]);

  updateKeyStatus(!!openai_api_key);

  if (supabase_url) supabaseUrlInput.value = supabase_url;
  if (supabase_anon_key) supabaseAnonKeyInput.value = supabase_anon_key;
  updateSupabaseConfigStatus(Boolean(supabase_url && supabase_anon_key));

  if (local_dashboard_url) localDashboardUrlInput.value = local_dashboard_url;
  updateLocalDashboardStatus(Boolean(local_dashboard_url));

  renderEventsList(events || []);
  await refreshAuthStatus();
}

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    updateStatus("Please enter an OpenAI key.");
    return;
  }

  await chrome.storage.local.set({ openai_api_key: key });
  apiKeyInput.value = "";
  updateKeyStatus(true);
  updateStatus("OpenAI key saved.");
});

saveSupabaseBtn.addEventListener("click", async () => {
  const url = supabaseUrlInput.value.trim().replace(/\/+$/, "");
  const anonKey = supabaseAnonKeyInput.value.trim();

  if (!url || !anonKey) {
    updateStatus("Enter Supabase URL and anon key.");
    return;
  }

  await chrome.storage.local.set({
    supabase_url: url,
    supabase_anon_key: anonKey
  });

  updateSupabaseConfigStatus(true);
  updateStatus("Supabase config saved.");
});

saveLocalDashboardBtn.addEventListener("click", async () => {
  const url = localDashboardUrlInput.value.trim().replace(/\/+$/, "");
  if (!url) {
    await chrome.storage.local.remove("local_dashboard_url");
    updateLocalDashboardStatus(false);
    updateStatus("Local dashboard URL cleared.");
    await refreshAuthStatus();
    return;
  }

  await chrome.storage.local.set({ local_dashboard_url: url });
  updateLocalDashboardStatus(true);
  updateStatus(
    "Local dashboard URL saved. Extension uses this bridge only when Supabase config is missing and will auto-recover if the port changes."
  );
  await refreshAuthStatus();
});

loginBtn.addEventListener("click", async () => {
  try {
    loginBtn.disabled = true;
    updateStatus("Opening Google sign-in...");

    const response = await sendMessage({ type: "AUTH_LOGIN" });
    if (!response?.ok) {
      throw new Error(response?.error || "Sign-in failed.");
    }

    await refreshAuthStatus();
    updateStatus("Signed in. New events will auto-sync.");
  } catch (err) {
    updateStatus(`Sign-in error: ${err.message || err}`);
  } finally {
    if (!authState.authenticated) {
      loginBtn.disabled = false;
    }
  }
});

logoutBtn.addEventListener("click", async () => {
  const response = await sendMessage({ type: "AUTH_LOGOUT" });
  if (!response?.ok) {
    updateStatus(`Sign-out error: ${response?.error || "Unknown error"}`);
    return;
  }

  await refreshAuthStatus();
  updateStatus("Signed out. Events stay local until you sign in again.");
});


  try {
    const response = await sendMessage({ type: "CAPTURE_EVENT" });
    setCaptureEnabled(true);

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

    updateStatus("Done.");
    currentEvent = data.event || {};

    if (!currentEvent.timezone) {
      currentEvent.timezone = DEFAULT_TIMEZONE;
    }

    if (!currentEvent.source_url && response?.meta?.source_url) {
      currentEvent.source_url = response.meta.source_url;
    }

    fillForm(currentEvent);
    eventSection.classList.remove("hidden");
  } catch (err) {
    setCaptureEnabled(true);
    updateStatus(`Error: ${err.message || err}`);
    eventSection.classList.add("hidden");
  }
});

async function onSaveEvent() {
  const eventData = readForm();
  if (!eventData.timezone) eventData.timezone = DEFAULT_TIMEZONE;

  const localEvent = {
    id: String(Date.now()),
    created_at: new Date().toISOString(),
    cloud_synced_at: null,
    sync_error: null,
    ...eventData
  };

  const { events } = await chrome.storage.local.get("events");
  const nextEvents = Array.isArray(events) ? events : [];
  nextEvents.unshift(localEvent);
  await chrome.storage.local.set({ events: nextEvents });

  renderEventsList(nextEvents);
  updateStatus("Event saved locally. Syncing...");

  const syncResult = await sendMessage({ type: "SYNC_EVENT", event: localEvent });

  if (syncResult?.ok) {
    const updatedEvents = nextEvents.map((event) => {
      if (event.id !== localEvent.id) return event;
      return {
        ...event,
        cloud_event_id: syncResult.data?.id || null,
        cloud_synced_at: new Date().toISOString(),
        sync_error: null
      };
    });

    await chrome.storage.local.set({ events: updatedEvents });
    renderEventsList(updatedEvents);
    updateStatus("Event saved and synced to dashboard.");
    return;
  }

  const errorMessage = syncResult?.error || "Unknown sync error";
  const updatedEvents = nextEvents.map((event) => {
    if (event.id !== localEvent.id) return event;
    return {
      ...event,
      sync_error: errorMessage
    };
  });

  await chrome.storage.local.set({ events: updatedEvents });
  renderEventsList(updatedEvents);

  if (errorMessage.toLowerCase().includes("not signed in")) {
    updateStatus("Event saved locally. Sign in with Google to sync.");
  } else if (errorMessage.toLowerCase().includes("missing supabase config")) {
    updateStatus("Event saved locally. Save Supabase config to enable sync.");
  } else if (errorMessage.toLowerCase().includes("local dashboard")) {
    updateStatus("Event saved locally. Check local dashboard URL and make sure dashboard is running.");
  } else {
    updateStatus(`Event saved locally. Sync failed: ${errorMessage}`);
  }
});

exportIcsBtn.addEventListener("click", () => {
  const eventData = readForm();
  if (!eventData.timezone) eventData.timezone = DEFAULT_TIMEZONE;
  exportICS(eventData, eventData.title || "event");
});

async function refreshAuthStatus() {
  const response = await sendMessage({ type: "AUTH_STATUS" });

  if (response?.ok && response.authenticated) {
    authState = {
      authenticated: true,
      user: response.user || null
    };

    if (response.localMode) {
      if (response.localDashboardUrl) {
        localDashboardUrlInput.value = response.localDashboardUrl;
        updateLocalDashboardStatus(true);
      }

      authStatus.textContent = response.localDashboardUrl
        ? `Local dashboard mode enabled (${response.localDashboardUrl})`
        : "Local dashboard mode enabled";
      loginBtn.disabled = true;
      logoutBtn.disabled = true;
      return;
    }

    authStatus.textContent = `Signed in as ${response.user?.email || "user"}`;
    loginBtn.disabled = true;
    logoutBtn.disabled = false;
    return;
  }

  authState = { authenticated: false, user: null };
  authStatus.textContent = "Not signed in";
  loginBtn.disabled = false;
  logoutBtn.disabled = true;
}

function updateKeyStatus(saved) {
  keyStatus.textContent = saved ? "Key saved" : "Key not saved";
}

function updateSupabaseConfigStatus(saved) {
  supabaseConfigStatus.textContent = saved
    ? "Supabase config saved"
    : "Supabase config not saved";
}

function updateLocalDashboardStatus(saved) {
  localDashboardStatus.textContent = saved
    ? "Local dashboard URL saved"
    : "Local dashboard URL not saved";
}

function updateStatus(text) {
  statusEl.textContent = text;
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

    const meta = document.createElement("div");
    meta.className = "meta";

    const startLabel = ev.start_datetime || "No start time";
    const syncLabel = ev.cloud_synced_at
      ? "Synced"
      : ev.sync_error
        ? "Sync failed"
        : "Local only";

    meta.textContent = `${startLabel} • ${syncLabel}`;

    const actions = document.createElement("div");
    actions.className = "actions";
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
      const next = (events || []).filter((event) => event.id !== ev.id);
      await chrome.storage.local.set({ events: next });
      renderEventsList(next);
    });

    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);

    if (ev.sync_error) {
      const syncError = document.createElement("div");
      syncError.className = "status-muted";
      syncError.textContent = `Last sync error: ${ev.sync_error}`;
      item.appendChild(syncError);
    }

    item.appendChild(actions);
    info.appendChild(title);
    info.appendChild(date);
    item.appendChild(dot);
    item.appendChild(info);
    item.appendChild(exportBtn);
    item.appendChild(deleteBtn);
    eventsList.appendChild(item);
  }
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
  return (
    (name || "event")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "event"
  );
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
