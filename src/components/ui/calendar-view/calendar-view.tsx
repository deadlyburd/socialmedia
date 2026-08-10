/**
 * Calendar view component — displays scheduled content in a calendar layout.
 * Shows which days have content scheduled and allows date selection.
 */

"use client";

import { useCallback, useMemo, useState } from "react";

export interface CalendarEvent {
  id: string;
  date: string; // ISO date string
  title: string;
  platform: string;
  status: "scheduled" | "published" | "pending";
  type: string;
}

interface CalendarViewProps {
  events?: CalendarEvent[];
  onDateSelect?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  tiktok: "#000000",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  twitter: "#1DA1F2",
  pinterest: "#BD081C",
  youtube: "#FF0000",
  blog: "#10B981",
  default: "#6366F1",
};

export default function CalendarView({
  events = [],
  onDateSelect,
  onEventClick,
}: CalendarViewProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Build event lookup map
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (!event.date) continue;
      const key = event.date.split("T")[0]!;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const prevMonth = useCallback(() => {
    setViewDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  }, [year, month]);

  const nextMonth = useCallback(() => {
    setViewDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  }, [year, month]);

  const goToToday = useCallback(() => {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  }, []);

  const handleDateClick = useCallback(
    (day: number) => {
      const date = new Date(year, month, day);
      setSelectedDate(date);
      onDateSelect?.(date);
    },
    [year, month, onDateSelect]
  );

  const selectedKey = selectedDate?.toISOString().split("T")[0] ?? "";
  const selectedEvents = eventMap.get(selectedKey) ?? [];

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={prevMonth} style={styles.navBtn}>&larr;</button>
        <h2 style={styles.monthTitle}>
          {MONTHS[month]} {year}
        </h2>
        <button onClick={nextMonth} style={styles.navBtn}>&rarr;</button>
        <button onClick={goToToday} style={styles.todayBtn}>Today</button>
      </div>

      {/* Day labels */}
      <div style={styles.grid}>
        {DAYS.map((day) => (
          <div key={day} style={styles.dayLabel}>{day}</div>
        ))}

        {/* Calendar cells */}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} style={styles.emptyCell} />;
          }

          const dateStr = new Date(year, month, day).toISOString().split("T")[0]!;
          const dayEvents = eventMap.get(dateStr) ?? [];
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();
          const isSelected = dateStr === selectedKey;

          return (
            <button
              key={day}
              onClick={() => handleDateClick(day)}
              style={{
                ...styles.cell,
                ...(isToday ? styles.todayCell : {}),
                ...(isSelected ? styles.selectedCell : {}),
              }}
            >
              <span style={styles.dayNum}>{day}</span>
              {dayEvents.length > 0 && (
                <div style={styles.platformLabels}>
                  {[...new Set(dayEvents.map(e => e.platform))].slice(0, 2).map((plat, i) => (
                    <span
                      key={i}
                      style={{
                        ...styles.platformLabel,
                        backgroundColor: PLATFORM_COLORS[plat] ?? PLATFORM_COLORS["default"],
                      }}
                    >
                      {plat.slice(0, 3)}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span style={styles.moreLabel}>+{dayEvents.length - 2}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div style={styles.eventPanel}>
          <h3 style={styles.eventPanelTitle}>
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          {selectedEvents.length === 0 ? (
            <p style={styles.noEvents}>No content scheduled for this day.</p>
          ) : (
            <div style={styles.eventList}>
              {selectedEvents.map((ev) => (
                <button
                  key={ev.id}
                  style={styles.eventItem}
                  onClick={() => onEventClick?.(ev)}
                >
                  <div style={styles.eventHeader}>
                    <span
                      style={{
                        ...styles.platformBadge,
                        backgroundColor:
                          PLATFORM_COLORS[ev.platform] ?? PLATFORM_COLORS["default"],
                      }}
                    >
                      {ev.platform}
                    </span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        color: ev.status === "published" ? "#10B981" : ev.status === "scheduled" ? "#F59E0B" : "#6B7280",
                      }}
                    >
                      {ev.status}
                    </span>
                  </div>
                  <p style={styles.eventTitle}>{ev.title}</p>
                  <p style={styles.eventType}>{ev.type}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    backgroundColor: "hsl(48, 24%, 96%)",
    border: "1px solid hsl(48, 15%, 85%)",
    borderRadius: 12,
    padding: 20,
    color: "hsl(0, 0%, 10%)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  navBtn: {
    background: "hsl(48, 18%, 90%)",
    border: "1px solid hsl(48, 15%, 85%)",
    color: "hsl(0, 0%, 10%)",
    borderRadius: 6,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 14,
  },
  monthTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
  },
  todayBtn: {
    background: "hsl(0, 0%, 10%)",
    border: "none",
    color: "hsl(48, 24%, 96%)",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 2,
  },
  dayLabel: {
    textAlign: "center" as const,
    fontSize: 11,
    color: "hsl(220, 9%, 46%)",
    padding: "6px 0",
    fontWeight: 600,
  },
  emptyCell: {
    aspectRatio: "1",
  },
  cell: {
    aspectRatio: "1",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    cursor: "pointer",
    color: "hsl(0, 0%, 10%)",
    fontSize: 13,
    transition: "background 0.1s",
  },
  todayCell: {
    border: "1px solid hsl(0, 0%, 10%, 0.2)",
  },
  selectedCell: {
    backgroundColor: "hsl(48, 18%, 90%)",
    border: "1px solid hsl(0, 0%, 10%, 0.3)",
  },
  dayNum: {
    fontSize: 13,
    fontWeight: 500,
  },
  platformLabels: {
    display: "flex",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  platformLabel: {
    fontSize: 8,
    fontWeight: 700,
    padding: "1px 4px",
    borderRadius: 3,
    color: "#fff",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  moreLabel: {
    fontSize: 8,
    color: "hsl(220, 9%, 46%)",
    fontWeight: 600,
  },
  eventPanel: {
    marginTop: 16,
    padding: "14px 0 0",
    borderTop: "1px solid hsl(48, 15%, 85%)",
  },
  eventPanelTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: "0 0 10px",
    color: "hsl(0, 0%, 10%)",
  },
  noEvents: {
    fontSize: 13,
    color: "hsl(220, 9%, 46%)",
    margin: 0,
  },
  eventList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  eventItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    padding: "10px 12px",
    backgroundColor: "hsl(48, 18%, 90%)",
    border: "1px solid hsl(48, 15%, 85%)",
    borderRadius: 8,
    cursor: "pointer",
    color: "hsl(0, 0%, 10%)",
    textAlign: "left" as const,
    width: "100%",
    transition: "border-color 0.1s",
  },
  eventHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  platformBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 4,
    color: "#fff",
    textTransform: "uppercase" as const,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 500,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: 500,
    margin: 0,
  },
  eventType: {
    fontSize: 11,
    color: "hsl(220, 9%, 46%)",
    margin: 0,
  },
};
