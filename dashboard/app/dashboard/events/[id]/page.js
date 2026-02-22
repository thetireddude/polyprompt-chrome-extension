"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

const FIELD_NAMES = [
  "title",
  "location",
  "host",
  "source_url"
];

const EMPTY_INVITEE = { name: "", email: "" };
const EMPTY_FORM = {
  title: "",
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  location: "",
  host: "",
  source_url: ""
};

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(2000, 0, 1, hour, minute));
  return { value, label };
});

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toTimeKey(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function roundToQuarterHour(date) {
  const rounded = new Date(date);
  const roundedMinutes = Math.round(rounded.getMinutes() / 15) * 15;

  rounded.setSeconds(0, 0);
  if (roundedMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0);
  } else {
    rounded.setMinutes(roundedMinutes);
  }

  return rounded;
}

function splitDateTime(value) {
  const parsed = parseDate(value);
  if (!parsed) return { date: "", time: "" };

  const rounded = roundToQuarterHour(parsed);
  return {
    date: toDateKey(rounded),
    time: toTimeKey(rounded)
  };
}

function mergeDateAndTime(dateKey, timeKey) {
  if (!dateKey || !timeKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const merged = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(merged.getTime()) ? null : merged.toISOString();
}

function buildForm(eventData) {
  const start = splitDateTime(eventData?.start_datetime);
  const end = splitDateTime(eventData?.end_datetime);

  return {
    ...EMPTY_FORM,
    title: eventData?.title || "",
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    location: eventData?.location || "",
    host: eventData?.host || "",
    source_url: eventData?.source_url || ""
  };
}

function toGoogleDateTime(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildGoogleCalendarUrl(event, attendees = []) {
  const start = parseDate(event?.start_datetime) || new Date();
  const end = parseDate(event?.end_datetime) || new Date(start.getTime() + 60 * 60 * 1000);

  const details = [
    event?.host ? `Event Organizer: ${event.host}` : null,
    event?.registration_link ? `Registration: ${event.registration_link}` : null,
    event?.cost ? `Cost: ${event.cost}` : null,
    event?.source_url ? `Source: ${event.source_url}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event?.title || "Event",
    dates: `${toGoogleDateTime(start)}/${toGoogleDateTime(end)}`
  });

  if (details) {
    params.set("details", details);
  }
  if (event?.location) {
    params.set("location", event.location);
  }

  const emails = attendees
    .map((entry) => (entry.email || "").trim())
    .filter(Boolean)
    .join(",");
  if (emails) {
    params.set("add", emails);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function EventDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { supabase, user, loading } = useSessionGuard();

  const [event, setEvent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [calendarMessage, setCalendarMessage] = useState("");
  const [invitees, setInvitees] = useState([{ ...EMPTY_INVITEE }]);

  const isOwner = useMemo(() => {
    if (!event || !user) return false;
    return !event.user_id || event.user_id === user.id;
  }, [event, user]);

  useEffect(() => {
    if (loading || !user || !id) return;

    async function loadEvent() {
      setBusy(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setEvent(data);
        setForm(buildForm(data));
      }

      setBusy(false);
    }

    loadEvent();
  }, [id, loading, supabase, user]);

  async function saveEvent(e) {
    e.preventDefault();
    if (!event) return;

    setSaving(true);
    setError("");
    setMessage("");

    const payload = {};
    FIELD_NAMES.forEach((field) => {
      const value = (form[field] || "").trim();
      payload[field] = value || null;
    });

    const hasPartialStart = (form.start_date && !form.start_time) || (!form.start_date && form.start_time);
    const hasPartialEnd = (form.end_date && !form.end_time) || (!form.end_date && form.end_time);

    if (hasPartialStart || hasPartialEnd) {
      setError("Choose both date and time for start and end.");
      setSaving(false);
      return;
    }

    payload.start_datetime = mergeDateAndTime(form.start_date, form.start_time);
    payload.end_datetime = mergeDateAndTime(form.end_date, form.end_time);

    if (payload.start_datetime && payload.end_datetime) {
      const start = new Date(payload.start_datetime);
      const end = new Date(payload.end_datetime);
      if (end.getTime() < start.getTime()) {
        setError("End date/time must be after start date/time.");
        setSaving(false);
        return;
      }
    }

    const { data, error: updateError } = await supabase
      .from("events")
      .update(payload)
      .eq("id", event.id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError) {
      setError(updateError.message);
    } else {
      setEvent(data);
      setForm(buildForm(data));
      setMessage("Event updated.");
    }

    setSaving(false);
  }

  function openGoogleCalendar(attendees = []) {
    if (!event) return;

    setCalendarError("");
    setCalendarMessage("");

    const url = buildGoogleCalendarUrl(event, attendees);
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      setCalendarError("Popup blocked. Allow popups for this site and try again.");
      return false;
    }

    setCalendarMessage("Google Calendar opened.");
    return true;
  }

  function updateInvitee(index, key, value) {
    setInvitees((prev) =>
      prev.map((invitee, inviteeIndex) =>
        inviteeIndex === index ? { ...invitee, [key]: value } : invitee
      )
    );
  }

  function addInvitee() {
    setInvitees((prev) => [...prev, { ...EMPTY_INVITEE }]);
  }

  function removeInvitee(index) {
    setInvitees((prev) => {
      const next = prev.filter((_, inviteeIndex) => inviteeIndex !== index);
      return next.length ? next : [{ ...EMPTY_INVITEE }];
    });
  }

  function inviteFriends() {
    if (!event) return;
    if (!isOwner) {
      setCalendarError("Only the event owner can invite friends.");
      return;
    }

    const normalized = invitees
      .map((invitee) => ({
        name: (invitee.name || "").trim(),
        email: (invitee.email || "").trim()
      }))
      .filter((invitee) => invitee.name || invitee.email);

    if (!normalized.length) {
      setCalendarError("Add at least one friend with name and email.");
      return;
    }

    const invalid = normalized.find((invitee) => !invitee.name || !isValidEmail(invitee.email));
    if (invalid) {
      setCalendarError("Every invitee must include a name and valid email.");
      return;
    }

    openGoogleCalendar(normalized);
  }

  async function deleteEvent() {
    if (!event) return;

    const confirmed = window.confirm("Delete this event permanently?");
    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.replace("/dashboard");
  }

  function goToDashboard() {
    router.push("/dashboard");
  }

  if (busy) {
    return <div className="loading">Loading event...</div>;
  }

  if (!event) {
    return (
      <div className="grid">
        <div className="error">{error || "Event not found."}</div>
        <button type="button" className="button-secondary" onClick={goToDashboard}>
          Back to events
        </button>
      </div>
    );
  }

  return (
    <div className="grid">
      <header className="page-head">
        <div>
          <h1>{event.title || "Untitled Event"}</h1>
          <p>Edit event information before sharing.</p>
        </div>
        <button type="button" className="button-secondary" onClick={goToDashboard}>
          Back
        </button>
      </header>

      <section className="card">
        <form className="grid" onSubmit={saveEvent}>
          <div className="grid two">
            <label>
              Title
              <input
                value={form.title || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>

            <label>
              Start Day
              <input
                type="date"
                className="day-input"
                value={form.start_date || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              />
            </label>

            <label>
              Start Time
              <select
                value={form.start_time || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
              >
                <option value="">Select time</option>
                {TIME_OPTIONS.map((option) => (
                  <option key={`start-time-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              End Day
              <input
                type="date"
                className="day-input"
                value={form.end_date || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </label>

            <label>
              End Time
              <select
                value={form.end_time || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
              >
                <option value="">Select time</option>
                {TIME_OPTIONS.map((option) => (
                  <option key={`end-time-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Location
              <input
                value={form.location || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
              />
            </label>

            <label>
              Event Organizer
              <input
                value={form.host || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
              />
            </label>

            <label>
              Source URL
              <input
                value={form.source_url || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, source_url: e.target.value }))}
              />
            </label>
          </div>

          <div className="actions">
            <button className="button-secondary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              className="button-secondary button-with-icon"
              type="button"
              onClick={() => openGoogleCalendar()}
            >
              <img src="/google-calendar-logo.svg" alt="" aria-hidden="true" className="button-icon" />
              <span>Add to Google Calendar</span>
            </button>
            <button className="button-danger" type="button" onClick={deleteEvent} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Event"}
            </button>
          </div>
        </form>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}
        {calendarError ? <div className="error">{calendarError}</div> : null}
        {calendarMessage ? <div className="success">{calendarMessage}</div> : null}
      </section>

      <section className="card">
        <h3>Invite Friends</h3>
        {isOwner ? (
          <>
            <p className="muted">
              Add names and emails, then open Google Calendar with attendees pre-filled for this event.
            </p>

            <div className="grid">
              {invitees.map((invitee, index) => (
                <div key={`invitee-${index}`} className="invite-row">
                  <input
                    value={invitee.name}
                    onChange={(e) => updateInvitee(index, "name", e.target.value)}
                    placeholder="Friend name"
                  />
                  <input
                    value={invitee.email}
                    onChange={(e) => updateInvitee(index, "email", e.target.value)}
                    placeholder="friend@example.com"
                    type="email"
                  />
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => removeInvitee(index)}
                    disabled={invitees.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="actions invite-actions">
              <button className="button-secondary" type="button" onClick={addInvitee}>
                Add Friend
              </button>
              <button className="button-secondary" type="button" onClick={inviteFriends}>
                Invite via Google Calendar
              </button>
            </div>
          </>
        ) : (
          <div className="note">Only the event owner can invite attendees.</div>
        )}
      </section>
    </div>
  );
}
