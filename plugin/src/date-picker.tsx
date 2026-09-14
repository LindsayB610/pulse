import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { PulseIcon } from "./icons.js";

type DateParts = { year: number; month: number; day: number };

export type PulseDatePickerProps = {
  label: string;
  ariaLabel: string;
  dataField: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  today?: string;
  compact?: boolean;
};

const dayMilliseconds = 86_400_000;

export function PulseDatePicker({ label, ariaLabel, dataField, value, onChange, min, max, disabled = false, today, compact = false }: PulseDatePickerProps): React.ReactElement {
  const labelId = useId();
  const dialogId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(value);
  const [viewDate, setViewDate] = useState(monthStart(value));
  const resolvedToday = today ?? localToday();
  const firstDay = localeFirstDay();
  const years = yearOptions(viewDate, min, max);

  useEffect(() => {
    const bounded = clampDate(value, min, max);
    if (bounded !== value) onChange(bounded);
  }, [max, min, onChange, value]);

  useEffect(() => {
    if (!open) return;
    const initial = clampDate(value, min, max);
    setActiveDate(initial);
    setViewDate(monthStart(initial));
  }, [max, min, open, value]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      rootRef.current?.querySelector<HTMLButtonElement>(`[data-date='${activeDate}']`)?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [activeDate, open, viewDate]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);

  const dates = useMemo(() => monthGrid(viewDate, firstDay), [firstDay, viewDate]);
  const select = (next: string) => {
    if (next !== clampDate(next, min, max)) return;
    onChange(next);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus());
  };
  const closeCalendar = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus());
  };
  const moveFocus = (next: string) => {
    next = clampDate(next, min, max);
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-date='${next}']`)?.focus();
    setActiveDate(next);
    if (monthStart(next) !== viewDate) setViewDate(monthStart(next));
  };
  const shiftMonth = (amount: number) => {
    const nextView = addMonths(viewDate, amount);
    if (!monthAvailable(nextView, min, max)) return;
    moveFocus(dateInMonth(activeDate, nextView));
  };
  const chooseMonth = (year: number, month: number) => {
    let nextView = formatDate({ year, month, day: 1 });
    if (min && nextView < monthStart(min)) nextView = monthStart(min);
    if (max && nextView > monthStart(max)) nextView = monthStart(max);
    moveFocus(dateInMonth(activeDate, nextView));
  };
  const handleGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(activeDate, -1),
      ArrowRight: () => addDays(activeDate, 1),
      ArrowUp: () => addDays(activeDate, -7),
      ArrowDown: () => addDays(activeDate, 7),
      Home: () => addDays(activeDate, -weekdayOffset(activeDate, firstDay)),
      End: () => addDays(activeDate, 6 - weekdayOffset(activeDate, firstDay)),
      PageUp: () => dateInMonth(activeDate, addMonths(monthStart(activeDate), -1)),
      PageDown: () => dateInMonth(activeDate, addMonths(monthStart(activeDate), 1)),
    };
    if (moves[event.key]) {
      event.preventDefault();
      moveFocus(moves[event.key]!());
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(activeDate);
      return;
    }
  };

  return <div className={`pulse-ui__field pulse-ui__date-picker${compact ? " pulse-ui__date-picker--compact" : ""}`} ref={rootRef}>
    <span id={labelId}>{label}</span>
    <button
      ref={triggerRef}
      className="pulse-ui__date-trigger"
      type="button"
      data-field={dataField}
      data-value={value}
      aria-label={`${ariaLabel}: ${longDate(value)}`}
      aria-labelledby={`${labelId} ${dialogId}-value`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? dialogId : undefined}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
    >
      <span id={`${dialogId}-value`}>{longDate(value)}</span>
      <PulseIcon kind="calendar" />
    </button>
    {open && <div id={dialogId} className="pulse-ui__calendar" role="dialog" aria-label={`Choose ${ariaLabel.toLowerCase()}`} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCalendar();
    }}>
      <div className="pulse-ui__calendar-head">
        <button type="button" aria-label="Previous month" disabled={!monthAvailable(addMonths(viewDate, -1), min, max)} onClick={() => shiftMonth(-1)}><PulseIcon kind="chevron-left" /></button>
        <div className="pulse-ui__calendar-period">
          <select aria-label="Calendar month" value={String(parseDate(viewDate).month)} onChange={(event) => chooseMonth(parseDate(viewDate).year, Number(event.target.value))}>
            {monthNames().map((month, index) => <option key={month} value={index + 1} disabled={!monthAvailable(formatDate({ year: parseDate(viewDate).year, month: index + 1, day: 1 }), min, max)}>{month}</option>)}
          </select>
          <select aria-label="Calendar year" value={String(parseDate(viewDate).year)} onChange={(event) => chooseMonth(Number(event.target.value), parseDate(viewDate).month)}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <button type="button" aria-label="Next month" disabled={!monthAvailable(addMonths(viewDate, 1), min, max)} onClick={() => shiftMonth(1)}><PulseIcon kind="chevron-right" /></button>
      </div>
      <div className="pulse-ui__calendar-weekdays" aria-hidden="true">
        {orderedWeekdays(firstDay).map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="pulse-ui__calendar-grid" role="group" aria-label={monthLabel(viewDate)} onKeyDown={handleGridKey}>
        {dates.map((date) => {
          const unavailable = date !== clampDate(date, min, max);
          return <button
            key={date}
            type="button"
            data-date={date}
            data-today={date === resolvedToday || undefined}
            data-outside-month={monthStart(date) !== viewDate || undefined}
            aria-label={`${longDate(date)}${date === resolvedToday ? ", Today" : ""}`}
            aria-pressed={date === value}
            tabIndex={date === activeDate ? 0 : -1}
            disabled={unavailable}
            onFocus={() => setActiveDate(date)}
            onClick={() => select(date)}
          >{parseDate(date).day}</button>;
        })}
      </div>
      <div className="pulse-ui__calendar-foot">
        <button className="pulse-ui__text-button" type="button" data-action="choose-today" disabled={resolvedToday !== clampDate(resolvedToday, min, max)} onClick={() => select(resolvedToday)}>Today</button>
        <button className="pulse-ui__text-button" type="button" onClick={closeCalendar}>Close</button>
      </div>
    </div>}
  </div>;
}

function parseDate(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function formatDate({ year, month, day }: DateParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDate(value: string): Date {
  const parts = parseDate(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function fromUtc(value: Date): string {
  return formatDate({ year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() });
}

function monthStart(value: string): string {
  const { year, month } = parseDate(value);
  return formatDate({ year, month, day: 1 });
}

function addDays(value: string, amount: number): string {
  return fromUtc(new Date(utcDate(value).getTime() + amount * dayMilliseconds));
}

function addMonths(value: string, amount: number): string {
  const { year, month } = parseDate(value);
  return fromUtc(new Date(Date.UTC(year, month - 1 + amount, 1)));
}

function dateInMonth(active: string, month: string): string {
  const activeParts = parseDate(active);
  const monthParts = parseDate(month);
  const lastDay = new Date(Date.UTC(monthParts.year, monthParts.month, 0)).getUTCDate();
  return formatDate({ year: monthParts.year, month: monthParts.month, day: Math.min(activeParts.day, lastDay) });
}

function monthGrid(viewMonth: string, firstDay: number): string[] {
  const first = utcDate(viewMonth).getUTCDay();
  const offset = (first - firstDay + 7) % 7;
  const start = addDays(viewMonth, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekdayOffset(value: string, firstDay: number): number {
  return (utcDate(value).getUTCDay() - firstDay + 7) % 7;
}

function localeFirstDay(): number {
  try {
    const locale = new Intl.Locale(typeof navigator === "undefined" ? "en-US" : navigator.language) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } };
    const firstDay = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay;
    if (firstDay !== undefined) return firstDay % 7;
  } catch { /* stable US fallback */ }
  return 0;
}

function orderedWeekdays(firstDay: number): string[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, index) => labels[(firstDay + index) % 7]!);
}

function localToday(): string {
  const value = new Date();
  return formatDate({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() });
}

function longDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(utcDate(value));
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(utcDate(value));
}

function monthNames(): string[] {
  return Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month, 1))));
}

function clampDate(value: string, min?: string, max?: string): string {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

function monthAvailable(value: string, min?: string, max?: string): boolean {
  const month = monthStart(value);
  return (!min || month >= monthStart(min)) && (!max || month <= monthStart(max));
}

function yearOptions(value: string, min?: string, max?: string): number[] {
  const viewYear = parseDate(value).year;
  const first = min ? parseDate(min).year : viewYear - 5;
  const last = max ? parseDate(max).year : viewYear + 10;
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
