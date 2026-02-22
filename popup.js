const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const keyStatus = document.getElementById("keyStatus");

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
  "cost"
];

const MOCK_USER = { name: "Alex", initials: "AJ" };
let isDark = true;
let cameraRevertTimer = null;

init();

async function init() {
  const { openai_api_key, events } = await chrome.storage.local.get(["openai_api_key", "events"]);
  updateKeyStatus(!!openai_api_key);
  renderEventsList(events || []);
  wireHandlers();
}

function wireHandlers() {
  saveKeyBtn.addEventListener("click", onSaveKey);
  captureBtn.addEventListener("click", onCapture);
  saveEventBtn.addEventListener("click", onSaveEvent);
  exportIcsBtn.addEventListener("click", () => exportICS(readForm(), readForm().title || "event"));
  themeToggleBtn.addEventListener("click", toggleTheme);
  savedEventsBtn.addEventListener("click", () => showScreen("idle"));
  backBtn.addEventListener("click", () => showScreen("idle"));
  loginBtn.addEventListener("click", simulateLogin);
}

async function onSaveKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast("Enter an API key first");
    return;
  }
  await chrome.storage.local.set({ openai_api_key: key });
  apiKeyInput.value = "";
  updateKeyStatus(true);
  showToast("✓ API key saved");
}

async function onCapture() {
  flashCamera();
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

  const newEvent = {
    id: String(Date.now()),
    created_at: new Date().toISOString(),
    ...eventData
  };

  const { events } = await chrome.storage.local.get("events");
  const next = Array.isArray(events) ? events : [];
  next.unshift(newEvent);
  await chrome.storage.local.set({ events: next });

  renderEventsList(next);
  showToast("✓ Event saved!");
  showScreen("idle");
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

function updateKeyStatus(saved) {
  keyStatus.textContent = saved ? "Key saved" : "Key not saved";
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function simulateLogin() {
  document.getElementById("signin-banner").classList.add("hidden");
  document.getElementById("greeting-name").textContent = MOCK_USER.name;
  document.getElementById("greeting").classList.add("visible");
  const avatar = document.getElementById("user-avatar");
  avatar.textContent = MOCK_USER.initials;
  avatar.classList.add("visible");
  showToast(`✓ Signed in as ${MOCK_USER.name}`);
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
  return parts.join("\\n");
}

function parseISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
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
