import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { daysOfWeek, pulseDefinitionFromForm } from "./definition.js";
import { createPulseService } from "./service.js";
import type { SecureServiceRequester } from "./service.js";
import { pulseStyles } from "./styles.js";
import { PulseSetupWizard } from "./setup-wizard.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { PulseIcon } from "./icons.js";
export { PulseSetupWizard, netlifyHandoff, normalizeRunnerOrigin } from "./setup-wizard.js";
export { setupBack, setupForward, setupProgress, setupStateFromNative, type SetupState } from "./setup-machine.js";
import {
  beginPulseManagedSetup,
  cancelPulseManagedSetup,
  completePulseManagedSetup,
  completePulseExistingSetup,
  createManagedWorkshopSecureServiceRequester,
  createWorkshopSecureServiceRequester,
  disconnectPulseManagedService,
  managedSetupCapability,
  openPulseNotificationCredentialHandoff,
  openPulseSetupUrl,
  readPulseManagedSetup,
  updatePulseManagedSetup,
  type HostInvoke,
  type ManagedSetupView,
} from "./workshop-host.js";
export { createPulseService, type SecureServiceRequest, type SecureServiceRequester, type SecureServiceResponse } from "./service.js";
export { pulseDefinitionFromForm, type PulseDefinitionInput } from "./definition.js";
export { parsePulsePrivateConfig, type PulsePrivateConfig } from "./config.js";
export {
  beginPulseManagedSetup,
  cancelPulseManagedSetup,
  completePulseManagedSetup,
  completePulseExistingSetup,
  createManagedWorkshopSecureServiceRequester,
  createWorkshopSecureServiceRequester,
  disconnectPulseManagedService,
  managedSetupCapability,
  openPulseNotificationCredentialHandoff,
  openPulseSetupUrl,
  pulseConfigFile,
  pulseManagedServiceId,
  pulsePairingContract,
  readPulseManagedSetup,
  updatePulseManagedSetup,
  type HostInvoke,
  type ManagedSetupView,
} from "./workshop-host.js";

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
  workspaceRequirement: "No private folder is required for guided setup. Advanced manual installations may choose one.",
  uninstallSafetyCopy: "Removing Pulse from Workshop never removes private reminders or runner state.",
  routes: routes.map(({ id, label }) => ({ id, label, path: `/pulse/${id}` })),
  navigationMode: "plugin",
  requiredLocalCapabilities: ["managed-secure-service-v1"],
  dataRoots: [], importActions: [], exportActions: [], status: "ready",
  runtime: { kind: "generic-secure-service", entryPoint: "request_configured_secure_service" },
  privateWorkspace: { kind: "optional-plugin-config", requiredFields: ["pulse.config.json"] },
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
      occurrences: Array.isArray(value.state?.occurrences) ? value.state.occurrences.filter((occurrence): occurrence is PulseOccurrence => Boolean(
        occurrence && typeof occurrence.id === "string" && typeof occurrence.pulseId === "string" && typeof occurrence.dueAt === "string" && typeof occurrence.state === "string" &&
        (occurrence.completedAt === undefined || typeof occurrence.completedAt === "string")
      )) : [],
      events: Array.isArray(value.state?.events) ? value.state.events.filter((event): event is PulseEvent => Boolean(event && typeof event === "object")) : [],
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
    <button className="pulse-ui__tab pulse-ui__refresh" type="button" onClick={onRefresh}><PulseIcon kind="refresh" /> Refresh</button>
  </nav>;
}

export function WorkshopToolView({ activeRouteId = "reminders", workspaceRoot, requestWorkspaceRoot }: {
  activeRouteId?: string; workspaceRoot?: string; requestWorkspaceRoot: (root?: string) => void;
}): React.ReactElement {
  const rememberedRoot = useRef(typeof window === "undefined" ? "" : window.localStorage.getItem(privateRootStorageKey) ?? "");
  const [root, setRoot] = useState(() => workspaceRoot ?? rememberedRoot.current);
  const [route, setRoute] = useState<RouteId>(normalizeRoute(activeRouteId));
  const [request, setRequest] = useState<SecureServiceRequester | null>(null);
  const [invoke, setInvoke] = useState<HostInvoke | null>(null);
  const [guidedAvailable, setGuidedAvailable] = useState<boolean | null>(null);
  const [restoredSetup, setRestoredSetup] = useState<ManagedSetupView | undefined>();
  const [guidedInitialState, setGuidedInitialState] = useState<"delivery-secret" | "migration" | undefined>();
  const [manualVisible, setManualVisible] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("Checking for an existing Pulse connection…");
  const didRestoreRoot = useRef(false);
  useEffect(() => setRoute(normalizeRoute(activeRouteId)), [activeRouteId]);
  useEffect(() => {
    if (workspaceRoot || didRestoreRoot.current || !rememberedRoot.current) return;
    didRestoreRoot.current = true;
    requestWorkspaceRoot(rememberedRoot.current);
  }, [requestWorkspaceRoot, workspaceRoot]);
  useEffect(() => {
    setRequest(null);
    setCheckingConnection(true);
    let cancelled = false;
    void import("@tauri-apps/api/core")
      .then(async ({ invoke: hostInvoke }) => {
        if (cancelled) return;
        setInvoke(() => hostInvoke);
        const capability = await managedSetupCapability(hostInvoke);
        if (cancelled) return;
        setGuidedAvailable(capability);
        if (capability) {
          try {
            const managedRequester = await createManagedWorkshopSecureServiceRequester(hostInvoke);
            const setupStatus = await managedRequester({ method: "GET", path: "/api/setup/status" });
            if (cancelled) return;
            if (setupStatus.status >= 200 && setupStatus.status < 300 && (setupStatus.body as { notificationConfigured?: boolean })?.notificationConfigured === true) {
              setRequest(() => managedRequester);
              setConnectionStatus("Pulse connected.");
              setCheckingConnection(false);
              return;
            }
            setGuidedInitialState("delivery-secret");
            setConnectionStatus("Finish notification delivery setup.");
            setCheckingConnection(false);
            return;
          } catch {
            try {
              const pending = await readPulseManagedSetup(hostInvoke);
              if (!cancelled) setRestoredSetup(pending);
            } catch {
              // A missing pending record is the normal first-run state.
            }
          }
        }
        if (workspaceRoot) {
          setRoot(workspaceRoot);
          rememberedRoot.current = workspaceRoot;
          window.localStorage.setItem(privateRootStorageKey, workspaceRoot);
          const manualRequester = await createWorkshopSecureServiceRequester(workspaceRoot, hostInvoke);
          if (!cancelled) {
            setRequest(() => manualRequester);
            setConnectionStatus("Pulse connected.");
          }
        } else {
          setConnectionStatus(capability ? "Pulse is ready to set up." : "This Workshop version supports the Advanced private-folder connection only.");
        }
        if (!cancelled) setCheckingConnection(false);
      })
      .catch(() => {
        if (!cancelled) {
          setGuidedAvailable(false);
          setConnectionStatus("Pulse setup requires the packaged Workshop app.");
          setCheckingConnection(false);
        }
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
  const changeWorkspaceRoot = (nextRoot: string) => {
    rememberedRoot.current = nextRoot;
    window.localStorage.setItem(privateRootStorageKey, nextRoot);
    setRoot(nextRoot);
    setRequest(null);
    setConnectionStatus("Connecting Pulse…");
    requestWorkspaceRoot(nextRoot);
  };
  const finishManagedConnection = (requester: SecureServiceRequester) => {
    if (guidedInitialState === "migration") {
      rememberedRoot.current = "";
      window.localStorage.removeItem(privateRootStorageKey);
      setRoot("");
      requestWorkspaceRoot(undefined);
    }
    setGuidedInitialState(undefined);
    setRestoredSetup(undefined);
    setRequest(() => requester);
    setConnectionStatus("Pulse connected.");
  };
  const disconnectManaged = async () => {
    if (!invoke) throw new Error("Workshop native setup is unavailable.");
    await disconnectPulseManagedService(invoke);
    setRequest(null);
    setGuidedInitialState(undefined);
    setRestoredSetup(undefined);
    setConnectionStatus("This Mac is disconnected. Your runner and reminders remain in your provider account.");
  };
  return <section className="pulse-ui" aria-label="Pulse">
    <style>{pulseStyles}</style>
    {checkingConnection
      ? <section className="pulse-ui__page pulse-ui__panel pulse-ui__connect" aria-label="Pulse connection">
          <p className="pulse-ui__eyebrow">Private connection</p>
          <h2>Opening Pulse…</h2>
          <p className="pulse-ui__notice" role="status">{connectionStatus}</p>
        </section>
      : request
      ? <PulseManagementView request={request} activeRouteId={route} workspaceRoot={workspaceRoot} onRouteChange={selectRoute} onWorkspaceRootChange={changeWorkspaceRoot} onRepairDelivery={invoke ? () => openPulseNotificationCredentialHandoff(invoke) : undefined} onDisconnect={!workspaceRoot && invoke ? disconnectManaged : undefined} onMigrateConnection={workspaceRoot && invoke ? () => { setGuidedInitialState("migration"); setRequest(null); } : undefined} />
      : invoke && guidedAvailable && !manualVisible
        ? <PulseSetupWizard
            invoke={invoke}
            restored={restoredSetup}
            initialState={guidedInitialState}
            onConnected={finishManagedConnection}
            onManualSetup={() => setManualVisible(true)}
          />
        : <section className="pulse-ui__page pulse-ui__panel pulse-ui__connect" aria-label="Pulse connection">
          <p className="pulse-ui__eyebrow">Private connection</p>
          <h2>Advanced private-folder connection</h2>
          <p className="pulse-ui__lede">Use this only for an existing manual or self-hosted installation. The normal guided setup does not require a folder path.</p>
          <label className="pulse-ui__field">Private Pulse folder
            <input aria-label="Pulse private folder" value={root} placeholder="Choose your workshop-private folder" onChange={(event) => setRoot(event.target.value)} />
            <small>This folder must contain pulse.config.json. Credentials stay in the macOS Keychain and never enter this view.</small>
          </label>
          <div className="pulse-ui__connect-actions">{guidedAvailable && <button className="pulse-ui__button" type="button" onClick={() => setManualVisible(false)}>Back to guided setup</button>}<button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={connect}>Connect Pulse</button></div>
          <p className="pulse-ui__notice" role="status">{connectionStatus}</p>
        </section>}
  </section>;
}

type ManagementProps = {
  request: SecureServiceRequester;
  activeRouteId?: string;
  workspaceRoot?: string;
  onRouteChange?: (route: RouteId) => void;
  onWorkspaceRootChange?: (root: string) => void;
  onRepairDelivery?: () => Promise<unknown>;
  onDisconnect?: () => Promise<void>;
  onMigrateConnection?: () => void;
};

/** Pulse owns this entire management surface; Workshop only supplies a secure requester. */
export function PulseManagementView({ request, activeRouteId = "reminders", workspaceRoot, onRouteChange, onWorkspaceRootChange, onRepairDelivery, onDisconnect, onMigrateConnection }: ManagementProps): React.ReactElement {
  const service = useMemo(() => createPulseService(request), [request]);
  const [route, setRoute] = useState<RouteId>(normalizeRoute(activeRouteId));
  const [snapshot, setSnapshot] = useState<PulseSnapshot>(emptySnapshot());
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PulseDefinition | "new" | null>(null);
  const [deleting, setDeleting] = useState<PulseDefinition | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationBusyRef = useRef(false);
  const [deleteError, setDeleteError] = useState("");
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
    setStatus("");
    setError("");
    onRouteChange?.(next);
  };
  const toggle = async (pulse: PulseDefinition) => {
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setError("");
    try {
      await service.update(pulse.id, { ...pulse, active: !pulse.active });
      await refresh(pulse.active ? "Reminder paused." : "Reminder resumed.");
    } catch { setError("Pulse could not update the reminder."); }
    finally { mutationBusyRef.current = false; setMutationBusy(false); }
  };
  const remove = async (pulse: PulseDefinition) => {
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setError("");
    setDeleteError("");
    try {
      await service.remove(pulse.id);
      setDeleting(null);
      setEditing(null);
      await refresh("Reminder deleted.");
    } catch {
      const failure = "Pulse could not delete the reminder.";
      setError(failure);
      setDeleteError(failure);
    } finally { mutationBusyRef.current = false; setMutationBusy(false); }
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
      : <RemindersPage snapshot={snapshot} loading={loading} mutationBusy={mutationBusy} onNew={() => { setStatus(""); setError(""); setEditing("new"); }} onEdit={(pulse) => { setStatus(""); setError(""); setEditing(pulse); }} onToggle={(pulse) => void toggle(pulse)} />)}
    {route === "history" && <HistoryPage snapshot={snapshot} loading={loading} />}
    {route === "settings" && <SettingsPage snapshot={snapshot} request={request} workspaceRoot={workspaceRoot} onWorkspaceRootChange={onWorkspaceRootChange} onRepairDelivery={onRepairDelivery} onDisconnect={onDisconnect} onMigrateConnection={onMigrateConnection} />}
    {error && <p className="pulse-ui__notice" role="alert">{error}</p>}
    {!error && status && <p className="pulse-ui__notice" role="status">{status}</p>}
    {deleting && <DeleteDialog pulse={deleting} busy={mutationBusy} error={deleteError} onCancel={() => { setDeleting(null); setDeleteError(""); }} onConfirm={() => void remove(deleting)} />}
  </>;
}

function RemindersPage({ snapshot, loading, mutationBusy, onNew, onEdit, onToggle }: { snapshot: PulseSnapshot; loading: boolean; mutationBusy: boolean; onNew: () => void; onEdit: (pulse: PulseDefinition) => void; onToggle: (pulse: PulseDefinition) => void }): React.ReactElement {
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
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Your reminders</p><h2 id="pulse-reminders-heading">Keep the important things moving</h2><p className="pulse-ui__lede">Pulse follows up until you act. Done and Snooze stay on your Android notification.</p></div><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--icon" type="button" disabled={mutationBusy} onClick={onNew}><PulseIcon kind="plus" /> New reminder</button></header>
    <div className="pulse-ui__stats" aria-label="Pulse summary">
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Active</span><span className="pulse-ui__stat-value">{activeCount} reminder{activeCount === 1 ? "" : "s"}</span></div>
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Next notification</span><span className="pulse-ui__stat-value">{nextNotification(snapshot)}</span></div>
      <div className="pulse-ui__stat"><span className="pulse-ui__stat-label">Cloud runner</span><span className="pulse-ui__stat-value">{runnerIsOnline(snapshot) && <span className="pulse-ui__status-dot" />} {runnerLabel(snapshot)}</span></div>
    </div>
    <p className="pulse-ui__section-label">{loading ? "Loading reminders…" : `${snapshot.pulses.length} saved reminder${snapshot.pulses.length === 1 ? "" : "s"}`}</p>
    {!loading && snapshot.pulses.length === 0
      ? <div className="pulse-ui__panel pulse-ui__empty"><div className="pulse-ui__empty-mark"><PulseIcon kind="bell" /></div><h3>No reminders yet</h3><p className="pulse-ui__muted">Create one here. Pulse will sync it to the cloud runner immediately.</p><button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={onNew}>Create your first reminder</button></div>
      : <div className="pulse-ui__list">{orderedPulses.map((pulse) => {
          const occurrence = openOccurrence(snapshot, pulse.id);
          const isDue = occurrence?.state === "due";
          return <article className={`pulse-ui__card${pulse.active ? "" : " pulse-ui__card--paused"}`} key={pulse.id}>
            <div className="pulse-ui__card-main"><div className="pulse-ui__card-title-row"><h3>{pulse.title}</h3><span className={`pulse-ui__badge${isDue ? " pulse-ui__badge--due" : ""}`}>{!pulse.active ? "Paused" : isDue ? "Due now" : "Active"}</span></div><p className="pulse-ui__schedule">{scheduleLabel(pulse)}{occurrence && !isDue ? ` · next ${formatDate(occurrence.dueAt)}` : ""}</p><p className="pulse-ui__policy">Snooze or no action: {minutesLabel(pulse.notificationPolicy?.snoozeEveryMinutes)}</p></div>
            <div className="pulse-ui__actions"><button className="pulse-ui__button" type="button" disabled={mutationBusy} onClick={() => onToggle(pulse)}>{pulse.active ? "Pause" : "Resume"}</button><button className="pulse-ui__button" type="button" disabled={mutationBusy} onClick={() => onEdit(pulse)}>Edit</button></div>
          </article>;
        })}</div>}
  </section>;
}

function ReminderEditor({ pulse, onCancel, onDelete, onSave }: { pulse?: PulseDefinition; onCancel: () => void; onDelete: (pulse: PulseDefinition) => void; onSave: (pulse: PulseDefinition) => Promise<void> }): React.ReactElement {
  const [title, setTitle] = useState(pulse?.title ?? "");
  const [day, setDay] = useState(pulse?.schedule?.daysOfWeek?.[0] ?? "sunday");
  const [time, setTime] = useState(pulse?.schedule?.time ?? "09:00");
  const [snooze, setSnooze] = useState(String(pulse?.notificationPolicy?.snoozeEveryMinutes ?? 30));
  const [timezone, setTimezone] = useState(pulse?.schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const formDefinition = pulseDefinitionFromForm({ id: pulse?.id, title, day, time, snooze, timezone, active: pulse?.active ?? true });
      await onSave(pulse ? { ...pulse, ...formDefinition } as PulseDefinition : formDefinition as PulseDefinition);
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Check the reminder details and try again."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <section className="pulse-ui__page" aria-labelledby="pulse-editor-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">{pulse ? "Edit reminder" : "New reminder"}</p><h2 id="pulse-editor-heading">{pulse ? `Edit ${pulse.title}` : "Create reminder"}</h2><p className="pulse-ui__lede">Choose when the first notification appears and how Pulse should follow up.</p></div></header>
    <form className="pulse-ui__panel pulse-ui__form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="pulse-ui__field">Reminder name<input aria-label="Reminder name" autoFocus disabled={saving} value={title} placeholder="What needs your attention?" onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="pulse-ui__form-grid"><label className="pulse-ui__field">Day<select aria-label="Reminder day" value={day} onChange={(event) => setDay(event.target.value)}>{daysOfWeek.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label className="pulse-ui__field">Time<input aria-label="Reminder time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <div className="pulse-ui__timing-grid pulse-ui__timing-grid--single">
        <TimingControl title="Snooze and no action" description="Used after Snooze, or when you do nothing for two minutes." ariaLabel="Unanswered snooze minutes" value={snooze} onChange={setSnooze} />
      </div>
      <label className="pulse-ui__field">Time zone<input aria-label="Reminder time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><small>Use an IANA time zone, such as America/Los_Angeles. Pulse handles daylight-saving changes.</small></label>
      {formError && <p className="pulse-ui__notice" role="alert">{formError}</p>}
      <div className="pulse-ui__form-actions"><div>{pulse && <button className="pulse-ui__button pulse-ui__button--danger" data-action="delete-reminder" type="button" disabled={saving} onClick={() => onDelete(pulse)}>Delete reminder</button>}</div><div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : pulse ? "Save changes" : "Create reminder"}</button></div></div>
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
    return <div className="pulse-ui__history-row" key={occurrence.id}><span className="pulse-ui__history-icon"><PulseIcon kind="check" /></span><div><strong>{pulse?.title ?? occurrence.pulseId}</strong><div className="pulse-ui__history-meta">{snoozes ? `Completed after ${snoozes} snooze${snoozes === 1 ? "" : "s"}` : "Completed on the first notification"}</div></div><time className="pulse-ui__history-meta" dateTime={occurrence.completedAt ?? occurrence.dueAt}>{formatDate(occurrence.completedAt ?? occurrence.dueAt, false)}</time></div>;
  })}</div></section>;
}

function SettingsPage({ snapshot, request, workspaceRoot, onWorkspaceRootChange, onRepairDelivery, onDisconnect, onMigrateConnection }: { snapshot: PulseSnapshot; request: SecureServiceRequester; workspaceRoot?: string; onWorkspaceRootChange?: (root: string) => void; onRepairDelivery?: () => Promise<unknown>; onDisconnect?: () => Promise<void>; onMigrateConnection?: () => void }): React.ReactElement {
  const online = runnerIsOnline(snapshot);
  const stale = snapshot.runnerHealth?.status === "stale";
  const [changingFolder, setChangingFolder] = useState(false);
  const [nextRoot, setNextRoot] = useState(workspaceRoot ?? "");
  const [addingMac, setAddingMac] = useState(false);
  const [installationId, setInstallationId] = useState("");
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string }>();
  const [actionStatus, setActionStatus] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; installationId: string; createdAt: string; revokedAt: string | null }>>([]);
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const actionBusyRef = useRef(false);
  useEffect(() => {
    if (!changingFolder) setNextRoot(workspaceRoot ?? "");
  }, [changingFolder, workspaceRoot]);
  const refreshClients = useCallback(async () => {
    try {
      const response = await request({ method: "GET", path: "/api/setup/clients" });
      const body = response.body as { clients?: typeof clients; currentClientId?: string | null };
      if (response.status >= 200 && response.status < 300 && Array.isArray(body.clients)) {
        setClients(body.clients);
        setCurrentClientId(typeof body.currentClientId === "string" ? body.currentClientId : null);
      }
    } catch { /* client management remains optional during legacy migration */ }
  }, [request]);
  useEffect(() => { void refreshClients(); }, [refreshClients]);
  const selectedRoot = nextRoot.trim();
  const canChangeFolder = selectedRoot !== "" && selectedRoot !== workspaceRoot;
  const createInvitation = async () => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionStatus("");
    try {
      const response = await request({ method: "POST", path: "/api/setup/clients", body: { installationId: installationId.trim() } });
      if (response.status !== 201) { setActionStatus("Pulse could not create an invitation. Check the installation id and try again."); return; }
      const body = response.body as { code?: string; expiresAt?: string };
      if (!body.code || !body.expiresAt) { setActionStatus("The runner returned an invalid invitation."); return; }
    setInvitation({ code: body.code, expiresAt: body.expiresAt });
      setActionStatus("Invitation created. It expires in ten minutes and works once.");
    } catch { setActionStatus("Pulse could not reach the runner to create an invitation."); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  };
  const revokeClient = async (clientId: string) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    try {
      const response = await request({ method: "DELETE", path: `/api/setup/clients/${encodeURIComponent(clientId)}` });
      if (response.status < 200 || response.status >= 300) throw new Error("rejected");
      setActionStatus("Mac access revoked.");
      await refreshClients();
    } catch { setActionStatus("Pulse could not revoke that Mac. Try again from a connected managed installation."); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  };
  const sendTest = async () => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionStatus("");
    try {
      const response = await request({ method: "POST", path: "/api/setup/test-notification", body: { idempotencyKey: `settings-${Date.now().toString(36)}` } });
      setActionStatus(response.status >= 200 && response.status < 300 ? "Test sent. Check your Android notifications." : "The runner could not send a test notification.");
    } catch { setActionStatus("Pulse could not reach the runner to send a test notification."); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  };
  const copyInvitation = async () => {
    if (!invitation || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionStatus("");
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(invitation.code);
      setActionStatus("Invitation code copied.");
    } catch {
      setActionStatus("Pulse could not copy the invitation code.");
    } finally { actionBusyRef.current = false; setActionBusy(false); }
  };
  return <section className="pulse-ui__page" aria-labelledby="pulse-settings-heading"><header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Connection</p><h2 id="pulse-settings-heading">Pulse settings</h2><p className="pulse-ui__lede pulse-ui__lede--wide">See how this installation reaches your private runner. Secrets remain outside the webview.</p></div></header><div className="pulse-ui__settings">
    <div className="pulse-ui__setting"><div><h3>{online ? "Runner is online" : stale ? "Runner heartbeat is stale" : "Runner status unavailable"}</h3><p>{online ? `Last checked ${formatDate(snapshot.runnerHealth?.checkedAt)}` : stale ? `The last check was ${formatDate(snapshot.runnerHealth?.checkedAt)}. Notifications may be delayed until the runner resumes.` : "Pulse has not received a current health report."}</p></div><span className={`pulse-ui__badge${online ? " pulse-ui__badge--success" : stale ? " pulse-ui__badge--warning" : ""}`}>{online ? "Online" : stale ? "Needs attention" : "Unknown"}</span></div>
    {workspaceRoot ? <div className="pulse-ui__setting pulse-ui__setting--folder"><div className="pulse-ui__setting-main"><h3>Advanced private Pulse folder</h3><p>This installation uses the previous manual configuration path.</p><code>{workspaceRoot}</code>{changingFolder && <form className="pulse-ui__folder-editor" onSubmit={(event) => {
      event.preventDefault();
      if (!canChangeFolder) return;
      onWorkspaceRootChange?.(selectedRoot);
      setChangingFolder(false);
    }}><label className="pulse-ui__field">New private Pulse folder<input autoFocus aria-label="New Pulse private folder" value={nextRoot} onChange={(event) => setNextRoot(event.target.value)} /><small>Choose a different folder containing pulse.config.json. The credential remains in the macOS Keychain.</small></label><div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" onClick={() => setChangingFolder(false)}>Cancel</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={!canChangeFolder}>Use this folder</button></div></form>}</div><div className="pulse-ui__setting-actions"><span className="pulse-ui__badge">Connected</span>{onMigrateConnection && <button className="pulse-ui__button pulse-ui__button--primary" type="button" onClick={onMigrateConnection}>Move to managed access</button>}{onWorkspaceRootChange && !changingFolder && <button className="pulse-ui__button" type="button" onClick={() => setChangingFolder(true)}>Change folder</button>}</div></div> : <div className="pulse-ui__setting pulse-ui__setting--folder"><div className="pulse-ui__setting-main"><h3>Managed by Workshop</h3><p>The service address is validated natively and this Mac’s revocable credential stays in Keychain.</p>{confirmingDisconnect && <div className="pulse-ui__disconnect-warning" role="group" aria-label="Confirm disconnect"><strong>This only disconnects this Mac.</strong><p>Your runner, reminders, Android delivery, provider account, and any provider billing keep running. Delete the deployment separately in your provider dashboard if you want it gone.</p><div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => setConfirmingDisconnect(false)}>Keep connected</button><button className="pulse-ui__button pulse-ui__button--danger" type="button" disabled={actionBusy} onClick={() => {
      if (actionBusyRef.current || !onDisconnect) return;
      actionBusyRef.current = true; setActionBusy(true); setActionStatus("");
      void onDisconnect().catch(() => { setActionStatus("Pulse could not finish disconnecting. This Mac may already be revoked; reopen Pulse before retrying."); setConfirmingDisconnect(false); }).finally(() => { actionBusyRef.current = false; setActionBusy(false); });
    }}>Disconnect this Mac</button></div></div>}</div><div className="pulse-ui__setting-actions"><span className="pulse-ui__badge">Secure</span>{onDisconnect && !confirmingDisconnect && <button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => setConfirmingDisconnect(true)}>Disconnect this Mac</button>}</div></div>}
    <div className="pulse-ui__setting"><div><h3>Android push through ntfy</h3><p>The notification credential is stored by your runner. Workshop stores only this Mac’s runner credential in Keychain; Pulse never receives either secret.</p></div><div className="pulse-ui__setting-actions"><button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => void sendTest()}>Send test</button>{onRepairDelivery && <button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => {
      if (actionBusyRef.current) return;
      actionBusyRef.current = true; setActionBusy(true); setActionStatus("");
      void onRepairDelivery().then(() => setActionStatus("Your runner opened a fresh secure ntfy-access page.")).catch(() => setActionStatus("Pulse could not open the secure repair page.")).finally(() => { actionBusyRef.current = false; setActionBusy(false); });
    }}>Repair access</button>}</div></div>
    <div className="pulse-ui__setting pulse-ui__setting--folder"><div className="pulse-ui__setting-main"><h3>Add another Mac</h3><p>On the other Mac, choose Connect an existing Pulse and copy its installation id here. The invitation is bound to that Mac, expires in ten minutes, and works once.</p>{addingMac && <form className="pulse-ui__folder-editor" onSubmit={(event) => { event.preventDefault(); void createInvitation(); }}><label className="pulse-ui__field">Other Mac installation id<input aria-label="Other Mac installation id" disabled={actionBusy} value={installationId} onChange={(event) => setInstallationId(event.target.value)} required /></label>{invitation && <div className="pulse-ui__invitation"><strong>Ten-minute invitation</strong><code>{invitation.code}</code><small>Expires {formatDate(invitation.expiresAt)}</small><button className="pulse-ui__text-button" type="button" disabled={actionBusy} onClick={() => void copyInvitation()}><PulseIcon kind="copy" /> Copy invitation code</button></div>}<div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => { setAddingMac(false); setInvitation(undefined); }}>Close</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={actionBusy || !installationId.trim()}>{actionBusy ? "Creating…" : "Create invitation"}</button></div></form>}</div>{!addingMac && <button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => setAddingMac(true)}>Add a Mac</button>}</div>
    {clients.length > 0 && <div className="pulse-ui__setting pulse-ui__setting--clients"><div className="pulse-ui__setting-main"><h3>Connected Macs</h3><p>Each installation has separate access. Revoking one does not break the others.</p><div className="pulse-ui__client-list">{clients.map((client) => <div key={client.id}><div><strong>{client.id === currentClientId ? "This Mac" : client.installationId}</strong><small>{client.revokedAt ? `Revoked ${formatDate(client.revokedAt)}` : `Connected ${formatDate(client.createdAt)}`}</small></div>{!client.revokedAt && client.id !== currentClientId && <button className="pulse-ui__button pulse-ui__button--danger" type="button" disabled={actionBusy} onClick={() => void revokeClient(client.id)}>Revoke</button>}</div>)}</div></div></div>}
  </div>{actionStatus && <p className="pulse-ui__notice" role="status">{actionStatus}</p>}</section>;
}

function DeleteDialog({ pulse, busy, error, onCancel, onConfirm }: { pulse: PulseDefinition; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  return <ConfirmDialog eyebrow="Permanent action" title={`Delete “${pulse.title}”?`} description={<p>This removes the reminder from the cloud runner. Its past completion history may remain in runner state.</p>} confirmLabel="Delete reminder" cancelLabel="Keep reminder" busy={busy} error={error} onCancel={onCancel} onConfirm={onConfirm} />;
}
