import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog.js";
import { PulseIcon, type PulseIconKind } from "./icons.js";
import type { SecureServiceRequester } from "./service.js";
import { setupBack, setupForward, setupProgress, setupStateFromNative, type SetupState } from "./setup-machine.js";
import {
  beginPulseManagedSetup,
  cancelPulseManagedSetup,
  completePulseManagedSetup,
  completePulseExistingSetup,
  createManagedWorkshopSecureServiceRequester,
  openPulseNotificationCredentialHandoff,
  openPulseSetupUrl,
  updatePulseManagedSetup,
  type HostInvoke,
  type ManagedSetupView,
} from "./workshop-host.js";

type SetupWizardProps = {
  invoke: HostInvoke;
  restored?: ManagedSetupView;
  initialState?: SetupState;
  onConnected: (requester: SecureServiceRequester) => void;
  onManualSetup: () => void;
};

const ntfyAccountUrl = "https://ntfy.sh/account";
const ntfyAppUrl = "https://play.google.com/store/apps/details?id=io.heckel.ntfy";

function netlifyHandoff(pending: ManagedSetupView): string {
  const url = new URL("https://app.netlify.com/start/deploy");
  url.searchParams.set("repository", "https://github.com/LindsayB610/pulse");
  url.hash = new URLSearchParams({
    PULSE_SETUP_PUBLIC_KEY: pending.publicKey,
    PULSE_NTFY_TOPIC: pending.suggestedTopic,
    PULSE_NTFY_SERVER: "https://ntfy.sh",
    PULSE_SETUP_RETURN_URL: `workshop://secure-service/return/${pending.setupId}`,
  }).toString();
  return url.toString();
}

function normalizeRunnerOrigin(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error("Enter the HTTPS site address shown by your runner provider, without a path.");
  }
  return url.origin;
}

export function PulseSetupWizard({ invoke, restored, initialState, onConnected, onManualSetup }: SetupWizardProps): React.ReactElement {
  const [pending, setPending] = useState<ManagedSetupView | undefined>(restored);
  const [state, setState] = useState<SetupState>(() => initialState ?? setupStateFromNative(restored?.state ?? "welcome"));
  const [runnerOrigin, setRunnerOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [completedHandoffs, setCompletedHandoffs] = useState<Partial<Record<SetupState, boolean>>>({});
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const progress = setupProgress(state);
  const topic = pending?.suggestedTopic ?? "Created after you start";
  const postPair = state === "delivery-secret" || state === "delivery-test" || state === "complete";
  const backTarget = state === "delivery-secret" ? null : state === "delivery-test" ? "delivery-secret" : state === "complete" ? "delivery-test" : setupBack(state);
  const branchPreparing = (state === "existing" || state === "migration") && !pending;
  const canGoBack = backTarget !== null && !branchPreparing;
  const canStartOver = state !== "welcome" && !postPair && !branchPreparing;

  useEffect(() => {
    if ((state !== "migration" && state !== "existing") || pending) return;
    let cancelled = false;
    void beginPulseManagedSetup(invoke)
      .then((record) => {
        if (!cancelled) setPending(record);
        return updatePulseManagedSetup(invoke, record.setupId, state);
      })
      .then((record) => { if (!cancelled) setPending(record); })
      .catch((caught) => { if (!cancelled) setError(message(caught, state === "migration" ? "Workshop could not prepare the migration." : "Workshop could not prepare this Mac for an invitation.")); });
    return () => { cancelled = true; };
  }, [invoke, pending, state]);

  const persistState = async (next: SetupState): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setError("");
    setStatus("");
    if (!pending) {
      setState(next);
      busyRef.current = false;
      return true;
    }
    setBusy(true);
    try {
      const updated = await updatePulseManagedSetup(invoke, pending.setupId, next);
      setPending(updated);
      setState(next);
      return true;
    } catch (caught) {
      setError(message(caught, "Workshop could not save this setup step. Nothing changed; try again."));
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  };

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      const created = await beginPulseManagedSetup(invoke);
      setPending(created);
      await persistStateWith(created, "phone-user");
    } catch (caught) {
      setError(message(caught, "Workshop could not start secure setup."));
    } finally { busyRef.current = false; setBusy(false); }
  };

  const persistStateWith = async (record: ManagedSetupView, next: SetupState) => {
    const updated = await updatePulseManagedSetup(invoke, record.setupId, next);
    setPending(updated);
    setState(next);
  };

  const next = async () => {
    const target = setupForward(state);
    if (target) await persistState(target);
  };

  const back = async () => {
    if (!backTarget) return;
    if ((state === "existing" || state === "migration") && pending) {
      setError("");
      setConfirmingStartOver(true);
      return;
    }
    await persistState(backTarget);
  };

  const pair = async () => {
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      const endpoint = normalizeRunnerOrigin(runnerOrigin);
      await completePulseManagedSetup(invoke, pending.setupId, endpoint);
      setPending(undefined);
      setState("delivery-secret");
      setStatus("Runner connected. Your credential is in Keychain.");
    } catch (caught) {
      setError(message(caught, "Workshop could not verify and connect this runner."));
    } finally { busyRef.current = false; setBusy(false); }
  };

  const migrate = async () => {
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      const endpoint = normalizeRunnerOrigin(runnerOrigin);
      await completePulseManagedSetup(invoke, pending.setupId, endpoint);
      onConnected(await createManagedWorkshopSecureServiceRequester(invoke));
    } catch (caught) {
      const detail = message(caught, "");
      setError(detail
        ? `Workshop stopped during runner verification: ${detail} Your previous connection is unchanged.`
        : "Workshop could not verify the updated runner. Your previous connection is unchanged.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const openSecretPage = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      await openPulseNotificationCredentialHandoff(invoke);
      setStatus("Your runner opened in the browser. Paste the ntfy token there, save it, then return here.");
      return true;
    } catch (caught) {
      setError(message(caught, "Pulse could not open the runner-owned secure page."));
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  };

  const sendTest = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      const requester = await createManagedWorkshopSecureServiceRequester(invoke);
      const response = await requester({
        method: "POST",
        path: "/api/setup/test-notification",
        body: { idempotencyKey: `setup-${Date.now().toString(36)}` },
      });
      if (response.status < 200 || response.status >= 300) throw new Error("The runner did not accept the test notification.");
      setStatus("Test sent. Check your Android notifications for “Pulse setup test.”");
    } catch (caught) {
      setError(message(caught, "The runner is connected, but the test notification did not send."));
    } finally { busyRef.current = false; setBusy(false); }
  };

  const finish = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      onConnected(await createManagedWorkshopSecureServiceRequester(invoke));
    } catch (caught) {
      setError(message(caught, "Pulse could not open your connected reminders."));
    } finally { busyRef.current = false; setBusy(false); }
  };

  const startOver = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      if (pending) await cancelPulseManagedSetup(invoke, pending.setupId);
      setPending(undefined); setState("welcome"); setRunnerOrigin(""); setStatus(""); setCompletedHandoffs({});
      return true;
    } catch (caught) {
      setError(message(caught, "Workshop could not safely clear this setup. Your progress is still here."));
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  };

  const openExternal = async (url: string, fallback: string, success?: string, onOpened?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await openPulseSetupUrl(invoke, url);
      onOpened?.();
      if (success) setStatus(success);
    }
    catch (caught) { setError(message(caught, fallback)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const copyText = async (value: string, label: string, onCopied?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      onCopied?.();
      setStatus(`${label} copied.`);
    } catch (caught) { setError(message(caught, `Pulse could not copy the ${label.toLowerCase()}.`)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const markHandoffComplete = (step: SetupState) => {
    setCompletedHandoffs((current) => ({ ...current, [step]: true }));
  };

  const content = useMemo(() => setupContent(state, topic), [state, topic]);
  return <section className="pulse-ui__setup" aria-labelledby="pulse-setup-title">
    <header className="pulse-ui__setup-top">
      <div className="pulse-ui__setup-brand"><span className="pulse-ui__setup-mark" aria-hidden="true">P</span><span>Pulse setup</span></div>
      {canStartOver && <button className="pulse-ui__text-button" type="button" disabled={busy} onClick={() => { setError(""); setConfirmingStartOver(true); }}>Start over</button>}
    </header>
    {state !== "welcome" && <div className="pulse-ui__setup-progress" aria-label={`Setup progress: ${progress.current} of ${progress.total}`}>
      <div><span>{progress.label}</span><strong>{progress.current} of {progress.total}</strong></div>
      <div className="pulse-ui__setup-track"><span style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div>
    </div>}
    <main className="pulse-ui__setup-main">
      {canGoBack && <button className="pulse-ui__back" type="button" disabled={busy} onClick={() => void back()}><PulseIcon kind="arrow-left" /> Back</button>}
      <p className="pulse-ui__eyebrow">{content.eyebrow}</p>
      <h2 id="pulse-setup-title">{content.title}</h2>
      <p className="pulse-ui__setup-lede">{content.lede}</p>
      {content.body}
      {state === "welcome" && <div className="pulse-ui__setup-actions">
        <button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="button" disabled={busy} onClick={() => void start()}>Set up Pulse</button>
        <button className="pulse-ui__button" type="button" onClick={() => setState("existing")}>Connect an existing Pulse</button>
        <button className="pulse-ui__text-button" type="button" onClick={() => setState("advanced")}>Advanced setup</button>
      </div>}
      {state === "phone-user" && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Open ntfy account" actionAgain="Open ntfy account again" confirmation="My ntfy user is saved" already="My ntfy user is already saved" actionIcon="external" onAction={() => void openExternal(ntfyAccountUrl, "Pulse could not open the ntfy account page.", "ntfy opened. Save your Pulse user there, then return to Workshop.", () => markHandoffComplete(state))} onConfirm={() => void next()} />}
      {state === "phone-topic" && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Copy topic" actionAgain="Copy topic again" confirmation="My topic is reserved" already="My topic is already reserved" actionIcon="copy" onAction={() => void copyText(topic, "Topic", () => markHandoffComplete(state))} onConfirm={() => void next()} />}
      {state === "phone-subscription" && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Open ntfy for Android" actionAgain="Open ntfy for Android again" confirmation="Pulse appears in my topics" already="Pulse is already in my topics" actionIcon="external" onAction={() => void openExternal(ntfyAppUrl, "Pulse could not open the ntfy Android page.", "ntfy for Android opened. Subscribe to the Pulse topic, then return to Workshop.", () => markHandoffComplete(state))} onConfirm={() => void next()} />}
      {state === "phone-token" && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Open ntfy account" actionAgain="Open ntfy account again" confirmation="I created the runner token" already="I already created the runner token" actionIcon="external" onAction={() => void openExternal(ntfyAccountUrl, "Pulse could not open the ntfy account page.", "ntfy opened. Create the Pulse runner token there, then return to Workshop.", () => markHandoffComplete(state))} onConfirm={() => void next()} />}
      {state === "runner-choice" && <div className="pulse-ui__choice-grid">
        <button className="pulse-ui__choice" type="button" disabled={busy} onClick={() => void persistState("runner-deploy")}><strong>Quick setup with Netlify</strong><span>Guided · about 3 minutes</span><p>Deploy Pulse into your own Netlify account. Netlify owns any quota or billing.</p></button>
        <button className="pulse-ui__choice" type="button" disabled={busy} onClick={() => void persistState("runner-pair")}><strong>Connect another compatible runner</strong><span>Advanced</span><p>Use an existing HTTPS deployment that implements the Pulse runner protocol.</p></button>
      </div>}
      {state === "runner-deploy" && pending && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Open Netlify deployment" actionAgain="Open Netlify again" confirmation="I finished the deployment" already="I already finished the deployment" actionIcon="external" onAction={() => void openExternal(netlifyHandoff(pending), "Pulse could not open the Netlify deployment page.", "Netlify opened. Finish the deployment there, then return to Workshop.", () => markHandoffComplete(state))} onConfirm={() => void next()} />}
      {state === "runner-pair" && <form className="pulse-ui__setup-form" onSubmit={(event) => { event.preventDefault(); void pair(); }}>
        <label className="pulse-ui__field">Your Pulse site address<input aria-label="Pulse runner site address" type="url" placeholder="https://your-pulse-site.netlify.app" value={runnerOrigin} onChange={(event) => setRunnerOrigin(event.target.value)} required /><small>Paste the production site address shown by your provider. Workshop verifies the origin and deployment fingerprint before saving anything.</small></label>
        <button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" disabled={busy || !runnerOrigin.trim()} type="submit">Verify and connect this runner</button>
      </form>}
      {state === "delivery-secret" && <HandoffActions busy={busy} completed={completedHandoffs[state] === true} action="Open my secure runner page" actionAgain="Open the secure page again" confirmation="I saved ntfy access" already="I already saved ntfy access" actionIcon="external" onAction={() => void openSecretPage().then((opened) => { if (opened) markHandoffComplete(state); })} onConfirm={() => { setStatus(""); setState("delivery-test"); }} />}
      {state === "delivery-test" && (status.includes("Test sent")
        ? <div className="pulse-ui__setup-actions"><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="button" disabled={busy} onClick={() => { setStatus(""); setState("complete"); }}>I got it</button><button className="pulse-ui__button" type="button" disabled={busy} onClick={() => void sendTest()}>Send one more test</button></div>
        : <div className="pulse-ui__setup-actions"><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="button" disabled={busy} onClick={() => void sendTest()}>Send test notification</button></div>)}
      {state === "complete" && <div className="pulse-ui__setup-actions"><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="button" disabled={busy} onClick={() => void finish()}>Create my first reminder</button></div>}
      {state === "existing" && <ExistingSetup invoke={invoke} pending={pending} onConnected={onConnected} />}
      {state === "migration" && <div className="pulse-ui__existing">
        <div className="pulse-ui__done-when"><SetupGlyph kind="key" /><div><strong>Update the runner, then add its setup verification key</strong><p>First update this deployment to the current Pulse release. If Netlify created a fork for you, sync that fork with the upstream Pulse repository. Then add <code>PULSE_SETUP_PUBLIC_KEY</code> in the provider settings and deploy again. This is the public half of a one-time pairing key; it cannot access your reminders or ntfy.</p><code className="pulse-ui__topic">{pending?.publicKey ?? "Preparing…"}</code>{pending && <button className="pulse-ui__text-button" type="button" onClick={() => void copyText(pending.publicKey, "Setup verification key")}><PulseIcon kind="copy" /> Copy setup verification key</button>}</div></div>
        <div className="pulse-ui__done-when"><SetupGlyph kind="shield" /><div><strong>Your existing data stays put</strong><p>This pairs Workshop to the same runner. It does not replace reminders, history, ntfy access, or your old private-folder connection.</p></div></div>
        <button className="pulse-ui__button pulse-ui__button--icon" type="button" onClick={() => void openExternal("https://app.netlify.com/", "Pulse could not open Netlify.")}><PulseIcon kind="external" /> Open Netlify</button>
        <form className="pulse-ui__setup-form" onSubmit={(event) => { event.preventDefault(); void migrate(); }}>
          <label className="pulse-ui__field">Existing Pulse site address<input aria-label="Existing Pulse site address for migration" type="url" value={runnerOrigin} onChange={(event) => setRunnerOrigin(event.target.value)} placeholder="https://your-pulse-site.netlify.app" required /><small>Wait for the redeploy to finish, then paste the production site origin.</small></label>
          <button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="submit" disabled={busy || !pending || !runnerOrigin.trim()}>Verify and finish migration</button>
        </form>
      </div>}
      {state === "advanced" && <div className="pulse-ui__setup-actions"><button className="pulse-ui__button" type="button" onClick={onManualSetup}>Use a private config folder</button><button className="pulse-ui__text-button" type="button" onClick={() => void openExternal("https://github.com/LindsayB610/pulse/blob/main/docs/deploy-runner.md", "Pulse could not open the runner documentation.")}><PulseIcon kind="external" /> Read the compatible-runner protocol</button></div>}
      {error && <p className="pulse-ui__notice pulse-ui__notice--error" role="alert">{error}</p>}
      {!error && status && <p className="pulse-ui__notice pulse-ui__notice--success" role="status">{status}</p>}
    </main>
    {confirmingStartOver && <ConfirmDialog eyebrow="Clear setup progress" title="Start Pulse setup again?" description={<><p>Workshop will discard this setup’s saved progress and one-time connection keys.</p><p>Your ntfy account, provider account, and any runner deployment already created remain yours. A runner deployed with these one-time keys will no longer pair; you may need to delete or redeploy it in your provider account.</p></>} confirmLabel="Clear setup progress" cancelLabel="Keep this setup" busy={busy} error={error} onCancel={() => { setConfirmingStartOver(false); setError(""); }} onConfirm={() => { void startOver().then((cleared) => { if (cleared) setConfirmingStartOver(false); }); }} />}
  </section>;
}

function HandoffActions({ busy = false, completed, action, actionAgain, confirmation, already, actionIcon, onAction, onConfirm }: {
  busy?: boolean;
  completed: boolean;
  action: string;
  actionAgain: string;
  confirmation: string;
  already: string;
  actionIcon?: PulseIconKind;
  onAction: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const actionLabel = <>{actionIcon && <PulseIcon kind={actionIcon} />}{completed ? actionAgain : action}</>;
  return <div className="pulse-ui__setup-actions">
    {completed
      ? <><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="button" disabled={busy} onClick={onConfirm}>{confirmation}</button><button className="pulse-ui__button pulse-ui__button--icon" type="button" disabled={busy} onClick={onAction}>{actionLabel}</button></>
      : <><button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large pulse-ui__button--icon" type="button" disabled={busy} onClick={onAction}>{actionLabel}</button><button className="pulse-ui__button" type="button" disabled={busy} onClick={onConfirm}>{already}</button></>}
  </div>;
}

function ExistingSetup({ invoke, pending, onConnected }: { invoke: HostInvoke; pending?: ManagedSetupView; onConnected: (requester: SecureServiceRequester) => void }): React.ReactElement {
  const [endpoint, setEndpoint] = useState("");
  const [invitation, setInvitation] = useState("");
  const [status, setStatus] = useState("Creating this Mac’s one-time connection id…");
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (pending) setStatus(""); }, [pending]);
  const copyInstallationId = async () => {
    if (!pending || busy) return;
    setBusy(true); setStatus("");
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(pending.installationId);
      setStatus("Installation id copied.");
    } catch {
      setStatus("Pulse could not copy this installation id.");
    } finally { setBusy(false); }
  };
  const connect = async () => {
    if (!pending) return;
    setBusy(true); setStatus("");
    try {
      await completePulseExistingSetup(invoke, pending.setupId, normalizeRunnerOrigin(endpoint), invitation.trim());
      onConnected(await createManagedWorkshopSecureServiceRequester(invoke));
    } catch (caught) {
      setStatus(message(caught, "The invitation was rejected or expired."));
    } finally { setBusy(false); }
  };
  return <div className="pulse-ui__existing">
    <div className="pulse-ui__done-when"><SetupGlyph kind="laptop" /><div><strong>On this Mac</strong><p>This Mac’s installation id: <code>{pending?.installationId ?? "Preparing…"}</code></p>{pending && <button className="pulse-ui__text-button" type="button" disabled={busy} onClick={() => void copyInstallationId()}><PulseIcon kind="copy" /> Copy installation id</button>}</div></div>
    <div className="pulse-ui__done-when"><SetupGlyph kind="link" /><div><strong>On a connected Mac</strong><p>Open Pulse Settings → Add another Mac. Paste the installation id and copy the ten-minute invitation it creates.</p></div></div>
    <form className="pulse-ui__setup-form" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
      <label className="pulse-ui__field">Existing Pulse site address<input aria-label="Existing Pulse runner site address" type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://your-pulse-site.netlify.app" required /></label>
      <label className="pulse-ui__field">Ten-minute invitation code<input aria-label="Pulse invitation code" value={invitation} onChange={(event) => setInvitation(event.target.value)} required /></label>
      <button className="pulse-ui__button pulse-ui__button--primary pulse-ui__button--large" type="submit" disabled={busy || !pending || !endpoint.trim() || !invitation.trim()}>Connect this Mac</button>
    </form>
    {status && <p className="pulse-ui__notice" role="status">{status}</p>}
  </div>;
}

function setupContent(state: SetupState, topic: string): { eyebrow: string; title: string; lede: string; body?: React.ReactNode } {
  switch (state) {
    case "welcome": return { eyebrow: "Android reminders, even while your Mac sleeps", title: "Set up Pulse without becoming its sysadmin", lede: "You’ll connect the ntfy app on your Android phone, deploy a tiny runner into an account you own, and prove one notification arrives. Pulse itself never buys or shares your hosting.", body: <div className="pulse-ui__promise-grid"><div><strong>About 8 minutes</strong><span>Provider signup time is separate.</span></div><div><strong>No terminal</strong><span>The guided path handles keys and config.</span></div><div><strong>Your accounts</strong><span>You control cost, data, and deletion.</span></div></div> };
    case "phone-user": return { eyebrow: "Phone · account", title: "Sign into ntfy on your Android phone", lede: "The app uses ntfy’s own user settings—not your Google account. In ntfy, open Settings → Manage users → Add users → Add new user, then sign in with the ntfy account you created.", body: <DoneWhen>Under Users, you see your ntfy username and server.</DoneWhen> };
    case "phone-topic": return { eyebrow: "Phone · private topic", title: "Reserve the private topic Pulse generated", lede: "In ntfy on the web, open Settings → Reserved topics → Add reserved topic. Use the exact topic below and choose “Only I can publish and subscribe.”", body: <><code className="pulse-ui__topic">{topic}</code><DoneWhen>The topic appears under Reserved topics with private access.</DoneWhen></> };
    case "phone-subscription": return { eyebrow: "Phone · subscription", title: "Subscribe your phone to the Pulse topic", lede: `In the Android app, add the exact topic “${topic}” on ntfy.sh. Turn on Instant delivery when Android asks.`, body: <DoneWhen>Pulse appears under Subscribed topics and says Instant delivery on.</DoneWhen> };
    case "phone-token": return { eyebrow: "Phone · runner access", title: "Create one token for your runner", lede: "On ntfy.sh, open Account → Access tokens → Create access token. Name it “Pulse runner” and choose a durable expiry. Keep the tab open—you’ll paste the token into your runner later, never into Workshop.", body: <DoneWhen>You can see the new Pulse runner token once. Do not paste it into this screen.</DoneWhen> };
    case "runner-choice": return { eyebrow: "Cloud runner", title: "Choose where your reminders keep running", lede: "The runner checks schedules while your laptop is asleep. The guided option uses Netlify; compatible self-hosted runners remain available." };
    case "runner-deploy": return { eyebrow: "Netlify quick setup", title: "Deploy Pulse into your Netlify account", lede: "Netlify will ask you to sign in, authorize a Git provider, choose a team, and name the site. The template contains only a one-time setup verification key and topic—never your ntfy token.", body: <DoneWhen>Netlify shows “Your site is live” and gives you an https://…netlify.app address.</DoneWhen> };
    case "runner-pair": return { eyebrow: "Secure connection", title: "Connect this Mac to your runner", lede: "Workshop will verify the exact HTTPS origin, service version, and deployment fingerprint. The per-Mac credential goes straight to Keychain and never enters this page." };
    case "delivery-secret": return { eyebrow: "Notification delivery", title: "Give your runner access to ntfy", lede: "Workshop opens a one-use page on the runner you just verified. Paste the ntfy token there. The page removes its one-use capability from the address bar and never echoes the token.", body: <DoneWhen>The runner page says “Saved. Return to Workshop.”</DoneWhen> };
    case "delivery-test": return { eyebrow: "Delivery test", title: "Prove the notification reaches your phone", lede: "Send an isolated setup test. It creates no reminder, occurrence, history item, Done action, or Snooze action. Pulse cannot see Android receipt, so you confirm it here." };
    case "complete": return { eyebrow: "Setup complete", title: "Pulse is ready", lede: "Your runner is online, this Mac has its own revocable credential, and Android delivery is confirmed. Next: create the reminder you actually came here for.", body: <DoneWhen>You can close Workshop now; the runner keeps working in your account.</DoneWhen> };
    case "existing": return { eyebrow: "Existing Pulse", title: "Connect this Mac to a runner you already own", lede: "Each Mac gets its own revocable credential. You’ll create a ten-minute invitation from a Mac that is already connected." };
    case "migration": return { eyebrow: "Safe migration", title: "Move this Mac to Workshop-managed access", lede: "Keep the same runner and all of its data. You’ll update its code, add one setup verification key, and redeploy before Workshop replaces only this Mac’s connection." };
    case "advanced": return { eyebrow: "Advanced setup", title: "Bring any compatible runner", lede: "Use this path for self-hosting, another provider, or the previous private-folder configuration. A compatible runner needs HTTPS, persistent state, scheduling, the Pulse manifest/pairing protocol, export, and deletion controls." };
  }
}

function DoneWhen({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="pulse-ui__done-when"><span><PulseIcon kind="check" /></span><div><strong>You’re done when</strong><p>{children}</p></div></div>;
}

function SetupGlyph({ kind }: { kind: "laptop" | "link" | "key" | "shield" }): React.ReactElement {
  return <span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{kind === "laptop" ? <><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/></> : kind === "link" ? <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></> : kind === "key" ? <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2"/></> : <><path d="M12 3 5 6v5c0 4.6 2.8 7.7 7 10 4.2-2.3 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>}</svg></span>;
}

function message(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export { netlifyHandoff, normalizeRunnerOrigin };
