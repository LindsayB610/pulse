import React, { useEffect, useState } from "react";
import { pulseDefinitionFromForm } from "./definition.js";
import { createPulseService } from "./service.js";
import type { SecureServiceRequester } from "./service.js";
import { createWorkshopSecureServiceRequester } from "./workshop-host.js";
export { createPulseService, type SecureServiceRequest, type SecureServiceRequester, type SecureServiceResponse } from "./service.js";
export { pulseDefinitionFromForm, type PulseDefinitionInput } from "./definition.js";
export { parsePulsePrivateConfig, type PulsePrivateConfig } from "./config.js";
export { createWorkshopSecureServiceRequester, pulseConfigFile, type HostInvoke } from "./workshop-host.js";

export const workshopPluginDeclaration = {
  contractVersion: 1,
  id: "pulse",
  displayName: "Pulse",
  description: "Persistent recurring reminders with Android Done and Snooze actions.",
  docsPath: "/docs/tools/pulse.md",
  workspaceRequirement: "Choose a private Pulse folder containing pulse.config.json.",
  uninstallSafetyCopy: "Removing Pulse from Workshop never removes private reminders or runner state.",
  routes: [
    { id: "reminders", label: "Reminders", path: "/pulse/reminders" },
    { id: "history", label: "History", path: "/pulse/history" },
    { id: "settings", label: "Settings", path: "/pulse/settings" },
  ],
  navigationMode: "plugin",
  requiredLocalCapabilities: ["local-workspace", "read_secure_service_metadata", "request_configured_secure_service"],
  dataRoots: [], importActions: [], exportActions: [], status: "ready",
  runtime: { kind: "generic-secure-service", entryPoint: "request_configured_secure_service" },
  privateWorkspace: { kind: "plugin-config", requiredFields: ["pulse.config.json"] },
} as const;

export function WorkshopToolView({ activeRouteId = "reminders", workspaceRoot, requestWorkspaceRoot }: {
  activeRouteId?: string; workspaceRoot?: string; requestWorkspaceRoot: (root?: string) => void;
}): React.ReactElement {
  const [root, setRoot] = useState(workspaceRoot ?? "");
  const [request, setRequest] = useState<SecureServiceRequester | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("Choose the private Pulse folder to connect your reminders.");
  useEffect(() => {
    setRoot(workspaceRoot ?? "");
    setRequest(null);
    if (!workspaceRoot) return;
    setConnectionStatus("Connecting Pulse…");
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => createWorkshopSecureServiceRequester(workspaceRoot, invoke))
      .then((requester) => {
        setRequest(() => requester);
        setConnectionStatus("Pulse connected.");
      })
      .catch(() => setConnectionStatus("Pulse could not connect to its private service."));
  }, [workspaceRoot]);
  return <section aria-label="Pulse"><h2>Pulse</h2><p>Persistent reminders are acknowledged from Android with Done or Snooze.</p>
    <section aria-label="Pulse connection"><label>Private Pulse folder<input aria-label="Pulse private folder" value={root} onChange={(event) => setRoot(event.target.value)} /></label><button onClick={() => requestWorkspaceRoot(root || undefined)}>Connect Pulse</button></section>
    <p role="status">{connectionStatus}</p>{request ? <PulseManagementView request={request} /> : <p>Connect a private Pulse folder to view or create reminders.</p>}
  </section>;
}

/** Full Pulse-owned management surface. A host integration supplies only the
 * generic constrained requester after it implements the capability proposal. */
export function PulseManagementView({ request }: { request: SecureServiceRequester }): React.ReactElement {
  const service = createPulseService(request);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [pulses, setPulses] = useState<Array<{ id: string; title: string; active: boolean }>>([]);
  const refresh = async () => { try { const response = await service.snapshot(); setPulses(Array.isArray(response.body.pulses) ? response.body.pulses as Array<{ id: string; title: string; active: boolean }> : []); setStatus("Reminders refreshed."); } catch { setStatus("Pulse could not refresh reminders."); } };
  useEffect(() => { void refresh(); }, [request]);
  const create = async () => {
    try { await service.create(pulseDefinitionFromForm({ title, day: "sunday", time: "09:00", repeat: "60", timezone: "America/Los_Angeles" })); setTitle(""); setStatus("Reminder saved."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Pulse could not save the reminder."); }
  };
  const toggle = async (pulse: { id: string; title: string; active: boolean }) => { try { await service.update(pulse.id, { ...pulse, active: !pulse.active }); await refresh(); } catch { setStatus("Pulse could not update the reminder."); } };
  const remove = async (pulse: { id: string }) => { try { await service.remove(pulse.id); await refresh(); } catch { setStatus("Pulse could not delete the reminder."); } };
  return <section aria-label="Pulse reminders"><h2>Pulse reminders</h2><label>Name<input aria-label="Reminder name" value={title} onChange={(event) => setTitle(event.target.value)} /></label><button onClick={() => void create()}>Create reminder</button><button onClick={() => void refresh()}>Refresh</button><ul>{pulses.map((pulse) => <li key={pulse.id}>{pulse.title}<button onClick={() => void toggle(pulse)}> {pulse.active ? "Pause" : "Resume"}</button><button onClick={() => void remove(pulse)}>Delete</button></li>)}</ul><p role="status">{status}</p></section>;
}
