"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

const FIELD_NAMES = [
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

const EMPTY_INVITEE = { name: "", email: "" };

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    event?.host ? `Host: ${event.host}` : null,
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
  if (event?.timezone) {
    params.set("ctz", event.timezone);
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
  const [form, setForm] = useState({});
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

        const initialForm = {};
        FIELD_NAMES.forEach((field) => {
          initialForm[field] = data[field] || "";
        });

        if (!initialForm.timezone) initialForm.timezone = "America/Los_Angeles";
        setForm(initialForm);
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

    if (!payload.timezone) payload.timezone = "America/Los_Angeles";

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
      return;
    }

    setCalendarMessage("Google Calendar opened.");
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
    setCalendarMessage(
      `Opened Google Calendar with ${normalized.length} invitee${
        normalized.length === 1 ? "" : "s"
      }. Save there to send invitations.`
    );
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

  if (busy) {
    return <div className="loading">Loading event...</div>;
  }

  if (!event) {
    return (
      <div className="grid">
        <div className="error">{error || "Event not found."}</div>
        <Link href="/dashboard" className="button-secondary">
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="grid">
      <header className="page-head">
        <div>
          <h1>{event.title || "Untitled Event"}</h1>
          <p>Edit captured fields before sharing or exporting elsewhere.</p>
        </div>
        <Link href="/dashboard" className="button-secondary">
          Back
        </Link>
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
              Timezone
              <input
                value={form.timezone || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              />
            </label>

            <label>
              Start Date/Time (ISO)
              <input
                value={form.start_datetime || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, start_datetime: e.target.value }))}
              />
            </label>

            <label>
              End Date/Time (ISO)
              <input
                value={form.end_datetime || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, end_datetime: e.target.value }))}
              />
            </label>

            <label>
              Location
              <input
                value={form.location || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
              />
            </label>

            <label>
              Host
              <input
                value={form.host || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
              />
            </label>

            <label>
              Registration Link
              <input
                value={form.registration_link || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, registration_link: e.target.value }))}
              />
            </label>

            <label>
              Cost
              <input
                value={form.cost || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))}
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
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button className="button-secondary" type="button" onClick={() => openGoogleCalendar()}>
              Add to Google Calendar
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

            <div className="actions">
              <button className="button-secondary" type="button" onClick={addInvitee}>
                Add Friend
              </button>
              <button className="button" type="button" onClick={inviteFriends}>
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
