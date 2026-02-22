"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_VIEWS = ["month", "week", "day"];
const DISPLAY_MODES = [
  { value: "list", label: "List View" },
  { value: "calendar", label: "Calendar View" }
];

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function startOfMonth(value) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDayKey(value) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function formatDateTime(value) {
  const parsed = parseDate(value);
  if (!parsed) return "-";

  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function normalizeCalendarEvent(event) {
  const start = parseDate(event.start_datetime) || parseDate(event.created_at);
  if (!start) return null;

  const end = parseDate(event.end_datetime) || new Date(start.getTime() + 60 * 60 * 1000);

  return {
    ...event,
    _start: start,
    _end: end,
    _dayKey: toDayKey(start)
  };
}

function eventMatchesQuery(event, query) {
  const text = [
    event.title,
    event.location,
    event.host,
    event.source_url,
    event.registration_link,
    event.cost
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(query);
}

export default function DashboardEventsPage() {
  const { supabase, user, loading } = useSessionGuard();

  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [displayMode, setDisplayMode] = useState("list");
  const [calendarView, setCalendarView] = useState("month");
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()));
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || !user) return;

    async function loadEvents() {
      setBusy(true);
      setError("");

      const { data, error: listError } = await supabase
        .from("events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (listError) {
        setError(listError.message);
      } else {
        setEvents(data || []);
      }

      setBusy(false);
    }

    loadEvents();
  }, [loading, supabase, user]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => eventMatchesQuery(event, q));
  }, [events, query]);

  const calendarEvents = useMemo(
    () =>
      events
        .map((event) => normalizeCalendarEvent(event))
        .filter(Boolean)
        .sort((left, right) => left._start.getTime() - right._start.getTime()),
    [events]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();

    calendarEvents.forEach((event) => {
      if (!map.has(event._dayKey)) {
        map.set(event._dayKey, []);
      }
      map.get(event._dayKey).push(event);
    });

    return map;
  }, [calendarEvents]);

  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(focusDate);
    const gridStart = monthStart;
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [focusDate]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [focusDate]);

  const dayEvents = useMemo(() => {
    const dayKey = toDayKey(focusDate);
    return eventsByDay.get(dayKey) || [];
  }, [eventsByDay, focusDate]);

  const visibleRangeLabel = useMemo(() => {
    if (calendarView === "month") {
      return new Intl.DateTimeFormat([], { month: "long", year: "numeric" }).format(focusDate);
    }

    if (calendarView === "week") {
      const start = weekDays[0];
      const end = weekDays[6];
      const startLabel = new Intl.DateTimeFormat([], {
        month: "short",
        day: "numeric",
        year: start.getFullYear() === end.getFullYear() ? undefined : "numeric"
      }).format(start);
      const endLabel = new Intl.DateTimeFormat([], {
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(end);
      return `${startLabel} - ${endLabel}`;
    }

    return new Intl.DateTimeFormat([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(focusDate);
  }, [calendarView, focusDate, weekDays]);

  const calendarViewLabel = `${calendarView[0].toUpperCase()}${calendarView.slice(1)}`;

  function shiftRange(direction) {
    setFocusDate((prev) => {
      const next = new Date(prev);

      if (calendarView === "month") {
        next.setMonth(next.getMonth() + direction);
        return next;
      }

      if (calendarView === "week") {
        next.setDate(next.getDate() + direction * 7);
        return next;
      }

      next.setDate(next.getDate() + direction);
      return next;
    });
  }

  function renderMonthView() {
    return (
      <div className="calendar-scroll">
        <div className="calendar-grid-month">
          {WEEKDAY_LABELS.map((weekday) => (
            <div key={weekday} className="calendar-weekday">
              {weekday}
            </div>
          ))}

          {monthGridDays.map((day) => {
            const dayKey = toDayKey(day);
            const dayEvents = eventsByDay.get(dayKey) || [];
            const isOutsideMonth = day.getMonth() !== focusDate.getMonth();
            const isNextMonthStart = isOutsideMonth && day.getDate() === 1;
            const limited = dayEvents.slice(0, 3);

            return (
              <div
                key={dayKey}
                className={`calendar-day-cell${isOutsideMonth ? " calendar-day-cell-outside" : ""}`}
              >
                {isNextMonthStart ? (
                  <div className="calendar-month-transition">
                    {new Intl.DateTimeFormat([], {
                      month: "long",
                      day: "numeric",
                      year: day.getFullYear() === focusDate.getFullYear() ? undefined : "numeric"
                    }).format(day)}
                  </div>
                ) : null}

                <div className="calendar-day-head">
                  <span>{day.getDate()}</span>
                  {dayEvents.length ? <span className="muted">{dayEvents.length}</span> : null}
                </div>

                <div className="calendar-event-list">
                  {limited.map((event) => (
                    <Link key={event.id} href={`/dashboard/events/${event.id}`} className="calendar-event-pill">
                      <span className="calendar-event-time">{formatTime(event._start)}</span>
                      <span>{event.title || "(Untitled)"}</span>
                    </Link>
                  ))}

                  {dayEvents.length > limited.length ? (
                    <div className="calendar-more">+{dayEvents.length - limited.length} more</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeekView() {
    return (
      <div className="calendar-scroll">
        <div className="calendar-week-grid">
          {weekDays.map((day) => {
            const dayKey = toDayKey(day);
            const events = eventsByDay.get(dayKey) || [];

            return (
              <div key={dayKey} className="calendar-week-column">
                <div className="calendar-week-column-head">
                  <strong>{WEEKDAY_LABELS[day.getDay()]}</strong>
                  <span>{day.getDate()}</span>
                </div>

                <div className="calendar-event-list">
                  {events.length ? (
                    events.map((event) => (
                      <Link
                        key={event.id}
                        href={`/dashboard/events/${event.id}`}
                        className="calendar-event-pill"
                      >
                        <span className="calendar-event-time">{formatTime(event._start)}</span>
                        <span>{event.title || "(Untitled)"}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="muted">No events</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDayView() {
    return (
      <div className="calendar-day-list">
        {dayEvents.length ? (
          dayEvents.map((event) => (
            <div key={event.id} className="calendar-day-item">
              <div>
                <div className="calendar-day-item-title">{event.title || "(Untitled)"}</div>
                <div className="muted">
                  {formatTime(event._start)}
                  {event.location ? ` • ${event.location}` : ""}
                </div>
              </div>
              <Link href={`/dashboard/events/${event.id}`} className="button-secondary">
                Open
              </Link>
            </div>
          ))
        ) : (
          <div className="note">No events for this day.</div>
        )}
      </div>
    );
  }

  return (
    <div className="grid">
      <header className="page-head">
        <div>
          <h1>Events</h1>
          <p>View extension-captured events in list or calendar form.</p>
        </div>

        <div className="segment-toggle">
          {DISPLAY_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={displayMode === mode.value ? "segment-active" : ""}
              onClick={() => setDisplayMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {displayMode === "calendar" ? (
        <section className="card">
          <div className="calendar-toolbar">
            <div className="calendar-toolbar-main">
              <div className="calendar-range">{visibleRangeLabel}</div>
              <div className="actions calendar-nav-actions">
                <button type="button" className="button-secondary" onClick={() => shiftRange(-1)}>
                  Previous {calendarViewLabel}
                </button>
                <button type="button" className="button-secondary" onClick={() => shiftRange(1)}>
                  Next {calendarViewLabel}
                </button>
              </div>
            </div>

            <div className="segment-toggle">
              {CALENDAR_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  className={calendarView === view ? "segment-active" : ""}
                  onClick={() => setCalendarView(view)}
                >
                  {view[0].toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {busy ? (
            <div className="loading">Loading events...</div>
          ) : calendarView === "month" ? (
            renderMonthView()
          ) : calendarView === "week" ? (
            renderWeekView()
          ) : (
            renderDayView()
          )}
        </section>
      ) : (
        <section className="card">
          <div className="page-head">
            <div>
              <h3>
                Saved Events From{" "}
                <a
                  href="https://github.com/thetireddude/polyprompt-chrome-extension"
                  target="_blank"
                  rel="noreferrer"
                >
                  EventSnap
                </a>
              </h3>
              <p className="muted">{events.length} total</p>
            </div>

            <label>
              Search
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, host, or source URL"
              />
            </label>
          </div>

          {!busy && filteredEvents.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Start</th>
                    <th>Location</th>
                    <th>Source</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{event.title || "(Untitled)"}</td>
                      <td>{formatDateTime(event.start_datetime)}</td>
                      <td>{event.location || "-"}</td>
                      <td>{event.source_url || "-"}</td>
                      <td>
                        <Link href={`/dashboard/events/${event.id}`} className="button-secondary">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !busy ? (
            <div className="note">No events match your search.</div>
          ) : null}

          {busy ? <div className="loading">Loading events...</div> : null}
        </section>
      )}
    </div>
  );
}
