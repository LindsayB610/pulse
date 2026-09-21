import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  daysOfWeek,
  defaultReminderDate,
  localeWeekStartsOn,
  monthlyRuleLabels,
  pulseDefinitionFromForm,
  recurrenceDefaults,
  recurrencePreview,
  recurrenceSummary,
  type Frequency,
} from "./definition.js";
import { createPulseService } from "./service.js";
import type { SecureServiceRequester } from "./service.js";
import { pulseStyles } from "./styles.js";
import { PulseSetupWizard } from "./setup-wizard.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { PulseDatePicker } from "./date-picker.js";
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
  schedule?: { version?: number; type?: string; date?: string; startDate?: string; interval?: number; daysOfWeek?: string[]; weekStartsOn?: string; time?: string; timezone?: string; end?: { type?: string; occurrences?: number; date?: string }; rule?: { type?: string; day?: number | string; ordinal?: number | string; missingDate?: string }; month?: number; day?: number };
  notificationPolicy?: { channels?: string[]; repeatEveryMinutes?: number; snoozeEveryMinutes?: number };
  definitionRevision?: number;
  seriesRevision?: number;
  [key: string]: unknown;
};
type PulseOccurrence = { id: string; pulseId: string; dueAt: string; state: string; completedAt?: string; snoozeCount?: number; ordinal?: number; final?: boolean; titleSnapshot?: string; seriesRevision?: number };
type PulseEvent = { occurrenceId?: string; type?: string };
type PulseSnapshot = {
  pulses: PulseDefinition[];
  checkedAt?: string;
  runnerHealth?: { status?: string; checkedAt?: string };
  state: { occurrences: PulseOccurrence[]; events: PulseEvent[] };
  seriesProgress?: Record<string, { generated: number; remaining?: number; endsOn?: string; complete: boolean }>;
  recurrenceMigration?: { required: boolean; legacyPulseIds: string[] };
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

function serviceFailureStatus(caught: unknown): number | undefined {
  if (!caught || typeof caught !== "object") return undefined;
  const status = (caught as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function serviceFailureDescription(caught: unknown): string {
  if (typeof caught === "string") return caught.slice(0, 512).toLowerCase();
  if (caught instanceof Error) return caught.message.slice(0, 512).toLowerCase();
  if (!caught || typeof caught !== "object") return "";
  const value = caught as { message?: unknown; error?: unknown };
  const description = typeof value.message === "string" ? value.message : typeof value.error === "string" ? value.error : "";
  return description.slice(0, 512).toLowerCase();
}

/** Classify only known host/service failures. Raw error prose may contain secrets and is never returned. */
function refreshFailureMessage(caught: unknown): string {
  const status = serviceFailureStatus(caught);
  const description = serviceFailureDescription(caught);
  if (/secure service response is too large|response (?:body )?(?:exceeds|exceeded).*limit/.test(description)) {
    return "Pulse has too much activity history to load. Update the runner, then try again.";
  }
  if (/secure service credential is (?:unavailable|not configured|invalid)/.test(description)) {
    return "This Mac’s saved Pulse access is unavailable. Open Settings and reconnect Pulse.";
  }
  if (status === 401 || status === 403 || /\b(?:unauthorized|forbidden)\b/.test(description)) {
    return "Pulse’s runner rejected this Mac’s access. Open Settings and reconnect Pulse.";
  }
  if (/could not (?:reach|read) (?:managed )?secure service|(?:managed )?secure service request failed|timed? out|connection refused|could not resolve host/.test(description)) {
    return "Pulse’s runner did not respond. Check that it is online, then try again.";
  }
  return "Pulse could not refresh reminders. Try again. If it keeps failing, check the runner in Settings.";
}

function readSnapshot(body: unknown): PulseSnapshot {
  if (!body || typeof body !== "object") return emptySnapshot();
  const value = body as Partial<PulseSnapshot>;
  return {
    pulses: Array.isArray(value.pulses) ? value.pulses.filter((pulse): pulse is PulseDefinition => Boolean(pulse && typeof pulse.id === "string" && typeof pulse.title === "string")) : [],
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : undefined,
    runnerHealth: value.runnerHealth && typeof value.runnerHealth === "object" ? value.runnerHealth : undefined,
    seriesProgress: value.seriesProgress && typeof value.seriesProgress === "object" ? value.seriesProgress : undefined,
    recurrenceMigration: value.recurrenceMigration && typeof value.recurrenceMigration === "object" ? value.recurrenceMigration : undefined,
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

function dateYearsAfter(value: string, years: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetYear = year! + years;
  const lastDay = new Date(Date.UTC(targetYear, month!, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day!, lastDay)).padStart(2, "0")}`;
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
  if (!pulse.schedule) return "Schedule unavailable";
  if (pulse.schedule.version === 2) return recurrenceSummary(pulse as Record<string, unknown>);
  const day = pulse.schedule.daysOfWeek?.[0];
  const time = pulse.schedule.time;
  if (!day || !time) return "Schedule unavailable";
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  return `${titleCase(day)} at ${Number.isFinite(hour) ? `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}` : time}`;
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

function RouteTabs({ active, refreshing, onSelect, onRefresh }: { active: RouteId; refreshing: boolean; onSelect: (route: RouteId) => void; onRefresh: () => void }): React.ReactElement {
  return <nav className="pulse-ui__nav" aria-label="Pulse sections">
    {routes.map((route) => <button key={route.id} className="pulse-ui__tab" type="button" aria-current={active === route.id ? "page" : undefined} onClick={() => onSelect(route.id)}>{route.label}</button>)}
    <button className="pulse-ui__tab pulse-ui__refresh" type="button" disabled={refreshing} aria-busy={refreshing || undefined} onClick={onRefresh}><PulseIcon kind="refresh" /> {refreshing ? "Refreshing…" : "Refresh"}</button>
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
  const connectionBusyRef = useRef(false);
  const didRestoreRoot = useRef(false);
  useEffect(() => { if (!checkingConnection) connectionBusyRef.current = false; }, [checkingConnection]);
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
    if (connectionBusyRef.current) return;
    connectionBusyRef.current = true;
    setCheckingConnection(true);
    setConnectionStatus("Connecting Pulse…");
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
  const [hasLoadedSnapshot, setHasLoadedSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PulseDefinition | "new" | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [deleting, setDeleting] = useState<PulseDefinition | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationAction, setMutationAction] = useState<{ kind: "pause" | "resume" | "delete"; pulseId: string } | null>(null);
  const mutationBusyRef = useRef(false);
  const manualRefreshBusyRef = useRef(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => setRoute(normalizeRoute(activeRouteId)), [activeRouteId]);
  const refresh = useCallback(async (successMessage = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await service.snapshot();
      setSnapshot(readSnapshot(response.body));
      setHasLoadedSnapshot(true);
      setStatus(successMessage);
    } catch (caught) {
      setError(refreshFailureMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [service]);
  const reloadCanonicalSnapshot = useCallback(async (): Promise<boolean> => {
    try {
      const response = await service.snapshot();
      const nextSnapshot = readSnapshot(response.body);
      setSnapshot(nextSnapshot);
      setEditing((current) => {
        if (current === null || current === "new") return current;
        return nextSnapshot.pulses.find((pulse) => pulse.id === current.id) ?? current;
      });
      return true;
    } catch {
      return false;
    }
  }, [service]);
  useEffect(() => { void refresh(); }, [refresh]);
  const manualRefresh = async () => {
    if (manualRefreshBusyRef.current) return;
    manualRefreshBusyRef.current = true;
    setManualRefreshing(true);
    try { await refresh("Pulse refreshed."); }
    finally { manualRefreshBusyRef.current = false; setManualRefreshing(false); }
  };
  const selectRoute = (next: RouteId) => {
    setRoute(next);
    setEditing(null);
    setStatus("");
    if (hasLoadedSnapshot) setError("");
    onRouteChange?.(next);
  };
  const toggle = async (pulse: PulseDefinition) => {
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationAction({ kind: pulse.active ? "pause" : "resume", pulseId: pulse.id });
    setError("");
    try {
      await service.update(pulse.id, { ...pulse, active: !pulse.active });
      await refresh(pulse.active ? "Reminder paused." : "Reminder resumed.");
    } catch { setError("Pulse could not update the reminder."); }
    finally { mutationBusyRef.current = false; setMutationBusy(false); setMutationAction(null); }
  };
  const remove = async (pulse: PulseDefinition) => {
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationAction({ kind: "delete", pulseId: pulse.id });
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
    } finally { mutationBusyRef.current = false; setMutationBusy(false); setMutationAction(null); }
  };
  const snapshotUnavailable = route !== "settings" && !hasLoadedSnapshot && (Boolean(error) || manualRefreshing);
  return <>
    <RouteTabs active={route} refreshing={manualRefreshing} onSelect={selectRoute} onRefresh={() => void manualRefresh()} />
    {snapshotUnavailable && <SnapshotUnavailablePage error={error} refreshing={manualRefreshing} onRetry={() => void manualRefresh()} />}
    {!snapshotUnavailable && (route === "reminders" && snapshot.recurrenceMigration?.required && !loading
      ? <RecurrenceMigrationPage snapshot={snapshot} onMigrate={async (classifications) => {
          await service.migrateRecurrence(classifications);
          await refresh("Reminder schedules updated.");
        }} />
      : route === "reminders" && (editing
      ? <ReminderEditor pulse={editing === "new" ? undefined : editing} openOccurrence={editing === "new" ? undefined : openOccurrence(snapshot, editing.id)} renewing={renewing} onCancel={() => { setEditing(null); setRenewing(false); }} onDelete={(pulse) => setDeleting(pulse)} onSave={async (definition) => {
          setError("");
          try {
            if (editing === "new") await service.create(definition);
            else await service.update(editing.id, definition);
            setEditing(null);
            setRenewing(false);
            await refresh(editing === "new" ? "Reminder created." : "Reminder updated.");
          } catch (caught) {
            const failure = caught instanceof Error ? caught : new Error("Pulse could not save the reminder.");
            if (/definition revision conflict/i.test(failure.message)) {
              const reloaded = await reloadCanonicalSnapshot();
              setError(reloaded
                ? `${failure.message} Pulse loaded the latest saved progress; your draft is still here.`
                : `${failure.message} Your draft is still here, but Pulse could not load the latest saved progress.`);
            } else {
              setError(failure.message);
            }
            throw failure;
          }
        }} />
      : <RemindersPage snapshot={snapshot} loading={loading} mutationBusy={mutationBusy} mutationAction={mutationAction} onNew={() => { setStatus(""); setError(""); setRenewing(false); setEditing("new"); }} onEdit={(pulse) => { setStatus(""); setError(""); setRenewing(false); setEditing(pulse); }} onRenew={(pulse) => { setStatus(""); setError(""); setRenewing(true); setEditing(pulse); }} onToggle={(pulse) => void toggle(pulse)} />))}
    {!snapshotUnavailable && route === "history" && <HistoryPage snapshot={snapshot} loading={loading} />}
    {!snapshotUnavailable && route === "settings" && <SettingsPage snapshot={snapshot} request={request} workspaceRoot={workspaceRoot} onWorkspaceRootChange={onWorkspaceRootChange} onRepairDelivery={onRepairDelivery} onDisconnect={onDisconnect} onMigrateConnection={onMigrateConnection} />}
    {!snapshotUnavailable && error && <p className="pulse-ui__notice" role="alert">{error}</p>}
    {!snapshotUnavailable && !error && status && <p className="pulse-ui__notice" role="status">{status}</p>}
    {deleting && <DeleteDialog pulse={deleting} busy={mutationAction?.kind === "delete" && mutationAction.pulseId === deleting.id} error={deleteError} onCancel={() => { setDeleting(null); setDeleteError(""); }} onConfirm={() => void remove(deleting)} />}
  </>;
}

function SnapshotUnavailablePage({ error, refreshing, onRetry }: { error: string; refreshing: boolean; onRetry: () => void }): React.ReactElement {
  return <section className="pulse-ui__page" aria-labelledby="pulse-unavailable-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Reminders unavailable</p><h2 id="pulse-unavailable-heading">Pulse couldn’t load your reminders</h2><p className="pulse-ui__lede">Your saved reminders and runner were not changed.</p></div></header>
    <div className="pulse-ui__panel pulse-ui__empty"><div className="pulse-ui__empty-mark"><PulseIcon kind="refresh" /></div>{error && <p className="pulse-ui__notice" role="alert">{error}</p>}<button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--icon" type="button" disabled={refreshing} aria-busy={refreshing || undefined} onClick={onRetry}><PulseIcon kind="refresh" /> {refreshing ? "Trying again…" : "Try again"}</button></div>
  </section>;
}

function RecurrenceMigrationPage({ snapshot, onMigrate }: { snapshot: PulseSnapshot; onMigrate: (classifications: unknown[]) => Promise<void> }): React.ReactElement {
  const legacy = snapshot.pulses.filter((pulse) => snapshot.recurrenceMigration?.legacyPulseIds.includes(pulse.id));
  const [choices, setChoices] = useState<Record<string, "once" | "repeat">>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const ready = legacy.length > 0 && legacy.every((pulse) => choices[pulse.id]);
  return <section className="pulse-ui__page" aria-labelledby="pulse-migration-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">One-time update</p><h2 id="pulse-migration-heading">Finish updating your reminder schedules</h2><p className="pulse-ui__lede pulse-ui__lede--wide">Old Pulse reminders repeated forever without asking. Choose what each one should do. Nothing changes until every choice saves together.</p></div></header>
    <form className="pulse-ui__migration" onSubmit={(event) => {
      event.preventDefault();
      if (!ready || busyRef.current) return;
      busyRef.current = true; setBusy(true); setError("");
      const classifications = legacy.map((pulse) => choices[pulse.id] === "once"
        ? { id: pulse.id, mode: "once" }
        : { id: pulse.id, mode: "repeat", end: { type: "count", occurrences: Number(counts[pulse.id] ?? 30) } });
      void onMigrate(classifications).catch((caught) => setError(caught instanceof Error ? caught.message : "Pulse could not update the schedules.")).finally(() => { busyRef.current = false; setBusy(false); });
    }}>
      {legacy.map((pulse) => <fieldset className="pulse-ui__migration-card" key={pulse.id}><legend>{pulse.title}</legend><p>{scheduleLabel(pulse)}</p><div className="pulse-ui__choice-row">
        <label><input type="radio" name={`migration-${pulse.id}`} checked={choices[pulse.id] === "once"} onChange={() => setChoices((current) => ({ ...current, [pulse.id]: "once" }))} /><span><strong>Runs once</strong><small>Keep the current or next reminder, then finish permanently.</small></span></label>
        <label><input type="radio" name={`migration-${pulse.id}`} checked={choices[pulse.id] === "repeat"} onChange={() => setChoices((current) => ({ ...current, [pulse.id]: "repeat" }))} /><span><strong>Repeats</strong><small>Keep the weekly schedule as a finite set.</small></span></label>
      </div>{choices[pulse.id] === "repeat" && <label className="pulse-ui__field pulse-ui__migration-count">Number of reminders<input type="number" min="1" max="365" value={counts[pulse.id] ?? "30"} onChange={(event) => setCounts((current) => ({ ...current, [pulse.id]: event.target.value }))} /><small>30 is the recommended weekly set. You can add another set when it ends.</small></label>}</fieldset>)}
      {error && <p className="pulse-ui__notice" role="alert">{error}</p>}
      <div className="pulse-ui__migration-footer"><p>{ready ? "Ready to update all schedules." : `Choose an option for ${legacy.filter((pulse) => !choices[pulse.id]).length} reminder${legacy.filter((pulse) => !choices[pulse.id]).length === 1 ? "" : "s"}.`}</p><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={!ready || busy} aria-busy={busy || undefined}>{busy ? "Updating…" : "Update all schedules"}</button></div>
    </form>
  </section>;
}

function RemindersPage({ snapshot, loading, mutationBusy, mutationAction, onNew, onEdit, onRenew, onToggle }: { snapshot: PulseSnapshot; loading: boolean; mutationBusy: boolean; mutationAction: { kind: "pause" | "resume" | "delete"; pulseId: string } | null; onNew: () => void; onEdit: (pulse: PulseDefinition) => void; onRenew: (pulse: PulseDefinition) => void; onToggle: (pulse: PulseDefinition) => void }): React.ReactElement {
  const isFinished = (pulse: PulseDefinition) => snapshot.seriesProgress?.[pulse.id]?.complete === true;
  const activeCount = snapshot.pulses.filter((pulse) => pulse.active && !isFinished(pulse)).length;
  const orderedPulses = [...snapshot.pulses].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    const leftDue = openOccurrence(snapshot, left.id)?.dueAt;
    const rightDue = openOccurrence(snapshot, right.id)?.dueAt;
    if (leftDue && rightDue && leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
  const currentPulses = orderedPulses.filter((pulse) => !isFinished(pulse));
  const finishedPulses = orderedPulses.filter(isFinished);
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
      : <><div className="pulse-ui__list">{currentPulses.map((pulse) => {
          const occurrence = openOccurrence(snapshot, pulse.id);
          const isDue = occurrence?.state === "due";
          const progress = snapshot.seriesProgress?.[pulse.id];
          const progressText = progress?.remaining !== undefined && progress.remaining <= 3
            ? `${progress.remaining} remaining`
            : progress?.remaining !== undefined ? `${progress.remaining} of ${(pulse.schedule?.end?.occurrences ?? progress.generated)} remaining`
              : progress?.endsOn ? `ends ${progress.endsOn}` : "";
          return <article className={`pulse-ui__card${pulse.active ? "" : " pulse-ui__card--paused"}`} key={pulse.id}>
            <div className="pulse-ui__card-main"><div className="pulse-ui__card-title-row"><h3>{pulse.title}</h3><span className={`pulse-ui__badge${isDue || occurrence?.final ? " pulse-ui__badge--due" : ""}`}>{!pulse.active ? "Paused" : occurrence?.final ? "Final reminder" : isDue ? "Due now" : "Active"}</span></div><p className="pulse-ui__schedule">{scheduleLabel(pulse)}{occurrence && !isDue ? ` · next ${formatDate(occurrence.dueAt)}` : ""}</p>{progressText && <p className="pulse-ui__series-progress">{progressText}</p>}<p className="pulse-ui__policy">Snooze or no action: {minutesLabel(pulse.notificationPolicy?.snoozeEveryMinutes)}</p></div>
            <div className="pulse-ui__actions"><button className="pulse-ui__button" type="button" disabled={mutationBusy} aria-busy={mutationAction?.pulseId === pulse.id && (mutationAction.kind === "pause" || mutationAction.kind === "resume") || undefined} onClick={() => onToggle(pulse)}>{mutationAction?.pulseId === pulse.id && mutationAction.kind === "pause" ? "Pausing…" : mutationAction?.pulseId === pulse.id && mutationAction.kind === "resume" ? "Resuming…" : pulse.active ? "Pause" : "Resume"}</button><button className="pulse-ui__button" type="button" disabled={mutationBusy} onClick={() => onEdit(pulse)}>Edit</button></div>
          </article>;
        })}</div>{finishedPulses.length > 0 && <details className="pulse-ui__finished"><summary>Finished <span>{finishedPulses.length}</span></summary><div className="pulse-ui__list">{finishedPulses.map((pulse) => <article className="pulse-ui__card pulse-ui__card--finished" key={pulse.id}><div className="pulse-ui__card-main"><h3>{pulse.title}</h3><p className="pulse-ui__schedule">{scheduleLabel(pulse)}</p><p className="pulse-ui__policy">This set is complete. It will not restart by itself.</p></div><button className="pulse-ui__button" type="button" onClick={() => onRenew(pulse)}>{pulse.schedule?.type === "once" ? "Schedule again" : "Add another set"}</button></article>)}</div></details>}</>}
  </section>;
}

function ReminderEditor({ pulse, openOccurrence: activeOccurrence, renewing = false, onCancel, onDelete, onSave }: { pulse?: PulseDefinition; openOccurrence?: PulseOccurrence; renewing?: boolean; onCancel: () => void; onDelete: (pulse: PulseDefinition) => void; onSave: (pulse: PulseDefinition) => Promise<void> }): React.ReactElement {
  const savedSchedule = pulse?.schedule;
  const initialTimezone = savedSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles";
  const [title, setTitle] = useState(pulse?.title ?? "");
  const [time, setTime] = useState(savedSchedule?.time ?? "09:00");
  const [date, setDate] = useState(renewing ? defaultReminderDate(new Date(), initialTimezone, savedSchedule?.time ?? "09:00") : savedSchedule?.date ?? savedSchedule?.startDate ?? defaultReminderDate(new Date(), initialTimezone, savedSchedule?.time ?? "09:00"));
  const [repeat, setRepeat] = useState(savedSchedule?.version === 2 && savedSchedule.type !== "once");
  const [frequency, setFrequency] = useState<Frequency>(savedSchedule?.type === "daily" || savedSchedule?.type === "weekly" || savedSchedule?.type === "monthly" || savedSchedule?.type === "yearly" ? savedSchedule.type : "weekly");
  const [interval, setIntervalValue] = useState(String(savedSchedule?.interval ?? 1));
  const [selectedDays, setSelectedDays] = useState<string[]>(savedSchedule?.daysOfWeek ?? [daysOfWeek[new Date(`${savedSchedule?.startDate ?? date}T00:00:00Z`).getUTCDay()] ?? "sunday"]);
  const [monthlyRule, setMonthlyRule] = useState<"dayOfMonth" | "nthWeekday" | "lastDay">(savedSchedule?.rule?.type === "nthWeekday" ? "nthWeekday" : savedSchedule?.rule?.missingDate === "lastDay" ? "lastDay" : "dayOfMonth");
  const [weekStartsOn] = useState(savedSchedule?.weekStartsOn ?? localeWeekStartsOn());
  const [endType, setEndType] = useState<"count" | "date">(!renewing && savedSchedule?.end?.type === "date" ? "date" : "count");
  const [endCount, setEndCount] = useState(String(renewing ? recurrenceDefaults[frequency] : savedSchedule?.end?.occurrences ?? recurrenceDefaults[frequency]));
  const [endDate, setEndDate] = useState(savedSchedule?.end?.date ?? date);
  const [snooze, setSnooze] = useState(String(pulse?.notificationPolicy?.snoozeEveryMinutes ?? 30));
  const [timezone, setTimezone] = useState(initialTimezone);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PulseDefinition | null>(null);
  const savingRef = useRef(false);
  const weekdaysTouchedRef = useRef(Boolean(savedSchedule?.daysOfWeek));
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (endDate < date) setEndDate(date);
  }, [date, endDate]);
  const clearValidation = () => {
    formRef.current?.querySelectorAll("[aria-invalid='true']").forEach((element) => element.removeAttribute("aria-invalid"));
    setFormError("");
  };
  const changeDate = (next: string) => {
    setDate(next);
    if (!weekdaysTouchedRef.current) {
      setSelectedDays([daysOfWeek[new Date(`${next}T00:00:00Z`).getUTCDay()] ?? "sunday"]);
    }
  };
  const showFormError = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "Check the reminder details and try again.";
    setFormError(message);
    const field = /name|already exists|\bid\b/i.test(message) ? "name" : /time zone|IANA/i.test(message) ? "timezone" : /snooze/i.test(message) ? "snooze" : /weekday/i.test(message) ? "weekdays" : /interval|Every must/i.test(message) ? "interval" : /end date|before its start/i.test(message) ? "end-date" : /occurrence count|many reminders|five-year|365/i.test(message) ? (endType === "date" ? "end-date" : "end-count") : /time/i.test(message) ? "time" : /date/i.test(message) ? "date" : undefined;
    const target = field ? formRef.current?.querySelector<HTMLElement>(`[data-field='${field}']`) : undefined;
    target?.setAttribute("aria-invalid", "true");
    target?.focus();
  };
  const buildDefinition = useCallback(() => {
    const preserveSavedOrdinal = savedSchedule?.type === "monthly" && savedSchedule.rule?.type === "nthWeekday" && savedSchedule.startDate === date;
    const formDefinition = pulseDefinitionFromForm({ id: pulse?.id, title, date, time, snooze, timezone, active: pulse?.active ?? true, repeat, frequency, interval, daysOfWeek: selectedDays, weekStartsOn, endType, endCount, endDate, monthlyRule, ...(preserveSavedOrdinal ? { monthlyOrdinal: String(savedSchedule.rule?.ordinal) as "1" | "2" | "3" | "4" | "5" | "last", monthlyWeekday: String(savedSchedule.rule?.day) } : {}), now: new Date() });
    return (pulse ? { ...pulse, ...formDefinition } : formDefinition) as PulseDefinition;
  }, [date, endCount, endDate, endType, frequency, interval, monthlyRule, pulse, repeat, savedSchedule, selectedDays, snooze, time, timezone, title, weekStartsOn]);
  const selectDateEnding = () => {
    if (endType !== "date") {
      try { setEndDate(recurrencePreview(buildDefinition()).last); }
      catch { setEndDate(date); }
    }
    setEndType("date");
  };
  const monthlyLabels = monthlyRuleLabels(date);
  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    clearValidation();
    try {
      const definition = buildDefinition();
      const scheduleChanged = pulse && JSON.stringify(pulse.schedule) !== JSON.stringify(definition.schedule);
      if (scheduleChanged) { setPending(definition); return; }
      await onSave(definition);
    } catch (caught) { showFormError(caught); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const confirmPendingSchedule = async () => {
    if (!pending || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const definition = pending;
    try {
      await onSave(definition);
      setPending(null);
    } catch (caught) {
      setPending(null);
      showFormError(caught);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return <section className="pulse-ui__page" aria-labelledby="pulse-editor-heading">
    <header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">{renewing ? "New bounded set" : pulse ? "Edit reminder" : "New reminder"}</p><h2 id="pulse-editor-heading">{renewing ? `Add another set for ${pulse?.title}` : pulse ? `Edit ${pulse.title}` : "Create reminder"}</h2><p className="pulse-ui__lede">Choose when the first notification appears and how Pulse should follow up.</p></div></header>
    <form ref={formRef} className="pulse-ui__panel pulse-ui__form" onChange={() => { if (formError) clearValidation(); }} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="pulse-ui__field">Reminder name<input data-field="name" aria-label="Reminder name" autoFocus disabled={saving} value={title} placeholder="What needs your attention?" onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="pulse-ui__form-grid"><PulseDatePicker label="Date" ariaLabel="Reminder date" dataField="date" value={date} min={pulse && !renewing ? undefined : defaultReminderDate(new Date(), timezone, "23:59")} onChange={changeDate} disabled={saving} /><label className="pulse-ui__field">Time<input data-field="time" aria-label="Reminder time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <div className="pulse-ui__repeat-choice"><label><input type="checkbox" checked={repeat} aria-expanded={repeat} aria-controls="pulse-recurrence-panel" onChange={(event) => { setRepeat(event.target.checked); if (event.target.checked && !savedSchedule?.end) setEndCount(String(recurrenceDefaults[frequency])); }} /><span><strong>Repeat this reminder</strong><small>{repeat ? "Set a finite schedule and ending." : "Off: Pulse runs once, then moves it to Finished."}</small></span></label></div>
      {repeat && <fieldset id="pulse-recurrence-panel" className="pulse-ui__recurrence"><legend>Repeat schedule</legend>
        <div className="pulse-ui__form-grid"><label className="pulse-ui__field">Repeats<select aria-label="Repeat frequency" value={frequency} onChange={(event) => { const next = event.target.value as Frequency; setFrequency(next); setEndCount(String(recurrenceDefaults[next])); }}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label className="pulse-ui__field">Every<input data-field="interval" aria-label="Repeat interval" type="number" min="1" max={frequency === "daily" ? 365 : frequency === "weekly" ? 52 : frequency === "monthly" ? 60 : 5} value={interval} onChange={(event) => setIntervalValue(event.target.value)} /><small>{frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}</small></label></div>
        {frequency === "daily" && <button className="pulse-ui__button pulse-ui__weekday-preset" type="button" onClick={() => { weekdaysTouchedRef.current = true; setFrequency("weekly"); setIntervalValue("1"); setSelectedDays(["monday", "tuesday", "wednesday", "thursday", "friday"]); setEndCount(String(recurrenceDefaults.weekly)); }}>Use weekdays (Monday–Friday)</button>}
        {frequency === "weekly" && <fieldset className="pulse-ui__weekday-fieldset"><legend>On</legend><div className="pulse-ui__weekdays" data-field="weekdays" tabIndex={-1}>{daysOfWeek.map((day) => <button key={day} type="button" aria-label={titleCase(day)} aria-pressed={selectedDays.includes(day)} onClick={() => { clearValidation(); weekdaysTouchedRef.current = true; setSelectedDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]); }}>{day.slice(0, 1).toUpperCase()}</button>)}</div></fieldset>}
        {frequency === "monthly" && <fieldset className="pulse-ui__end-options"><legend>Monthly rule</legend><label><input type="radio" name="monthly-rule" checked={monthlyRule === "dayOfMonth"} onChange={() => setMonthlyRule("dayOfMonth")} /> {monthlyLabels.dayOfMonth}</label><label><input type="radio" name="monthly-rule" checked={monthlyRule === "nthWeekday"} onChange={() => setMonthlyRule("nthWeekday")} /> {monthlyLabels.nthWeekday}</label><label><input type="radio" name="monthly-rule" checked={monthlyRule === "lastDay"} onChange={() => setMonthlyRule("lastDay")} /> {monthlyLabels.lastDay}</label></fieldset>}
        <fieldset className="pulse-ui__end-options"><legend>Ends</legend><label><input type="radio" name="series-end" checked={endType === "count"} onChange={() => setEndType("count")} /> After <input data-field="end-count" aria-label="Number of reminders" type="number" min="1" max="365" disabled={endType !== "count"} value={endCount} onChange={(event) => setEndCount(event.target.value)} /> reminders</label><div className="pulse-ui__end-date-option"><label><input type="radio" name="series-end" checked={endType === "date"} onChange={selectDateEnding} /> On a date</label><PulseDatePicker compact label="Series end date" ariaLabel="Series end date" dataField="end-date" value={endDate} min={date} max={dateYearsAfter(date, 5)} disabled={endType !== "date"} onChange={setEndDate} /></div><small>Repeating reminders cannot run forever. The preview calculates the actual total and enforces 365 reminders or five years, whichever comes first.</small></fieldset>
        <RecurrencePreview build={buildDefinition} />
      </fieldset>}
      <div className="pulse-ui__timing-grid pulse-ui__timing-grid--single">
        <TimingControl title="Snooze and no action" description="Used after Snooze, or when you do nothing for two minutes." ariaLabel="Unanswered snooze minutes" dataField="snooze" value={snooze} onChange={setSnooze} />
      </div>
      <label className="pulse-ui__field">Time zone<input data-field="timezone" aria-label="Reminder time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><small>Use an IANA time zone, such as America/Los_Angeles. Pulse handles daylight-saving changes.</small></label>
      {formError && <p className="pulse-ui__notice" role="alert">{formError}</p>}
      <div className="pulse-ui__form-actions"><div>{pulse && <button className="pulse-ui__button pulse-ui__button--danger" data-action="delete-reminder" type="button" disabled={saving} onClick={() => onDelete(pulse)}>Delete reminder</button>}</div><div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={saving} aria-busy={saving || undefined}>{saving ? "Saving…" : pulse ? "Save changes" : "Create reminder"}</button></div></div>
    </form>
    {pending && <ConfirmDialog eyebrow="Schedule change" title="Update the whole reminder schedule?" description={<p>{openScheduleConsequence(pending, activeOccurrence)} Saved history stays intact.</p>} confirmLabel="Update schedule" busyLabel="Updating…" cancelLabel="Keep editing" busy={saving} onCancel={() => setPending(null)} onConfirm={() => { void confirmPendingSchedule(); }} />}
  </section>;
}

function RecurrencePreview({ build }: { build: () => PulseDefinition }): React.ReactElement {
  const [value, setValue] = useState<{ definition: PulseDefinition; preview: ReturnType<typeof recurrencePreview> } | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const definition = build(); setValue({ definition, preview: recurrencePreview(definition as Record<string, unknown>) }); }
      catch { setValue(null); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [build]);
  if (!value) return <div className="pulse-ui__recurrence-preview"><span>Schedule preview</span><small>Complete the fields above to see the bounded schedule.</small></div>;
  const { definition, preview } = value;
  return <div className="pulse-ui__recurrence-preview" aria-live="polite"><span>Schedule</span><strong>{recurrenceSummary(definition as Record<string, unknown>)}</strong><small>{preview.total} reminder{preview.total === 1 ? "" : "s"} · {localDateLabel(preview.first)}–{localDateLabel(preview.last)}</small><div className="pulse-ui__preview-dates"><span>Next</span>{preview.dates.map((dateValue) => <time key={dateValue} dateTime={dateValue}>{localDateLabel(dateValue, false)}</time>)}</div><small>Assumes each reminder is completed before the next scheduled time. Missed cadence never creates a backlog.</small></div>;
}

function localDateLabel(value: string, includeYear = true): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function openScheduleConsequence(next: PulseDefinition, occurrence?: PulseOccurrence): string {
  const cadence = next.schedule?.type === "once" ? "one-time schedule" : `${next.schedule?.type ?? "new"} schedule`;
  if (occurrence?.state === "due" || occurrence?.snoozeCount) return `The current reminder stays active until you mark it Done. The ${cadence} begins afterward.`;
  if (occurrence?.state === "scheduled") return `The next untouched reminder moves to the ${cadence}.`;
  return `The ${cadence} becomes the active schedule.`;
}

function TimingControl({ title, description, ariaLabel, dataField, value, onChange }: { title: string; description: string; ariaLabel: string; dataField?: string; value: string; onChange: (value: string) => void }): React.ReactElement {
  const presets = [{ value: "30", label: "30 min" }, { value: "60", label: "1 hour" }, { value: "240", label: "4 hours" }, { value: "1440", label: "1 day" }];
  return <div className="pulse-ui__timing"><h3>{title}</h3><p>{description}</p><div className="pulse-ui__presets" aria-label={`${title} presets`}>{presets.map((preset) => <button key={preset.value} className="pulse-ui__preset" aria-pressed={value === preset.value} type="button" onClick={() => onChange(preset.value)}>{preset.label}</button>)}</div><label className="pulse-ui__field">Custom minutes<input {...(dataField ? { "data-field": dataField } : {})} aria-label={ariaLabel} type="number" min="1" max="10080" value={value} onChange={(event) => onChange(event.target.value)} /></label></div>;
}

function HistoryPage({ snapshot, loading }: { snapshot: PulseSnapshot; loading: boolean }): React.ReactElement {
  const completed = snapshot.state.occurrences.filter((item) => item.state === "done").sort((a, b) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt));
  return <section className="pulse-ui__page" aria-labelledby="pulse-history-heading"><header className="pulse-ui__page-head"><div><p className="pulse-ui__eyebrow">Activity</p><h2 id="pulse-history-heading">Completion history</h2><p className="pulse-ui__lede">A quiet record of what you finished and how many nudges it took.</p></div></header><div className="pulse-ui__panel">{loading ? <p className="pulse-ui__muted">Loading history…</p> : completed.length === 0 ? <div className="pulse-ui__empty"><h3>No completed reminders yet</h3><p className="pulse-ui__muted">Completed occurrences will appear here.</p></div> : completed.map((occurrence) => {
    const pulse = snapshot.pulses.find((item) => item.id === occurrence.pulseId);
    const snoozes = occurrence.snoozeCount ?? snapshot.state.events.filter((event) => event.occurrenceId === occurrence.id && event.type === "occurrence_snoozed").length;
    return <div className="pulse-ui__history-row" key={occurrence.id}><span className="pulse-ui__history-icon"><PulseIcon kind="check" /></span><div><strong>{pulse?.title ?? occurrence.titleSnapshot ?? occurrence.pulseId}</strong><div className="pulse-ui__history-meta">{snoozes ? `Completed after ${snoozes} snooze${snoozes === 1 ? "" : "s"}` : "Completed on the first notification"}</div></div><time className="pulse-ui__history-meta" dateTime={occurrence.completedAt ?? occurrence.dueAt}>{formatDate(occurrence.completedAt ?? occurrence.dueAt, false)}</time></div>;
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
  const [actionName, setActionName] = useState<string | null>(null);
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
    setActionName("create-invitation");
    setActionStatus("");
    try {
      const response = await request({ method: "POST", path: "/api/setup/clients", body: { installationId: installationId.trim() } });
      if (response.status !== 201) { setActionStatus("Pulse could not create an invitation. Check the installation id and try again."); return; }
      const body = response.body as { code?: string; expiresAt?: string };
      if (!body.code || !body.expiresAt) { setActionStatus("The runner returned an invalid invitation."); return; }
    setInvitation({ code: body.code, expiresAt: body.expiresAt });
      setActionStatus("Invitation created. It expires in ten minutes and works once.");
    } catch { setActionStatus("Pulse could not reach the runner to create an invitation."); }
    finally { actionBusyRef.current = false; setActionBusy(false); setActionName(null); }
  };
  const revokeClient = async (clientId: string) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionName(`revoke:${clientId}`);
    try {
      const response = await request({ method: "DELETE", path: `/api/setup/clients/${encodeURIComponent(clientId)}` });
      if (response.status < 200 || response.status >= 300) throw new Error("rejected");
      setActionStatus("Mac access revoked.");
      await refreshClients();
    } catch { setActionStatus("Pulse could not revoke that Mac. Try again from a connected managed installation."); }
    finally { actionBusyRef.current = false; setActionBusy(false); setActionName(null); }
  };
  const sendTest = async () => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionName("send-test");
    setActionStatus("");
    try {
      const response = await request({ method: "POST", path: "/api/setup/test-notification", body: { idempotencyKey: `settings-${Date.now().toString(36)}` } });
      setActionStatus(response.status >= 200 && response.status < 300 ? "Test sent. Check your Android notifications." : "The runner could not send a test notification.");
    } catch { setActionStatus("Pulse could not reach the runner to send a test notification."); }
    finally { actionBusyRef.current = false; setActionBusy(false); setActionName(null); }
  };
  const copyInvitation = async () => {
    if (!invitation || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionName("copy-invitation");
    setActionStatus("");
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(invitation.code);
      setActionStatus("Invitation code copied.");
    } catch {
      setActionStatus("Pulse could not copy the invitation code.");
    } finally { actionBusyRef.current = false; setActionBusy(false); setActionName(null); }
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
      actionBusyRef.current = true; setActionBusy(true); setActionName("disconnect"); setActionStatus("");
      void onDisconnect().catch(() => { setActionStatus("Pulse could not finish disconnecting. This Mac may already be revoked; reopen Pulse before retrying."); setConfirmingDisconnect(false); }).finally(() => { actionBusyRef.current = false; setActionBusy(false); setActionName(null); });
    }} aria-busy={actionName === "disconnect" || undefined}>{actionName === "disconnect" ? "Disconnecting…" : "Disconnect this Mac"}</button></div></div>}</div><div className="pulse-ui__setting-actions"><span className="pulse-ui__badge">Secure</span>{onDisconnect && !confirmingDisconnect && <button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => setConfirmingDisconnect(true)}>Disconnect this Mac</button>}</div></div>}
    <div className="pulse-ui__setting"><div><h3>Android push through ntfy</h3><p>The notification credential is stored by your runner. Workshop stores only this Mac’s runner credential in Keychain; Pulse never receives either secret.</p></div><div className="pulse-ui__setting-actions"><button className="pulse-ui__button" type="button" disabled={actionBusy} aria-busy={actionName === "send-test" || undefined} onClick={() => void sendTest()}>{actionName === "send-test" ? "Sending…" : "Send test"}</button>{onRepairDelivery && <button className="pulse-ui__button" type="button" disabled={actionBusy} aria-busy={actionName === "repair-access" || undefined} onClick={() => {
      if (actionBusyRef.current) return;
      actionBusyRef.current = true; setActionBusy(true); setActionName("repair-access"); setActionStatus("");
      void onRepairDelivery().then(() => setActionStatus("Your runner opened a fresh secure ntfy-access page.")).catch(() => setActionStatus("Pulse could not open the secure repair page.")).finally(() => { actionBusyRef.current = false; setActionBusy(false); setActionName(null); });
    }}>{actionName === "repair-access" ? "Opening…" : "Repair access"}</button>}</div></div>
    <div className="pulse-ui__setting pulse-ui__setting--folder"><div className="pulse-ui__setting-main"><h3>Add another Mac</h3><p>On the other Mac, choose Connect an existing Pulse and copy its installation id here. The invitation is bound to that Mac, expires in ten minutes, and works once.</p>{addingMac && <form className="pulse-ui__folder-editor" onSubmit={(event) => { event.preventDefault(); void createInvitation(); }}><label className="pulse-ui__field">Other Mac installation id<input aria-label="Other Mac installation id" disabled={actionBusy} value={installationId} onChange={(event) => setInstallationId(event.target.value)} required /></label>{invitation && <div className="pulse-ui__invitation"><strong>Ten-minute invitation</strong><code>{invitation.code}</code><small>Expires {formatDate(invitation.expiresAt)}</small><button className="pulse-ui__text-button" type="button" disabled={actionBusy} aria-busy={actionName === "copy-invitation" || undefined} onClick={() => void copyInvitation()}><PulseIcon kind="copy" /> {actionName === "copy-invitation" ? "Copying…" : "Copy invitation code"}</button></div>}<div className="pulse-ui__form-actions-group"><button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => { setAddingMac(false); setInvitation(undefined); }}>Close</button><button className="pulse-ui__button pulse-ui__button--primary" type="submit" disabled={actionBusy || !installationId.trim()} aria-busy={actionName === "create-invitation" || undefined}>{actionName === "create-invitation" ? "Creating…" : "Create invitation"}</button></div></form>}</div>{!addingMac && <button className="pulse-ui__button" type="button" disabled={actionBusy} onClick={() => setAddingMac(true)}>Add a Mac</button>}</div>
    {clients.length > 0 && <div className="pulse-ui__setting pulse-ui__setting--clients"><div className="pulse-ui__setting-main"><h3>Connected Macs</h3><p>Each installation has separate access. Revoking one does not break the others.</p><div className="pulse-ui__client-list">{clients.map((client) => <div key={client.id}><div><strong>{client.id === currentClientId ? "This Mac" : client.installationId}</strong><small>{client.revokedAt ? `Revoked ${formatDate(client.revokedAt)}` : `Connected ${formatDate(client.createdAt)}`}</small></div>{!client.revokedAt && client.id !== currentClientId && <button className="pulse-ui__button pulse-ui__button--danger" type="button" disabled={actionBusy} aria-busy={actionName === `revoke:${client.id}` || undefined} onClick={() => void revokeClient(client.id)}>{actionName === `revoke:${client.id}` ? "Revoking…" : "Revoke"}</button>}</div>)}</div></div></div>}
  </div>{actionStatus && <p className="pulse-ui__notice" role="status">{actionStatus}</p>}</section>;
}

function DeleteDialog({ pulse, busy, error, onCancel, onConfirm }: { pulse: PulseDefinition; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void }): React.ReactElement {
  return <ConfirmDialog eyebrow="Permanent action" title={`Delete “${pulse.title}”?`} description={<p>This removes the reminder from the cloud runner. Its past completion history may remain in runner state.</p>} confirmLabel="Delete reminder" busyLabel="Deleting…" cancelLabel="Keep reminder" busy={busy} error={error} onCancel={onCancel} onConfirm={onConfirm} />;
}
