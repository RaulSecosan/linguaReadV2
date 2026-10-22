import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
export function hasActivity(activity = {}, progress = {}) {
  return ["readingMinutes", "pagesRead", "quizzesCompleted", "vocabularyPracticed", "tasksCompleted"]
    .some((key) => Number(activity[key]) > 0) || Boolean(progress.tasks?.some((task) => task.completed));
}
const dateKey = (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export default function ActivityCalendar({ selectedDate, onSelect, activity, progress, journal = {} }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${selectedDate}T12:00:00`));
  const container = useRef(null);
  const toggle = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      if (event.type === "pointerdown" && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const year = month.getFullYear(), index = month.getMonth();
  const start = (new Date(year, index, 1).getDay() + 6) % 7;
  const days = new Date(year, index + 1, 0).getDate();
  return <div className="activity-calendar" ref={container}>
    <button ref={toggle} type="button" className="icon-button coach-date-button" title="Alege ziua" aria-expanded={open}
      onClick={() => { setMonth(new Date(`${selectedDate}T12:00:00`)); setOpen(!open); }}><CalendarDays size={16} /></button>
    {open && <div className="calendar-popover" role="dialog" aria-label="Calendar activitate">
      <div className="calendar-heading">
        <button className="icon-button" aria-label="Luna anterioara" onClick={() => setMonth(new Date(year, index - 1, 1))}><ChevronLeft size={16} /></button>
        <strong>{new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" }).format(month)}</strong>
        <button className="icon-button" aria-label="Luna urmatoare" onClick={() => setMonth(new Date(year, index + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="calendar-grid">
        {["Lu", "Ma", "Mi", "Jo", "Vi", "Sa", "Du"].map((name) => <small key={name}>{name}</small>)}
        {Array.from({ length: start }, (_, i) => <span key={`space-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = dateKey(year, index, i + 1);
          const active = hasActivity(activity[date], progress[date]) || Boolean(Object.keys(journal[date]?.entries || {}).length);
          return <button key={date} className="calendar-day" aria-pressed={date === selectedDate}
            aria-label={`${date}${active ? ", activitate inregistrata" : ""}`}
            onClick={() => { onSelect(date); setOpen(false); toggle.current?.focus(); }}>
            {i + 1}{active && <span className="calendar-dot" aria-hidden="true" />}
          </button>;
        })}
      </div>
      <small>• Zi cu activitate</small>
    </div>}
  </div>;
}
