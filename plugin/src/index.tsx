import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { daysOfWeek, pulseDefinitionFromForm } from "./definition.js";
import { createPulseService } from "./service.js";
import type { SecureServiceRequester } from "./service.js";
import { pulseStyles } from "./styles.js";
import { createWorkshopSecureServiceRequester } from "./workshop-host.js";
export { createPulseService, type SecureServiceRequest, type SecureServiceRequester, type SecureServiceResponse } from "./service.js";
export { pulseDefinitionFromForm, type PulseDefinitionInput } from "./definition.js";
export { parsePulsePrivateConfig, type PulsePrivateConfig } from "./config.js";
export { createWorkshopSecureServiceRequester, pulseConfigFile, type HostInvoke } from "./workshop-host.js";

type RouteId = "reminders" | "history" | "settings";
type PulseDefinition = {
  id: string;
  title: string;
  active: boolean;
  instructions?: string;
  schedule?: { type?: string; daysOfWeek?: string[]; time?: string; timezone?: string };
  notificationPolicy?: { channels?: string[]; repeatEveryMinutes?: number; snoozeEveryMinutes?: number };
  [key: string]: unknown;
};
type PulseOccurrence = { id: string; pulseId: string; dueAt: string; state: string; completedAt?: string };
type PulseEvent = { occurrenceId?: string; type?: string };
type PulseSnapshot = {
  pulses: PulseDefinition[];
  checkedAt?: string;
  runnerHealth?: { status?: string; checkedAt?: string };
  state: { occurrences: PulseOccurrence[]; events: PulseEvent[] };
};

const routes: Array<{ id: RouteId; label: string }> = [
  { id: "reminders", label: "Reminders" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];
const privateRootStorageKey = "pulse.privateWorkspaceRoot.v1";

export const workshopPluginDeclaration = {
  contractVersion: 1,
  id: "pulse",
  displayName: "Pulse",
  description: "Persistent recurring reminders with Android Done and Snooze actions.",
  docsPath: "/docs/tools/pulse.md",
  workspaceRequirement: "Choose a private Pulse folder containing pulse.config.json.",
  uninstallSafetyCopy: "Removing Pulse from Workshop never removes private reminders or runner state.",
  routes: routes.map(({ id, label }) => ({ id, label, path: `/pulse/${id}` })),
  navigationMode: "plugin",
  requiredLocalCapabilities: ["local-workspace", "read_secure_service_metadata", "request_configured_secure_service"],
  dataRoots: [], importActions: [], exportActions: [], status: "ready",
  runtime: { kind: "generic-secure-service", entryPoint: "request_configured_secure_service" },
  privateWorkspace: { kind: "plugin-config", requiredFields: ["pulse.config.json"] },
} as const;

function normalizeRoute(route?: string): RouteId {
  return routes.some(({ id }) => id === route) ? route as RouteId : "reminders";
}

function emptySnapshot(): PulseSnapshot {
  return { pulses: [], state: { occurrences: [], events: [] } };
}

function readSnapshot(body: unknown): PulseSnapshot {
  if (!body || typeof body !== "object") return emptySnapshot();
  const value = body as Partial<PulseSnapshot>;
  return {
    pulses: Array.isArray(value.pulses) ? value.pulses.filter((pulse): pulse is PulseDefinition => Boolean(pulse && typeof pulse.id === "string" && typeof pulse.title === "string")) : [],
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : undefined,
    runnerHealth: value.runnerHealth && typeof value.runnerHealth === "object" ? value.runnerHealth : undefined,
    state: {
      occurrences: Array.isArray(value.state?.occurrences) ? value.state.occurrences : [],
      events: Array.isArray(value.state?.events) ? value.state.events : [],
    },
  };
}

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function minutesLabel(value?: number): string {
  if (!value) return "30 minutes";
  if (value === 1440) return "1 day";
  if (value % 1440 === 0) return `${value / 1440} days`;
  if (value === 60) return "1 hour";
  if (value % 60 === 0) return `${value / 60} hours`;
  return `${value} minutes`;
}

function formatDate(value?: string, includeTime = true): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not available";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function scheduleLabel(pulse: PulseDefinition): string {
  const day = pulse.schedule?.daysOfWeek?.[0];
  const time = pulse.schedule?.time;
  if (!day || !time) return "Schedule unavailable";
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  const clock = Number.isFinite(hour) ? `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}` : time;
  return `${titleCase(day)} at ${clock}`;
}

function openOccurrence(snapshot: PulseSnapshot, pulseId: string): PulseOccurrence | undefined {
  return snapshot.state.occurrences
    .filter((occurrence) => occurrence.pulseId === pulseId && occurrence.state !== "done")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
}

function nextNotification(snapshot: PulseSnapshot): string {
  const due = snapshot.state.occurrences.filter((item) => item.state === "due").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (due) return "Due now";
  const next = snapshot.state.occurrences.filter((item) => item.state !== "done").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return next ? formatDate(next.dueAt) : "No occurrence queued";
}

function runnerIsOnline(snapshot: PulseSnapshot): boolean {
  return snapshot.runnerHealth?.status === "running";
}

function runnerLabel(snapshot: PulseSnapshot): string {
  if (snapshot.runnerHealth?.status === "running") return "Runner online";
  if (snapshot.runnerHealth?.status === "stale") return "Runner stale";
  return "Status unavailable";
}

function RouteTabs({ active, onSelect, onRefresh }: { active: RouteId; onSelect: (route: RouteId) => void; onRefresh: () => void }): React.ReactElement {
  return <nav className="pulse-ui__nav" aria-label="Pulse sections">
    {routes.map((route) => <button key={route.id} className="pulse-ui__tab" type="button" aria-current={active === route.id ? "page" : undefined} onClick={() => onSelect(route.id)}>{route.label}</button>)}
    <button className="pulse-ui__tab pulse-ui__refresh" type="button" onClick={onRefresh}>↻ Refresh</button>
  </nav>;
}

export function WorkshopToolView({ activeRouteId = "reminders", workspaceRoot, requestWorkspaceRoot }: {
  activeRouteId?: string; workspaceRoot?: string; requestWorkspaceRoot: (root?: string) => void;
}): React.ReactElement {
  const rememberedRoot = useRef(typeof window === "undefined" ? "" : window.localStorage.getItem(privateRootStorageKey) ?? "");
  const [root, setRoot] = useState(() => workspaceRoot ?? rememberedRoot.current);
  const [route, setRoute] = useState<RouteId>(normalizeRoute(activeRouteId));
  const [request, setRequest] = useState<SecureServiceRequester | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState(workspaceRoot ? "Connecting Pulse…" : "Choose the private Pulse folder to connect your reminders.");
  const didRestoreRoot = useRef(false);
  useEffect(() => setRoute(normalizeRoute(activeRouteId)), [activeRouteId]);
  useEffect(() => {
    if (workspaceRoot || didRestoreRoot.current || !rememberedRoot.current) return;
    didRestoreRoot.current = true;
    requestWorkspaceRoot(rememberedRoot.current);
  }, [requestWorkspaceRoot, workspaceRoot]);
  useEffect(() => {
    if (workspaceRoot) {
      setRoot(workspaceRoot);
      rememberedRoot.current = workspaceRoot;
      window.localStorage.setItem(privateRootStorageKey, workspaceRoot);
    }
    setRequest(null);
    if (!workspaceRoot) {
      setConnectionStatus("Choose the private Pulse folder to connect your reminders.");
      return;
    }
    setConnectionStatus("Connecting Pulse…");
    let cancelled = false;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => createWorkshopSecureServiceRequester(workspaceRoot, invoke))
      .then((requester) => {
        if (cancelled) return;
        setRequest(() => requester);
        setConnectionStatus("Pulse connected.");
      })
      .catch(() => {
        if (!cancelled) setConnectionStatus("Pulse could not connect to its private service.");
      });
    return () => { cancelled = true; };
  }, [workspaceRoot, connectionAttempt]);
  const selectRoute = (next: RouteId) => {
    setRoute(next);
    window.dispatchEvent(new CustomEvent("workshop:route-selected", { detail: { toolId: "pulse", routeId: next, path: `/pulse/${next}` } }));
  };
  const connect = () => {
    const selectedRoot = root.trim();
    if (selectedRoot) {
      rememberedRoot.current = selectedRoot;
      window.localStorage.setItem(privateRootStorageKey, selectedRoot);
    }
    setConnectionAttempt((attempt) => attempt + 1);
    requestWorkspaceRoot(selectedRoot || undefined);
  };
  const reconnect = () => {
    setConnectionAttempt((attempt) => attempt + 1);
    requestWorkspaceRoot(undefined);
  };
  return <section className="pulse-ui" aria-label="Pulse">
    <style>{pulseStyles}</style>
    {request
      ? <PulseManagementView request={request} activeRouteId={route} workspaceRoot={workspaceRoot} onRouteChange={selectRoute} onReconnect={reconnect} />
      : <section className="pulse-ui__page pulse-ui__panel pulse-ui__connect" aria-label="Pulse connection">
          <p className="pulse-ui__eyebrow">Private connection</p>
          <h2>Connect your reminders</h2>
          <p className="pulse-ui__lede">Pulse keeps personal reminder data outside its public code. Persistent reminders are acknowledged from Android with Done or Snooze.</p>
          <label className="pulse-ui__field">Private Pulse folder
            <input aria-label="Pulse private folder" value={root} placeholder="Choose your workshop-private folder" onChange={(event) => setRoot(event.target.value)} />
            <small>This folder must contain pulse.config.json. Credentials stay in the macOS Keychain and never enter this view.</small>
          </label>
          <div className="pulse-ui__connect-actions"><button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={connect}>Connect Pulse</button></div>
          <p className="pulse-ui__notice" role="status">{connectionStatus}</p>
        </section>}
  </section>;
}

type ManagementProps = {
  request: SecureServiceRequester;
  activeRouteId?: string;
  workspaceRoot?: string;
  onRouteChange?: (route: RouteId) => void;
  onReconnect?: () => void;
};

/** Pulse owns this entire management surface; Workshop only supplies a secure requester. */
export function PulseManagementView({ request, activeRouteId = "reminders", workspaceRoot, onRouteChange, onReconnect }: ManagementProps): React.ReactElement {
  const service = useMemo(() => createPulseService(request), [request]);
  const [route, setRoute] = useState<RouteId>(normalizeRoute(activeRouteId));
  const [snapshot, setSnapshot] = useState<PulseSnapshot>(emptySnapshot());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PulseDefinition | "new" | null>(null);
  const [deleting, setDeleting] = useState<PulseDefinition | null>(null);
  useEffect(() => setRoute(normalizeRoute(activeRouteId)), [activeRouteId]);
  const refresh = useCallback(async (successMessage = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await service.snapshot();
      setSnapshot(readSnapshot(response.body));
      setStatus(successMessage);
    } catch {
      setError("Pulse could not refresh reminders. Check the private service connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [service]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selectRoute = (next: RouteId) => {
    setRoute(next);
    setEditing(null);
    onRouteChange?.(next);
  };
  const toggle = async (pulse: PulseDefinition) => {
    setError("");
    try {
      await service.update(pulse.id, { ...pulse, active: !pulse.active });
      await refresh(pulse.active ? "Reminder paused." : "Reminder resumed.");
    } catch { setError("Pulse could not update the reminder."); }
  };
  const remove = async (pulse: PulseDefinition) => {
    setError("");
    try {
      await service.remove(pulse.id);
      setDeleting(null);
      setEditing(null);
      await refresh("Reminder deleted.");
    } catch { setError("Pulse could not delete the reminder."); }
  };
  return <>
    <RouteTabs active={route} onSelect={selectRoute} onRefresh={() => void refresh("Pulse refreshed.")} />
    {route === "reminders" && (editing
      ? <ReminderEditor pulse={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onDelete={(pulse) => setDeleting(pulse)} onSave={async (definition) => {
          setError("");
          try {
            if (editing === "new") await service.create(definition);
            else await service.update(editing.id, definition);
            setEditing(null);
            await refresh(editing === "new" ? "Reminder created." : "Reminder updated.");
          } catch (caught) { setError(caught instanceof Error ? caught.message : "Pulse could not save the reminder."); }
        }} />
      : <RemindersPage snapshot={snapshot} loading={loading} onNew={() => setEditing("new")} onEdit={setEditing} onToggle={(pulse) => void toggle(pulse)} />)}
    {route === "history" && <HistoryPage snapshot={snapshot} loading={loading} />}
    {route === "settings" && <SettingsPage snapshot={snapshot} workspaceRoot={workspaceRoot} onReconnect={onReconnect} />}
    {error && <p className="pulse-ui__notice" role="alert">{error}</p>}
    {!error && status && <p className="pulse-ui__notice" role="status">{status}</p>}
    {deleting && <DeleteDialog pulse={deleting} onCancel={() => setDeleting(null)} onConfirm={() => void remove(deleting)} />}
  </>;
}

function RemindersPage({ snapshot, loading, onNew, onEdit, onToggle }: { snapshot: PulseSnapshot; loading: boolean; onNew: () => void; onEdit: (pulse: PulseDefinition) => void; onToggle: (pulse: PulseDefinition) => void }): React.ReactElement {
  const activeCount = snapshot.pulses.filter((pulse) => pulse.active).length;
  const orderedPulses = [...snapshot.pulses].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    const leftDue = openOccurrence(snapshot, left.id)?.dueAt;
    const rightDue = openOccurrence(snapshot, right.id)?.dueAt;
    if (leftDue && rightDue && leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
  return <section className="pulse-ui__page" aria-labelledby="pulse-reminders-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Your reminders</p><h2 id="pulse-reminders-heading">Keep the important things moving</h2><p className="pulse-ui__lede">Pulse follows up until you act. Done and Snooze stay on your Android notification.</p></div><button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={onNew}>＋ New reminder</button></header>
    <div className="pulse-ui__stats" aria-label="Pulse summary">
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Active</span><span className="pulse-ui__stat-value">{activeCount} reminder{activeCount === 1 ? "" : "s"}</span></div>
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Next notification</span><span className="pulse-ui__stat-value">{nextNotification(snapshot)}</span></div>
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Cloud runner</span><span className="pulse-ui__stat-value">{runnerIsOnline(snapshot) && <span className="pulse-ui__status-dot" />} {runnerLabel(snapshot)}</span></div>
    </div>
    <p className="pulse-ui__section-label">{loading ? "Loading reminders…" : `${snapshot.pulses.length} saved reminder${snapshot.pulses.length === 1 ? "" : "s"}`}</p>
    {!loading && snapshot.pulses.length === 0
      ? <div className="pulse-ui__panel pulse-ui__empty"><div className="pulse-ui__empty-mark">•</div><h3>No reminders yet</h3><p className="pulse-ui__muted">Create one here. Pulse will sync it to the cloud runner immediately.</p><button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={onNew}>Create your first reminder</button></div>
      : <div className="pulse-ui__list">{orderedPulses.map((pulse) => {
          const occurrence = openOccurrence(snapshot, pulse.id);
          const isDue = occurrence?.state === "due";
          return <article className={`pulse-ui__card${pulse.active ? "" : " pulse-ui__card--paused"}`} key={pulse.id}>
            <div className="pulse-ui__card-main"><div className="pulse-ui__card-title-row"><h3>{pulse.title}</h3><span className={`pulse-ui__badge${isDue ? " pulse-ui__badge--due" : ""}`}>{!pulse.active ? "Paused" : isDue ? "Due now" : "Active"}</span></div><p className="pulse-ui__schedule">{scheduleLabel(pulse)}{occurrence && !isDue ? ` · next ${formatDate(occurrence.dueAt)}` : ""}</p><p className="pulse-ui__policy">Snooze or no action: {minutesLabel(pulse.notificationPolicy?.snoozeEveryMinutes)} · Delivery retry: {minutesLabel(pulse.notificationPolicy?.repeatEveryMinutes)}</p></div>
            <div className="pulse-ui__actions"><button className="pulse-ui__button" type="button" onClick={() => onToggle(pulse)}>{pulse.active ? "Pause" : "Resume"}</button><button className="pulse-ui__button" type="button" onClick={() => onEdit(pulse)}>Edit</button></div>
          </article>;
        })}</div>}
  </section>;
}

function ReminderEditor({ pulse, onCancel, onDelete, onSave }: { pulse?: PulseDefinition; onCancel: () => void; onDelete: (pulse: PulseDefinition) => void; onSave: (pulse: PulseDefinition) => Promise<void> }): React.ReactElement {
  const [title, setTitle] = useState(pulse?.title ?? "");
  const [day, setDay] = useState(pulse?.schedule?.daysOfWeek?.[0] ?? "sunday");
  const [time, setTime] = useState(pulse?.schedule?.time ?? "09:00");
  const [repeat, setRepeat] = useState(String(pulse?.notificationPolicy?.repeatEveryMinutes ?? 30));
  const [snooze, setSnooze] = useState(String(pulse?.notificationPolicy?.snoozeEveryMinutes ?? 30));
  const [timezone, setTimezone] = useState(pulse?.schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles");
  const [formError, setFormError] = useState("");
  const submit = async () => {
    try {
      const formDefinition = pulseDefinitionFromForm({ id: pulse?.id, title, day, time, repeat, snooze, timezone, active: pulse?.active ?? true });
      await onSave(pulse ? { ...pulse, ...formDefinition } as PulseDefinition : formDefinition as PulseDefinition);
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Check the reminder details and try again."); }
  };
  return <section className="pulse-ui__page" aria-labelledby="pulse-editor-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">{pulse ? "Edit reminder" : "New reminder"}</p><h2 id="pulse-editor-heading">{pulse ? `Edit ${pulse.title}` : "Create reminder"}</h2><p className="pulse-ui__lede">Choose when the first notification appears and how Pulse should follow up.</p></div></header>
    <form className="pulse-ui__panel pulse-ui__form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="pulse-ui__field">Reminder name<input aria-label="Reminder name" autoFocus value={title} placeholder="What needs your attention?" onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="pulse-ui__form-grid"><label className="pulse-ui__field">Day<select aria-label="Reminder day" value={day} onChange={(event) => setDay(event.target.value)}>{daysOfWeek.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label className="pulse-ui__field">Time<input aria-label="Reminder time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <div className="pulse-ui__timing-grid">
        <TimingControl title="Repeat while due" description="If delivery fails while a reminder is due, this controls the retry interval." ariaLabel="Repeat notification minutes" value={repeat} onChange={setRepeat} />
        <TimingControl title="Snooze and no action" description="Used after Snooze, or when you do nothing for two minutes." ariaLabel="Unanswered snooze minutes" value={snooze} onChange={setSnooze} />
      </div>
      <label className="pulse-ui__field">Time zone<input aria-label="Reminder time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><small>Use an IANA time zone, such as America/Los_Angeles. Pulse handles daylight-saving changes.</small></label>
      {formError && <p className="pulse-ui__notice" role="alert">{formError}</p>}
      <div className="pulse-ui__form-actions"><div>{pulse && <button className="pulse-ui__button pulse-ui__button--danger" data-action="delete-reminder" type="button" onClick={() => onDelete(pulse)}>Delete reminder</button>}</div><div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" onClick={onCancel}>Cancel</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit">{pulse ? "Save changes" : "Create reminder"}</button></div></div>
    </form>
  </section>;
}

function TimingControl({ title, description, ariaLabel, value, onChange }: { title: string; description: string; ariaLabel: string; value: string; onChange: (value: string) => void }): React.ReactElement {
  const presets = [{ value: "30", label: "30 min" }, { value: "60", label: "1 hour" }, { value: "240", label: "4 hours" }, { value: "1440", label: "1 day" }];
  return <div className="pulse-ui__timing"><h3>{title}</h3><p>{description}</p><div className="pulse-ui__presets" aria-label={`${title} presets`}>{presets.map((preset) => <button key={preset.value} className="pulse-ui__preset" aria-pressed={value === preset.value} type="button" onClick={() => onChange(preset.value)}>{preset.label}</button>)}</div><label className="pulse-ui__field">Custom minutes<input aria-label={ariaLabel} type="number" min="1" max="10080" value={value} onChange={(event) => onChange(event.target.value)} /></label></div>;
}

function HistoryPage({ snapshot, loading }: { snapshot: PulseSnapshot; loading: boolean }): React.ReactElement {
  const completed = snapshot.state.occurrences.filter((item) => item.state === "done").sort((a, b) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt));
  return <section className="pulse-ui__page" aria-labelledby="pulse-history-heading"><header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Activity</p><h2 id="pulse-history-heading">Completion history</h2><p className="pulse-ui__lede">A quiet record of what you finished and how many nudges it took.</p></div></header><div className="pulse-ui__panel">{loading ? <p className="pulse-ui__muted">Loading history…</p> : completed.length === 0 ? <div className="pulse-ui__empty"><h3>No completed reminders yet</h3><p className="pulse-ui__muted">Completed occurrences will appear here.</p></div> : completed.map((occurrence) => {
    const pulse = snapshot.pulses.find((item) => item.id === occurrence.pulseId);
    const snoozes = snapshot.state.events.filter((event) => event.occurrenceId === occurrence.id && event.type === "occurrence_snoozed").length;
    return <div className="pulse-ui__history-row" key={occurrence.id}><span className="pulse-ui__history-icon">✓</span><div><strong>{pulse?.title ?? occurrence.pulseId}</strong><div className="pulse-ui__history-meta">{snoozes ? `Completed after ${snoozes} snooze${snoozes === 1 ? "" : "s"}` : "Completed on the first notification"}</div></div><time className="pulse-ui__history-meta" dateTime={occurrence.completedAt ?? occurrence.dueAt}>{formatDate(occurrence.completedAt ?? occurrence.dueAt, false)}</time></div>;
  })}</div></section>;
}

function SettingsPage({ snapshot, workspaceRoot, onReconnect }: { snapshot: PulseSnapshot; workspaceRoot?: string; onReconnect?: () => void }): React.ReactElement {
  const online = runnerIsOnline(snapshot);
  const stale = snapshot.runnerHealth?.status === "stale";
  return <section className="pulse-ui__page" aria-labelledby="pulse-settings-heading"><header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Connection</p><h2 id="pulse-settings-heading">Pulse settings</h2><p className="pulse-ui__lede">See how this installation reaches your private runner. Secrets remain outside the webview.</p></div></header><div className="pulse-ui__settings">
    <div className="pulse-ui__setting"><div><h3>{online ? "Runner is online" : stale ? "Runner heartbeat is stale" : "Runner status unavailable"}</h3><p>{online ? `Last checked ${formatDate(snapshot.runnerHealth?.checkedAt)}` : stale ? `The last check was ${formatDate(snapshot.runnerHealth?.checkedAt)}. Notifications may be delayed until the runner resumes.` : "Pulse has not received a current health report."}</p></div><span className="pulse-ui__badge">{online ? "Connected" : stale ? "Needs attention" : "Unknown"}</span></div>
    <div className="pulse-ui__setting"><div><h3>Private Pulse folder</h3><p>Reminder definitions and the service configuration live outside the public Pulse package.</p>{workspaceRoot && <code>{workspaceRoot}</code>}</div>{onReconnect && <button className="pulse-ui__button" type="button" onClick={onReconnect}>Reconnect</button>}</div>
    <div className="pulse-ui__setting"><div><h3>Android push through ntfy</h3><p>The notification credential is stored in the macOS Keychain and injected by Workshop's constrained native service. Pulse never receives the token.</p></div><span className="pulse-ui__badge">Secure</span></div>
  </div></section>;
}

function DeleteDialog({ pulse, onCancel, onConfirm }: { pulse: PulseDefinition; onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return <div className="pulse-ui__modal-backdrop"><section className="pulse-ui__modal" role="dialog" aria-modal="true" aria-labelledby="pulse-delete-title"><p className="pulse-ui__eyebrow">Permanent action</p><h2 id="pulse-delete-title">Delete “{pulse.title}”?</h2><p className="pulse-ui__muted">This removes the reminder from the cloud runner. Its past completion history may remain in runner state.</p><div className="pulse-ui__modal-actions"><button autoFocus className="pulse-ui__button" type="button" onClick={onCancel}>Keep reminder</button><button className="pulse-ui__button pulse-ui__button--danger" type="button" onClick={onConfirm}>Delete reminder</button></div></section></div>;
}
