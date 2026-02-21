/*
  EventSnap Popup Script
  - Triggers capture via background service worker
  - Renders editable event form
  - Saves events to chrome.storage.local
  - Exports ICS files client-side
*/

const captureBtn = document.getElementById("captureBtn");
const statusEl = document.getElementById("status");

const eventSection = document.getElementById("eventSection");
const saveEventBtn = document.getElementById("saveEventBtn");
const exportIcsBtn = document.getElementById("exportIcsBtn");

const eventsList = document.getElementById("eventsList");

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

let currentEvent = null;

init();

async function init() {
  const { events } = await chrome.storage.local.get("events");
  renderEventsList(events || []);
}

captureBtn.addEventListener("click", async () => {
  updateStatus("Capturing...");
  setCaptureEnabled(false);

  chrome.runtime.sendMessage({ type: "CAPTURE_EVENT" }, async (response) => {
    setCaptureEnabled(true);

    if (!response) {
      updateStatus("No response from background.");
      return;
    }

    if (!response.ok) {
      updateStatus(`Error: ${response.error}`);
      if (response.details) {
        console.warn("OpenAI details:", response.details);
      }
      eventSection.classList.add("hidden");
      return;
    }

    const data = response.data;
    if (!data || data.is_event !== true) {
      updateStatus("No event detected.");
      eventSection.classList.add("hidden");
      currentEvent = null;
      return;
    }

    updateStatus("Done.");
    currentEvent = data.event || {};

    // Default timezone if missing per requirements.
    if (!currentEvent.timezone) {
      currentEvent.timezone = "America/Los_Angeles";
    }

    fillForm(currentEvent);
    eventSection.classList.remove("hidden");
  });
});

saveEventBtn.addEventListener("click", async () => {
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
  updateStatus("Event saved.");
});

exportIcsBtn.addEventListener("click", () => {
  const eventData = readForm();
  if (!eventData.timezone) eventData.timezone = "America/Los_Angeles";
  exportICS(eventData, "event");
});

function updateStatus(text) {
  statusEl.textContent = text;
}

function setCaptureEnabled(enabled) {
  captureBtn.disabled = !enabled;
  captureBtn.textContent = enabled ? "Capture Event" : "Working...";
}

function fillForm(eventData) {
  formFields.forEach((field) => {
    const el = document.getElementById(field);
    el.value = eventData[field] ?? "";
  });
}

function readForm() {
  const result = {};
  formFields.forEach((field) => {
    const el = document.getElementById(field);
    const value = el.value.trim();
    result[field] = value ? value : null;
  });
  return result;
}

function renderEventsList(events) {
  eventsList.innerHTML = "";

  if (!events.length) {
    eventsList.innerHTML = '<div class="status-muted">No saved events yet.</div>';
    return;
  }

  for (const ev of events) {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = ev.title || "(Untitled Event)";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = ev.start_datetime || "No start time";

    const actions = document.createElement("div");
    actions.className = "actions";

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export ICS";
    exportBtn.addEventListener("click", () => exportICS(ev, ev.title || "event"));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      const { events } = await chrome.storage.local.get("events");
      const next = (events || []).filter((e) => e.id !== ev.id);
      await chrome.storage.local.set({ events: next });
      renderEventsList(next);
    });

    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);
    eventsList.appendChild(item);
  }
}

// Generates and downloads an ICS file.
function exportICS(eventData, filenameBase) {
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
}

function buildICS(eventData) {
  const now = new Date();
  const dtstamp = formatICSDateTimeUTC(now);

  const start = parseISO(eventData.start_datetime);
  let end = parseISO(eventData.end_datetime);

  // If end is missing but start exists, default to +2 hours.
  // This is a documented MVP behavior per requirements.
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
    "PRODID:-//EventSnap//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@eventsnap`,
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
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
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
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeFilename(name) {
  return (name || "event")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "event";
}