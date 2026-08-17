(() => {
  const root = document.querySelector("#setup-root");
  const overlay = document.querySelector("#setup-overlay");
  const live = document.querySelector("#setup-live");
  const frame = document.querySelector(".pulse-setup__frame");
  let lastDialogTrigger = null;
  let restartRouteBase = "journey";
  let restartHasRunner = false;
  let toastTimer = null;
  let transitionTimer = null;
  let transitionExpectedHash = null;
  let cooldownTimer = null;
  let transientNotice = "";
  const SETUP_STORAGE_KEY = "pulse.setup.prototype";
  const DEFAULT_RUNNER_ADDRESS = "https://pulse-sparrow-demo.example";
  const TEST_RESEND_COOLDOWN_MS = 30_000;
  const PREVIEW_MODE = new URLSearchParams(window.location.search).has("audit") ||
    new URLSearchParams(window.location.search).has("evidence");
  const SAFE_RESUME_ROUTES = new Set([
    "welcome",
    "phone",
    "phone-reserve",
    "phone-subscribe",
    "phone-token",
    "runner",
    "pairing",
    "existing",
    "delivery",
    "test",
    "test-sent",
    "complete",
    "state/resume",
    "state/phone-permission",
    "state/phone-account",
    "state/phone-subscription",
    "state/ntfy-verification",
    "state/private-topic",
    "state/adapter-unavailable",
    "state/provider-authorization",
    "state/team-permission",
    "state/invalid-url",
    "state/incompatible-runner",
    "state/fingerprint-mismatch",
    "state/proof-failed",
    "state/secure-storage-failed",
    "state/runner-starting",
    "state/test-rejected",
    "state/test-not-received",
    "state/existing-installation",
    "state/stale-setup",
    "state/migrated-setup",
    "state/advanced",
  ]);
  const ROUTE_STAGE_INDEX = new Map([
    ["welcome", 0],
    ["phone", 1],
    ["phone-reserve", 1],
    ["phone-subscribe", 1],
    ["phone-token", 1],
    ["runner", 2],
    ["pairing", 3],
    ["existing", 3],
    ["delivery", 4],
    ["test", 5],
    ["test-sent", 5],
    ["complete", 6],
    ["state/resume", 3],
    ["state/phone-permission", 5],
    ["state/phone-account", 1],
    ["state/phone-subscription", 1],
    ["state/ntfy-verification", 1],
    ["state/private-topic", 1],
    ["state/adapter-unavailable", 2],
    ["state/provider-authorization", 2],
    ["state/team-permission", 2],
    ["state/invalid-url", 3],
    ["state/incompatible-runner", 3],
    ["state/fingerprint-mismatch", 3],
    ["state/proof-failed", 3],
    ["state/secure-storage-failed", 3],
    ["state/runner-starting", 3],
    ["state/test-rejected", 5],
    ["state/test-not-received", 5],
    ["state/existing-installation", 0],
    ["state/stale-setup", 3],
    ["state/migrated-setup", 3],
    ["state/advanced", 0],
  ]);

  function routeForCheckpoint(index) {
    return ["welcome", "phone", "runner", "pairing", "delivery", "test", "complete"][index] || "welcome";
  }

  function readSetupState() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SETUP_STORAGE_KEY) || "null");
      if (!value || typeof value !== "object") return {};
      const requestedRoute =
        typeof value.lastRoute === "string" && SAFE_RESUME_ROUTES.has(value.lastRoute)
          ? value.lastRoute
          : "welcome";
      const runnerVerified = value.runnerVerified === true;
      const runnerMayExist = value.runnerMayExist === true || runnerVerified;
      const deliveryReady = runnerVerified && value.deliveryReady === true;
      const deliveryConfirmed = deliveryReady && value.deliveryConfirmed === true;
      let furthestIndex =
        requestedRoute === "welcome" || !Number.isInteger(value.furthestIndex)
          ? 0
          : Math.min(6, Math.max(0, value.furthestIndex));
      if (!runnerMayExist) furthestIndex = Math.min(furthestIndex, 2);
      if (!runnerVerified) furthestIndex = Math.min(furthestIndex, 3);
      if (!deliveryReady) furthestIndex = Math.min(furthestIndex, 4);
      if (!deliveryConfirmed) furthestIndex = Math.min(furthestIndex, 5);
      if (deliveryConfirmed) furthestIndex = 6;
      const requestedIndex = ROUTE_STAGE_INDEX.get(requestedRoute) ?? 0;
      const lastRoute =
        requestedIndex <= furthestIndex && (requestedRoute !== "complete" || deliveryConfirmed)
          ? requestedRoute
          : routeForCheckpoint(furthestIndex);
      const now = Date.now();
      const lastTestSentAt =
        Number.isFinite(value.lastTestSentAt) &&
        value.lastTestSentAt > now - TEST_RESEND_COOLDOWN_MS * 4 &&
        value.lastTestSentAt <= now
          ? value.lastTestSentAt
          : 0;
      const storedRunner =
        typeof value.runnerAddress === "string" && value.runnerAddress.length <= 2048
          ? validateRunnerOrigin(value.runnerAddress)
          : { ok: false };
      const runnerAddress = storedRunner.ok ? storedRunner.url.origin : DEFAULT_RUNNER_ADDRESS;
      return {
        lastRoute,
        furthestIndex,
        runnerAddress,
        runnerName:
          storedRunner.ok && typeof value.runnerName === "string" && value.runnerName.length <= 120
            ? value.runnerName
            : runnerNameFrom(new URL(runnerAddress)),
        runnerMayExist,
        runnerVerified,
        deliveryReady,
        deliveryConfirmed,
        testAttempts:
          Number.isInteger(value.testAttempts) && value.testAttempts >= 0
            ? Math.min(99, value.testAttempts)
            : 0,
        lastTestSentAt,
      };
    } catch {
      return {};
    }
  }

  let setupState = {
    lastRoute: "welcome",
    furthestIndex: 0,
    runnerAddress: DEFAULT_RUNNER_ADDRESS,
    runnerName: "pulse-sparrow-demo",
    runnerMayExist: false,
    runnerVerified: false,
    deliveryReady: false,
    deliveryConfirmed: false,
    testAttempts: 0,
    lastTestSentAt: 0,
    ...readSetupState(),
  };
  let runnerDraftAddress = setupState.runnerAddress;

  function saveSetupState(patch) {
    setupState = { ...setupState, ...patch };
    const publicSafeState = {
      lastRoute: setupState.lastRoute,
      furthestIndex: setupState.furthestIndex,
      runnerAddress: setupState.runnerAddress,
      runnerName: setupState.runnerName,
      runnerMayExist: setupState.runnerMayExist,
      runnerVerified: setupState.runnerVerified,
      deliveryReady: setupState.deliveryReady,
      deliveryConfirmed: setupState.deliveryConfirmed,
      testAttempts: setupState.testAttempts,
      lastTestSentAt: setupState.lastTestSentAt,
    };
    try {
      window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(publicSafeState));
    } catch {
      // A blocked storage surface must not prevent setup from continuing.
    }
  }

  function clearSetupState() {
    setupState = {
      lastRoute: "welcome",
      furthestIndex: 0,
      runnerAddress: DEFAULT_RUNNER_ADDRESS,
      runnerName: "pulse-sparrow-demo",
      runnerMayExist: false,
      runnerVerified: false,
      deliveryReady: false,
      deliveryConfirmed: false,
      testAttempts: 0,
      lastTestSentAt: 0,
    };
    runnerDraftAddress = DEFAULT_RUNNER_ADDRESS;
    try {
      window.localStorage.removeItem(SETUP_STORAGE_KEY);
    } catch {
      // The in-memory reset remains truthful for this session.
    }
  }

  // Rewrite legacy or corrupted state through the public-safe normalized shape.
  saveSetupState({});

  const DIRECTIONS = {
    journey: {
      id: "journey",
      name: "Guided Journey",
      label: "Direction A",
      thesis: "One calm decision at a time",
      description:
        "A focused sequence with durable progress. It minimizes infrastructure noise and makes every Mac, browser, and phone handoff explicit.",
      strength: "Lowest cognitive load",
      tradeoff: "Less freedom to jump ahead",
      bestFor: "First-time setup",
    },
    board: {
      id: "board",
      name: "Readiness Board",
      label: "Direction B",
      thesis: "See the whole system become ready",
      description:
        "A dependency board groups Phone, Runner, Secure delivery, and Test. Independent jobs stay visible and recovery has a natural home.",
      strength: "Strongest system overview",
      tradeoff: "More information at once",
      bestFor: "Resuming and repair",
    },
    companion: {
      id: "companion",
      name: "Companion Split View",
      label: "Direction C",
      thesis: "Keep context beside the active work",
      description:
        "A persistent guide sits beside the current task. It uses a laptop viewport aggressively and keeps browser-return instructions in sight.",
      strength: "Best handoff context",
      tradeoff: "Narrow views get denser",
      bestFor: "Cross-device work",
      selected: true,
    },
  };

  const STEPS = [
    { id: "welcome", short: "Start", label: "What Pulse needs" },
    { id: "phone", short: "Phone", label: "Prepare Android" },
    { id: "runner", short: "Runner", label: "Choose cloud runner" },
    { id: "pairing", short: "Connect", label: "Pair this Mac" },
    { id: "delivery", short: "Delivery", label: "Save ntfy access" },
    { id: "test", short: "Test", label: "Prove delivery" },
    { id: "complete", short: "Ready", label: "Finish setup" },
  ];

  const PHONE_STEP_IDS = ["phone", "phone-reserve", "phone-subscribe", "phone-token"];
  const SPECIAL_STEP_IDS = ["existing"];

  const WORKFLOW_PREVIOUS = {
    phone: { target: "welcome", label: "Start" },
    "phone-reserve": { target: "phone", label: "Sign in" },
    "phone-subscribe": { target: "phone-reserve", label: "Reserve topic" },
    "phone-token": { target: "phone-subscribe", label: "Subscribe" },
    runner: { target: "phone-token", label: "Runner token" },
    pairing: { target: "runner", label: "Runner" },
    existing: { target: "welcome", label: "Start" },
    delivery: { target: "pairing", label: "Connect" },
    test: { target: "delivery", label: "Delivery" },
    "test-sent": { target: "test", label: "Test" },
    complete: { target: "test-sent", label: "Test result" },
  };

  const RECOVERY_STATES = {
    resume: {
      id: "resume",
      eyebrow: "Welcome back",
      title: "Your setup is right where you left it",
      summary: "Your phone preparation and runner deployment are saved. Continue by connecting the runner you created.",
      safe: "Your deployed runner and completed phone steps are preserved. Nothing was deleted or recreated.",
      primary: "Continue connecting",
      target: "pairing",
      secondary: null,
      detail: "Last active 12 minutes ago · runner address saved",
      icon: "external",
      restart: true,
    },
    "phone-permission": {
      id: "phone-permission",
      eyebrow: "Android delivery check",
      title: "Check the settings that can hide a notification",
      summary:
        "Confirm Android notification permission first, then check that the Pulse subscription is not muted and still uses Instant delivery.",
      safe: "Your runner, private topic, and completed setup work are safe and unchanged while you check the phone.",
      primary: "Open Android notification settings",
      target: "test",
      primaryExternal: true,
      primaryExternalMessage: "Android notification-permission instructions would open in your browser.",
      secondary: "Review the ntfy subscription",
      secondaryTarget: "phone-subscribe",
      detail: "Android Settings → Apps → ntfy → Notifications · ntfy topic → Unmuted · Instant delivery on",
      icon: "alert",
    },
    "phone-account": {
      id: "phone-account",
      eyebrow: "Android account setup",
      title: "Use ntfy’s user settings, not your Google account",
      summary:
        "In ntfy, open Settings, then Manage users. Add your ntfy.sh username and password under Add users.",
      safe: "Your ntfy account and Pulse setup are safe and unchanged. Pulse never receives the password you enter in ntfy.",
      primary: "Return to the account screen",
      target: "phone",
      secondary: "Open ntfy Android guidance",
      secondaryExternal: true,
      detail: "Android ntfy app · Settings → Manage users → Add users",
      icon: "smartphone",
    },
    "phone-subscription": {
      id: "phone-subscription",
      eyebrow: "Android subscription",
      title: "Make sure ntfy is using your saved user",
      summary:
        "A Not authorized message means the ntfy.sh user is missing, incorrect, or not being used for this protected topic.",
      safe: "The reserved topic remains private and your setup progress is saved. No permission was loosened.",
      primary: "Check the saved user",
      target: "phone",
      secondary: "Try the subscription again",
      secondaryTarget: "phone-subscribe",
      detail: "Keep “Only I can publish and subscribe” selected",
      icon: "alert",
    },
    "ntfy-verification": {
      id: "ntfy-verification",
      eyebrow: "Account action",
      title: "Finish verifying your ntfy account",
      summary:
        "Open the verification email from ntfy and finish the confirmation link. If no email is pending, review the account page for a plan or feature notice.",
      safe: "Your suggested topic and setup progress are saved. Pulse has not received any account credential.",
      primary: "Open ntfy account",
      target: "phone",
      primaryExternal: true,
      primaryExternalMessage: "Your ntfy account page would open in your browser.",
      secondary: "I verified it — continue",
      secondaryTarget: "phone-reserve",
      detail: "You’re done when Reserved topics and Create access token are available in ntfy.",
      icon: "user",
    },
    "private-topic": {
      id: "private-topic",
      eyebrow: "Privacy check",
      title: "This ntfy setup cannot protect the topic",
      summary: "Pulse will not quietly treat a random public topic as authenticated private delivery.",
      safe: "Nothing has been published and every non-secret setup value is saved.",
      primary: "Compare ntfy options",
      target: "phone",
      primaryExternal: true,
      primaryExternalMessage: "ntfy’s current plan and private-topic options would open in your browser.",
      secondary: "Use advanced self-hosting",
      secondaryTarget: "state/advanced",
      detail: "Your provider account controls feature availability and price.",
      icon: "shield",
    },
    "adapter-unavailable": {
      id: "adapter-unavailable",
      eyebrow: "Quick setup paused",
      title: "Netlify setup is temporarily unavailable",
      summary: "The guided provider handoff could not be opened. Pulse itself and compatible runners are still available.",
      safe: "Your phone work is saved. No runner was created and no cost was incurred.",
      primary: "Try Netlify again",
      target: "runner",
      secondary: "Connect another runner",
      secondaryTarget: "state/advanced",
      detail: "The Netlify handoff is unavailable; Pulse itself is still working.",
      icon: "refresh",
    },
    "provider-authorization": {
      id: "provider-authorization",
      eyebrow: "Provider permission",
      title: "Netlify needs permission to create your copy",
      summary: "Review the Git-provider access request in Netlify. Pulse does not receive that authorization.",
      safe: "Your pending setup is saved. Cancelling leaves no connected runner in Pulse.",
      primary: "Return to Netlify",
      target: "runner",
      primaryExternal: true,
      primaryExternalMessage: "Your pending Netlify deployment would reopen in your browser.",
      secondary: "Cancel this handoff",
      secondaryAction: "cancel-handoff",
      detail: "Opens Netlify in your browser",
      icon: "external",
    },
    "team-permission": {
      id: "team-permission",
      eyebrow: "Provider permission",
      title: "That Netlify team cannot create this runner",
      summary: "Choose a team you own or one where you can create projects. This is a Netlify account permission.",
      safe: "No Pulse data was written. Your setup session and phone steps are preserved.",
      primary: "Choose another Netlify team",
      target: "runner",
      primaryExternal: true,
      primaryExternalMessage: "Netlify team selection would reopen in your browser.",
      secondary: "Connect another runner",
      secondaryTarget: "state/advanced",
      detail: "No runner exists yet",
      icon: "alert",
    },
    "invalid-url": {
      id: "invalid-url",
      eyebrow: "Runner address",
      title: "That address is not a Pulse runner",
      summary: "Use the main HTTPS address from the provider, without an API path, password, or fragment.",
      safe: "No proof or credential was sent to that address. Your pending setup is safe.",
      primary: "Correct the address",
      target: "pairing",
      secondary: "Open hosting provider",
      secondaryExternal: true,
      detail: "Example: https://pulse-sparrow-demo.example",
      icon: "help",
    },
    "incompatible-runner": {
      id: "incompatible-runner",
      eyebrow: "Compatibility check",
      title: "This runner needs an update",
      summary: "It identifies as Pulse, but it does not support the secure setup version this Workshop release requires.",
      safe: "No setup proof or credential was sent. Remote reminders, if any, are preserved and were not changed.",
      primary: "Open update instructions",
      target: "runner",
      primaryHref: "../../docs/guided-byo-setup-plan.md#runner-compatibility-contract",
      secondary: "Choose another runner",
      secondaryTarget: "runner",
      detail: "Found pulse.setup.v0 · needs pulse.setup.v1",
      icon: "upload",
    },
    "fingerprint-mismatch": {
      id: "fingerprint-mismatch",
      eyebrow: "Identity check stopped",
      title: "This is not the runner created by this setup",
      summary: "The runner's public fingerprint does not match the key held by Workshop. Pulse refused to connect.",
      safe: "Your private key and runner credential are safe. Pulse requested only public identity information; no secret, private proof, or durable access was sent.",
      primary: "Return to your provider project",
      target: "pairing",
      primaryExternal: true,
      primaryExternalMessage: "Your runner project would open in its hosting provider.",
      secondary: "Enter a different address",
      secondaryTarget: "pairing",
      detail: "Expected E8:43:92:1B · received 51:00:A4:C9",
      icon: "x",
    },
    "proof-failed": {
      id: "proof-failed",
      eyebrow: "Secure connection",
      title: "The runner could not verify this Mac",
      summary: "The runner could not confirm that this setup belongs to this Mac. The temporary check may have expired.",
      safe: "Your runner is still there. This Mac did not save a lasting connection.",
      primary: "Try the secure connection again",
      target: "pairing",
      secondary: "Choose a different runner",
      secondaryTarget: "runner",
      detail: "Trying again creates a new one-time verification check.",
      icon: "x",
    },
    "secure-storage-failed": {
      id: "secure-storage-failed",
      eyebrow: "Local protection",
      title: "This Mac could not save its secure connection",
      summary: "The runner connected, but this Mac could not save the connection in Keychain. Workshop removed the incomplete local change.",
      safe: "Your runner and any other connected Macs are safe and unchanged. This Mac is not connected yet.",
      primary: "Try Keychain again",
      target: "pairing",
      secondary: "View macOS guidance",
      secondaryExternal: true,
      detail: "Runner deployed · this Mac not connected",
      icon: "lock",
    },
    "runner-starting": {
      id: "runner-starting",
      eyebrow: "Cloud runner",
      title: "Your runner is still waking up",
      summary: "Netlify accepted the deployment, but the runner is not ready yet. Wait a few seconds, then return to Workshop and verify the address again.",
      safe: "Your deployment is saved. This page is not checking in the background, and you do not need to redeploy.",
      primary: "Return to verify again",
      target: "pairing",
      secondary: "Open Netlify",
      secondaryExternal: true,
      detail: "Last check: 18 seconds ago · no automatic retry is running",
      icon: "more",
    },
    "test-rejected": {
      id: "test-rejected",
      eyebrow: "Delivery needs repair",
      title: "ntfy rejected the test notification",
      summary: "Your runner is online and this Mac is connected. The ntfy token or topic access needs attention.",
      safe: "Your runner connection and setup progress are saved. No reminder or history item was created.",
      primary: "Repair ntfy access",
      target: "delivery",
      secondary: "Review runner connection",
      secondaryTarget: "pairing",
      detail: "Provider response: authentication rejected",
      icon: "alert",
    },
    "test-not-received": {
      id: "test-not-received",
      eyebrow: "Phone check",
      title: "The runner sent it, but your phone did not show it",
      summary: "Check the exact topic, Android permission, subscription mute state, and instant-delivery setting.",
      safe: "Your runner connection is safe and the test created no reminder or completion history.",
      primary: "Check Android delivery settings",
      target: "state/phone-permission",
      secondary: "Send one more test",
      secondaryAction: "resend-test",
      detail: "Provider accepted delivery · phone receipt cannot be observed",
      icon: "help",
    },
    "existing-installation": {
      id: "existing-installation",
      eyebrow: "Existing Pulse",
      title: "Connect this Mac to a Pulse you already own",
      summary: "Use the runner address and a ten-minute pairing code created from another connected Mac.",
      safe: "Existing reminders and clients stay safe. This Mac receives its own revocable credential.",
      primary: "Connect existing Pulse",
      target: "existing",
      secondary: "Set up a new Pulse",
      secondaryTarget: "welcome",
      detail: "Credentials are never copied between Macs",
      icon: "plus",
      intentional: true,
    },
    "stale-setup": {
      id: "stale-setup",
      eyebrow: "Older setup found",
      title: "Review this saved setup before continuing",
      summary: "A runner deployment was recorded 34 days ago. Pulse will not discard the matching native key automatically.",
      safe: "This Mac kept the unfinished setup so you can review it before deleting anything. The provider deployment is separate and may still use quota.",
      primary: "Resume this setup",
      target: "pairing",
      secondary: null,
      detail: "Deployment known · connection incomplete",
      icon: "clock",
      restart: true,
    },
    "migrated-setup": {
      id: "migrated-setup",
      eyebrow: "Setup restored",
      title: "Your saved setup was updated safely",
      summary: "Workshop safely updated the saved setup before continuing.",
      safe: "The previous working copy remains available until the updated setup finishes.",
      primary: "Continue setup",
      target: "pairing",
      secondary: null,
      detail: "Saved setup updated from version 1 to version 2",
      icon: "check",
    },
    advanced: {
      id: "advanced",
      eyebrow: "Advanced setup",
      title: "Connect a runner you manage yourself",
      summary: "Use this only when your runner already satisfies Pulse's HTTPS, storage, scheduling, pairing, and notification-secret contracts.",
      safe: "Your current setup and any connected runner remain safe until a replacement connection succeeds.",
      primary: "Validate compatible runner",
      target: "pairing",
      secondary: "Use guided setup instead",
      secondaryTarget: "runner",
      detail: "Manual roots and configuration stay outside public repositories",
      icon: "settings",
      intentional: true,
    },
  };

  const RECOVERY_STAGES = {
    resume: "pairing",
    "phone-permission": "test",
    "phone-account": "phone",
    "phone-subscription": "phone",
    "ntfy-verification": "phone",
    "private-topic": "phone",
    "adapter-unavailable": "runner",
    "provider-authorization": "runner",
    "team-permission": "runner",
    "invalid-url": "pairing",
    "incompatible-runner": "pairing",
    "fingerprint-mismatch": "pairing",
    "proof-failed": "pairing",
    "secure-storage-failed": "pairing",
    "runner-starting": "pairing",
    "test-rejected": "test",
    "test-not-received": "test",
    "existing-installation": "pairing",
    "stale-setup": "pairing",
    "migrated-setup": "pairing",
    advanced: "runner",
  };

  function stageForRoute(location) {
    if (location.startsWith("state/")) return RECOVERY_STAGES[location.slice(6)] || "welcome";
    if (PHONE_STEP_IDS.includes(location)) return "phone";
    if (location === "test-sent") return "test";
    if (location === "existing") return "pairing";
    return STEPS.some((step) => step.id === location) ? location : "welcome";
  }

  function owns(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
  }

  function selectedRouteAllowed(location) {
    if (PREVIEW_MODE || ["welcome", "state/existing-installation", "state/advanced"].includes(location)) return true;
    const stageIndex = ROUTE_STAGE_INDEX.get(location);
    if (stageIndex === undefined || stageIndex > setupState.furthestIndex) return false;
    if (location === "delivery") return setupState.runnerVerified;
    if (["test", "state/test-rejected", "state/test-not-received", "state/phone-permission"].includes(location)) {
      return setupState.deliveryReady;
    }
    if (location === "test-sent") return setupState.deliveryReady && setupState.lastTestSentAt > 0;
    if (location === "complete") return setupState.deliveryConfirmed;
    return true;
  }

  function safeSelectedRoute() {
    if (selectedRouteAllowed(setupState.lastRoute)) return setupState.lastRoute;
    const checkpoint = routeForCheckpoint(setupState.furthestIndex);
    return selectedRouteAllowed(checkpoint) ? checkpoint : "welcome";
  }

  function route() {
    const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts.length === 0 || (parts[0] === "compare" && parts.length === 1)) return { view: "compare" };
    const selectedMode = parts[0] === "selected";
    const direction = selectedMode ? "companion" : owns(DIRECTIONS, parts[0]) ? parts[0] : "journey";
    let location = "welcome";
    let state;
    let step;
    const stateRoute = parts[1] === "state" && parts.length === 3 && owns(RECOVERY_STATES, parts[2]);
    const stepRoute =
      parts.length === 2 &&
      (parts[1] === "test-sent" ||
        PHONE_STEP_IDS.includes(parts[1]) ||
        SPECIAL_STEP_IDS.includes(parts[1]) ||
        STEPS.some((candidate) => candidate.id === parts[1]));
    if (stateRoute) {
      state = parts[2];
      location = `state/${state}`;
    } else if (stepRoute) {
      step = parts[1];
      location = step;
    }
    const validDirection = selectedMode || owns(DIRECTIONS, parts[0]);
    const validRoute = validDirection && (stateRoute || stepRoute);
    if (selectedMode && (!validRoute || !selectedRouteAllowed(location))) {
      const target = safeSelectedRoute();
      return { view: "redirect", target: `selected/${target}` };
    }
    if (stateRoute) {
      return {
        view: "prototype",
        direction,
        selectedMode,
        state,
      };
    }
    return {
      view: "prototype",
      direction,
      selectedMode,
      step: stepRoute ? step : "welcome",
    };
  }

  function directionSwitcher(active, location) {
    return `
      <nav class="pulse-setup__direction-switcher" aria-label="Prototype directions">
        ${Object.values(DIRECTIONS)
          .map(
            (direction) => `
              <a href="#/${direction.id}/${location}" ${direction.id === active ? 'aria-current="true"' : ""}>
                ${direction.name.replace(" View", "")}
              </a>
            `,
          )
          .join("")}
      </nav>
    `;
  }

  function progress(stepId) {
    const index = Math.max(
      0,
      STEPS.findIndex((step) => step.id === stepId),
    );
    const value = Math.round(((index + 1) / STEPS.length) * 100);
    return `
      <div
        class="pulse-setup__progress"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin="1"
        aria-valuemax="${STEPS.length}"
        aria-valuenow="${index + 1}"
      >
        <div class="pulse-setup__progress-track" aria-hidden="true">
          <i style="--progress: ${value}%"></i>
        </div>
        <span>${index + 1} of ${STEPS.length}</span>
      </div>
    `;
  }

  function stepList(direction, current) {
    const currentIndex = STEPS.findIndex((step) => step.id === current);
    return `
      <ol class="pulse-setup__step-list">
        ${STEPS.map(
          (step, index) => `
            <li>
              <a
                class="pulse-setup__step-link ${index < currentIndex ? "is-complete" : ""}"
                href="#/${direction}/${step.id}"
                ${step.id === current ? 'aria-current="step"' : ""}
              >
                <span aria-hidden="true">${index < currentIndex ? iconSvg("check") : index + 1}</span>
                <span>${step.short}</span>
              </a>
            </li>
          `,
        ).join("")}
      </ol>
    `;
  }

  function companionList(direction, current) {
    const currentIndex = Math.max(
      0,
      STEPS.findIndex((step) => step.id === current),
    );
    const availableIndex = Math.max(currentIndex, setupState.furthestIndex);
    return `
      <ol class="pulse-setup__companion-list">
        ${STEPS.map(
          (step, index) => {
            const content = `
                <span>${step.short}</span>
                <small>${index + 1}/${STEPS.length}</small>
            `;
            return `
              <li>
                ${
                  index <= availableIndex
                    ? `<a href="#/${direction}/${step.id}" ${step.id === current ? 'aria-current="step"' : ""}>${content}</a>`
                    : `<span class="pulse-setup__companion-step--locked" aria-disabled="true">${content}</span>`
                }
              </li>
            `;
          },
        ).join("")}
      </ol>
    `;
  }

  function expertShortcuts(direction) {
    return `
      <details class="pulse-setup__expert" data-expert-shortcuts>
        <summary><span>Experienced setup</span><small>Existing or self-hosted runner</small></summary>
        <p>Skip provider walkthroughs, not verification.</p>
        <div class="pulse-setup__expert-links">
          <a href="#/${direction}/state/existing-installation">Connect an existing Pulse <span aria-hidden="true">→</span></a>
          <a href="#/${direction}/state/advanced">Use a compatible runner <span aria-hidden="true">→</span></a>
        </div>
      </details>
    `;
  }

  function selectedWelcome(direction) {
    const resumable = setupState.furthestIndex > 0 && setupState.lastRoute !== "welcome";
    const resumeStage = stageForRoute(setupState.lastRoute);
    const resumeStep = STEPS.find((step) => step.id === resumeStage) || STEPS[0];
    return `
      <section class="pulse-setup__prototype pulse-setup__welcome" aria-label="Pulse setup">
        ${
          transientNotice
            ? `<div class="pulse-setup__notice pulse-setup__notice--warning pulse-setup__welcome-notice" role="status"><strong>${transientNotice}</strong></div>`
            : ""
        }
        <div class="pulse-setup__welcome-shell">
          <div class="pulse-setup__welcome-copy">
            <p class="pulse-setup__eyebrow">Pulse setup · plan for about 15 minutes</p>
            <h1 class="pulse-setup__display">Let’s get Pulse working on your phone</h1>
            <p class="pulse-setup__lede">
              Start on Android, then connect a runner that keeps reminders working while this Mac sleeps.
              Account creation or provider approval can add time; Pulse saves your safe progress as you go.
            </p>
            <div class="pulse-setup__welcome-action">
              ${
                resumable
                  ? `<a class="pulse-setup__button pulse-setup__button--large" data-resume-setup href="#/${direction}/${setupState.lastRoute}">
                      Continue at ${resumeStep.short} →
                    </a>
                    <span>${setupState.furthestIndex + 1} of ${STEPS.length} complete or in progress on this Mac.</span>
                    <button class="pulse-setup__button pulse-setup__button--quiet pulse-setup__button--small" data-open-restart data-restart-base="${direction}">Start over instead</button>`
                  : `<a class="pulse-setup__button pulse-setup__button--large" data-primary-start data-advance-target="phone" href="#/${direction}/phone">
                      Start with my phone →
                    </a>
                    <span>You can leave and resume after any step.</span>`
              }
            </div>
          </div>
          <aside class="pulse-setup__welcome-needs" aria-labelledby="welcome-needs-title">
            <p class="pulse-setup__eyebrow">Have these nearby</p>
            <h2 class="pulse-setup__subheading" id="welcome-needs-title">Before you start</h2>
            ${facts([
              ["smartphone", "Your Android phone", "The first step happens in the ntfy app."],
              ["browser", "Your ntfy and runner-provider sign-ins", "Account verification or provider approval can add time."],
              ["check", "One real test", "Setup ends only after a notification reaches your phone."],
            ])}
            <div class="pulse-setup__welcome-cost">
              <strong>Pulse is free.</strong>
              <span>Provider plans and prices are theirs. Pulse shows the handoff before anything billable happens.</span>
            </div>
          </aside>
        </div>
        <div class="pulse-setup__welcome-existing">
          <div>
            <p class="pulse-setup__eyebrow">Already set up?</p>
            <h2 class="pulse-setup__card-title">Use the runner you already have</h2>
          </div>
          <div class="pulse-setup__welcome-existing-links">
            <a href="#/${direction}/state/existing-installation">Connect an existing Pulse →</a>
            <a href="#/${direction}/state/advanced">Use another compatible runner →</a>
          </div>
        </div>
      </section>
    `;
  }

  function companionContext(activeStep, recoveryId, actualStep) {
    if (recoveryId) {
      if (["advanced", "existing-installation"].includes(recoveryId)) {
        return {
          surface: "In Workshop",
          title: recoveryId === "advanced" ? "Use a runner you manage" : "Connect another Mac",
          copy: "This is an intentional setup path. Verification remains required, but nothing has failed.",
        };
      }
      return {
        surface: "In Workshop",
        title: "Fix this without starting over",
        copy: "Pulse keeps completed work in place while you resolve the current problem.",
      };
    }

    if (activeStep === "phone") {
      return (
        {
          phone: {
            surface: "On your Android phone",
            title: "Start in ntfy",
            copy: "Open ntfy Settings. Pulse will wait here and never sees the password you enter there.",
          },
          "phone-reserve": {
            surface: "In your browser",
            title: "Reserve your private topic",
            copy: "Open ntfy Settings and make the generated Pulse topic visible only to your account.",
          },
          "phone-subscribe": {
            surface: "On your Android phone",
            title: "Subscribe to Pulse",
            copy: "Scan the QR code or tap + in ntfy, then turn on instant delivery.",
          },
          "phone-token": {
            surface: "In your browser",
            title: "Create runner access",
            copy: "Create a dedicated token in ntfy Account. Keep that browser tab open for the later runner handoff.",
          },
        }[actualStep] || {
          surface: "On your Android phone",
          title: "Continue phone setup",
          copy: "Pulse keeps each ntfy task on its own screen.",
        }
      );
    }

    return (
      {
        runner: {
          surface: "In your browser",
          title: "Create your runner",
          copy: "Choose an account you own. Workshop will wait for you to return with its address.",
        },
        pairing: {
          surface: "Back in Workshop",
          title: "Verify this runner",
          copy: "Pulse checks its address and identity before this Mac receives access.",
        },
        delivery: {
          surface: "In your browser",
          title: "Save notification access",
          copy: "The token goes straight to your verified runner. It never enters Pulse or Workshop.",
        },
        test: {
          surface: "On your Android phone",
          title: actualStep === "test-sent" ? "Check for the test" : "Keep your phone nearby",
          copy:
            actualStep === "test-sent"
              ? "Only confirm success after the notification actually appears on your phone."
              : "Send the setup test from Workshop, then look for it on Android.",
        },
        complete: {
          surface: "In Workshop",
          title: "Create your first reminder",
          copy: "Setup is finished. No sample reminder was added to your private data.",
        },
      }[activeStep] || {
        surface: "In Workshop",
        title: "Continue setup",
        copy: "Pulse keeps your place as the work moves between this Mac, a browser, and your phone.",
      }
    );
  }

  function surfaceLabel(surface) {
    return `<span class="pulse-setup__surface-label">${surface}</span>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function runnerHost() {
    try {
      return new URL(setupState.runnerAddress).host;
    } catch {
      return new URL(DEFAULT_RUNNER_ADDRESS).host;
    }
  }

  const ICON_PATHS = {
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    browser:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/><path d="M14 13h5v5"/><path d="m19 13-7 7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 8.4 4.8 4.8 0 0 0 7 18Z"/>',
    external: '<path d="M14 5h5v5"/><path d="m19 5-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.15c-.8.43-1.3.9-1.3 1.85"/><path d="M12 17h.01"/>',
    laptop: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 11.9-2"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };

  function iconSvg(name) {
    const paths = ICON_PATHS[name];
    return paths
      ? `<svg class="pulse-setup__icon" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">${paths}</svg>`
      : name;
  }

  function facts(items) {
    return `
      <ul class="pulse-setup__facts">
        ${items
          .map(
            ([icon, title, copy]) => `
              <li>
                <span class="pulse-setup__fact-icon${/^\d+$/.test(icon) ? " is-number" : ""}" aria-hidden="true">${iconSvg(icon)}</span>
                <span><strong>${title}</strong><span>${copy}</span></span>
              </li>
            `,
          )
          .join("")}
      </ul>
    `;
  }

  function phoneProgress(active) {
    const steps = [
      ["phone", "Sign in"],
      ["phone-reserve", "Reserve topic"],
      ["phone-subscribe", "Subscribe"],
      ["phone-token", "Runner token"],
    ];
    const activeIndex = Math.max(
      0,
      steps.findIndex(([id]) => id === active),
    );
    return `
      <div class="pulse-setup__phone-progress" aria-label="Phone setup progress">
        <span>Phone setup · ${activeIndex + 1} of ${steps.length}</span>
        <ol>
          ${steps
            .map(
              ([id, label], index) => `
                <li class="${index < activeIndex ? "is-complete" : index === activeIndex ? "is-current" : ""}">
                  <i aria-hidden="true">${index < activeIndex ? iconSvg("check") : index + 1}</i>
                  <span>${label}</span>
                </li>
              `,
            )
            .join("")}
        </ol>
      </div>
    `;
  }

  function phoneInstructions(items) {
    return `
      <ol class="pulse-setup__phone-instructions">
        ${items
          .map(
            ([title, copy]) => `
              <li><span><strong>${title}</strong><small>${copy}</small></span></li>
            `,
          )
          .join("")}
      </ol>
    `;
  }

  function phoneStage(step) {
    const topic = "pulse_••••••••••••••••";

    if (step === "phone-reserve") {
      return {
        eyebrow: "Phone setup · 2 of 4 · Browser",
        heading: "Make the Pulse topic private",
        lede:
          "Reserve Pulse’s generated topic in your ntfy account. This prevents anyone else from reading or publishing to it.",
        main: `
          ${phoneProgress(step)}
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced pulse-setup__phone-task">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Browser")}
              ${phoneInstructions([
                ["Open Settings", "In the ntfy web app, open the profile menu and choose Settings."],
                ["Find Reserved topics", "Choose Add reserved topic."],
                ["Paste your generated Pulse topic", "Real setup generates a unique private topic and enables the copy button below."],
                ["Keep access private", "Select “Only I can publish and subscribe,” then choose Add."],
              ])}
              <div class="pulse-setup__copy">
                <div>
                  <span class="pulse-setup__preview-badge">Prototype preview</span>
                  <code data-topic-preview>${topic}</code>
                </div>
                <button class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--small" data-copy-topic disabled aria-describedby="topic-preview-note">Copy topic</button>
              </div>
              <small class="pulse-setup__copy-note" id="topic-preview-note">No live topic exists in this public prototype. The working setup generates one for you automatically.</small>
              <div class="pulse-setup__checkpoint">
                <strong>You’re done when</strong>
                <span>The topic appears under Reserved topics with “Only I can publish and subscribe.”</span>
              </div>
            </div>
            <div class="pulse-setup__ntfy-screen" data-ntfy-screen="reserve-topic" aria-label="ntfy Reserved topics screen preview">
              <div class="pulse-setup__ntfy-bar"><span>ntfy</span><small>Settings</small></div>
              <div class="pulse-setup__ntfy-body">
                <span class="pulse-setup__ntfy-kicker">Reserved topics</span>
                <h2>Add reserved topic</h2>
                <span class="pulse-setup__ntfy-label">Topic</span><div class="pulse-setup__ntfy-field">${topic}</div>
                <span class="pulse-setup__ntfy-label">Access</span><div class="pulse-setup__ntfy-select">Only I can publish and subscribe⌄</div>
                <div class="pulse-setup__ntfy-actions"><span>Cancel</span><strong>Add</strong></div>
                <button class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--small" data-external>Open ntfy Settings ↗</button>
              </div>
            </div>
          </div>
        `,
        primary: "My topic is reserved",
        target: "phone-subscribe",
        trust: "The working setup generates a unique topic, but only your ntfy account can reserve it.",
      };
    }

    if (step === "phone-subscribe") {
      return {
        eyebrow: "Phone setup · 3 of 4 · Android",
        heading: "Subscribe your phone to Pulse",
        lede:
          "Add the protected topic to the ntfy app using the account you just saved. Production setup provides a scannable QR code so you do not have to retype the long topic name.",
        main: `
          ${phoneProgress(step)}
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced pulse-setup__phone-task">
            <div class="pulse-setup__stack">
              ${surfaceLabel("On your Android phone")}
              ${phoneInstructions([
                ["Scan the production QR code", "Use your Android phone camera or QR scanner. It opens ntfy with the Pulse topic filled in."],
                ["In this prototype, tap + in ntfy", "The public walkthrough shows a safe fixture preview rather than a live subscription. Paste the topic in production if you prefer to add it manually."],
                ["Turn on Instant delivery", "This keeps reminders timely even while your phone is resting."],
                ["Tap Subscribe", "ntfy should open the new Pulse topic without a Not authorized error."],
              ])}
              <div class="pulse-setup__checkpoint">
                <strong>You’re done when</strong>
                <span>Pulse appears under Subscribed topics and its detail screen says “Instant delivery on.”</span>
              </div>
            </div>
            <div class="pulse-setup__subscribe-visual">
              <span class="pulse-setup__preview-badge pulse-setup__preview-badge--disabled">Preview only · do not scan</span>
              <div class="pulse-setup__topic-qr" data-topic-qr role="img" aria-label="Placement preview for the production Pulse topic QR code; not scannable in this public prototype">
                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </div>
              <p>Your real setup creates a scannable code here.</p>
              <small>This masked public preview cannot subscribe a phone.</small>
              <code>ntfy://ntfy.sh/${topic}?display=Pulse</code>
              <div class="pulse-setup__ntfy-screen pulse-setup__ntfy-screen--phone" data-ntfy-screen="android-subscribe" aria-label="ntfy Android Subscribe to topic screen preview">
                <div class="pulse-setup__ntfy-bar"><span>‹</span><small>Subscribe to topic</small></div>
                <div class="pulse-setup__ntfy-body">
                  <span class="pulse-setup__ntfy-label">Topic name</span><div class="pulse-setup__ntfy-field">${topic}</div>
                  <div class="pulse-setup__ntfy-toggle"><span>Instant delivery</span><i aria-hidden="true"></i></div>
                  <div class="pulse-setup__ntfy-actions"><strong>Subscribe</strong></div>
                </div>
              </div>
            </div>
          </div>
        `,
        primary: "Pulse appears in my topics",
        target: "phone-token",
        secondary: "I see Not authorized",
        secondaryTarget: "state/phone-subscription",
        trust: "The QR contains only the generated topic and ntfy.sh address. It contains no password or access token.",
      };
    }

    if (step === "phone-token") {
      return {
        eyebrow: "Phone setup · 4 of 4 · Browser",
        heading: "Create access for the Pulse runner",
        lede:
          "Create a dedicated ntfy access token so the runner can publish notifications without using your account password.",
        main: `
          ${phoneProgress(step)}
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced pulse-setup__phone-task">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Browser")}
              ${phoneInstructions([
                ["Open Account", "In the ntfy web app, choose Account."],
                ["Find Access tokens", "Choose Create access token."],
                ["Label it Pulse runner", "Set Access token expires in to Never expires, then choose Create token."],
                ["Copy the token", "Keep the ntfy tab open. You’ll paste it into your verified runner later—not into Pulse."],
              ])}
              <div class="pulse-setup__notice">
                <strong>This token can act as your ntfy account.</strong>
                <p>Your runner needs durable publishing access. You can revoke the token later, but revoking it stops Pulse delivery until you save a replacement.</p>
              </div>
              <div class="pulse-setup__checkpoint">
                <strong>You’re done when</strong>
                <span>“Pulse runner” appears in Access tokens and you have copied its <code>tk_…</code> value.</span>
              </div>
            </div>
            <div class="pulse-setup__ntfy-screen" data-ntfy-screen="access-token" aria-label="ntfy Create access token screen preview">
              <div class="pulse-setup__ntfy-bar"><span>ntfy</span><small>Account</small></div>
              <div class="pulse-setup__ntfy-body">
                <span class="pulse-setup__ntfy-kicker">Access tokens</span>
                <h2>Create access token</h2>
                <span class="pulse-setup__ntfy-label">Label</span><div class="pulse-setup__ntfy-field">Pulse runner</div>
                <span class="pulse-setup__ntfy-label">Access token expires in</span><div class="pulse-setup__ntfy-select">Never expires⌄</div>
                <div class="pulse-setup__ntfy-actions"><span>Cancel</span><strong>Create token</strong></div>
                <button class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--small" data-external>Open ntfy Account ↗</button>
              </div>
            </div>
          </div>
        `,
        primary: "I created the runner token",
        target: "runner",
        trust: "Pulse never asks for or stores the ntfy token. The runner-owned delivery page receives it later.",
      };
    }

    return {
      eyebrow: "Phone setup · 1 of 4 · Android",
      heading: "Add your ntfy account",
      lede:
        "Your phone must know which ntfy account owns the private Pulse topic. Add the account inside ntfy; Pulse never sees your password.",
      main: `
        ${phoneProgress("phone")}
        <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced pulse-setup__phone-task">
          <div class="pulse-setup__stack">
            ${surfaceLabel("On your Android phone")}
            <div class="pulse-setup__notice">
              <strong>Need an ntfy account first?</strong>
              <p>Create or sign in to ntfy in your browser, verify the account if asked, then return here.</p>
              <button class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--small pulse-setup__button--handoff" data-external data-external-message="ntfy account setup would open in your browser.">Create or sign in to ntfy ↗</button>
            </div>
            ${phoneInstructions([
              ["Open ntfy Settings", "In ntfy, open Settings, then Manage users."],
              ["Choose Add users", "Then choose Add new user."],
              ["Enter the ntfy.sh account", "Use https://ntfy.sh, your ntfy username, and your ntfy password."],
              ["Tap Add user", "The password stays inside the ntfy app on this phone."],
            ])}
            <div class="pulse-setup__checkpoint">
              <strong>You’re done when</strong>
              <span>Your ntfy.sh user appears under Users without an error.</span>
            </div>
          </div>
          <div class="pulse-setup__ntfy-screen pulse-setup__ntfy-screen--phone" data-ntfy-screen="android-user" aria-label="ntfy Android Add new user screen preview">
            <div class="pulse-setup__ntfy-bar"><span>‹</span><small>Add new user</small></div>
            <div class="pulse-setup__ntfy-body">
              <span class="pulse-setup__ntfy-label">Service URL</span><div class="pulse-setup__ntfy-field">https://ntfy.sh</div>
              <span class="pulse-setup__ntfy-label">Username</span><div class="pulse-setup__ntfy-field">your ntfy username</div>
              <span class="pulse-setup__ntfy-label">Password</span><div class="pulse-setup__ntfy-field">••••••••••••</div>
              <div class="pulse-setup__ntfy-actions"><span>Cancel</span><strong>Add user</strong></div>
            </div>
          </div>
        </div>
      `,
      primary: "My ntfy user is saved",
      target: "phone-reserve",
      secondary: "I can’t find Manage users",
      secondaryTarget: "state/phone-account",
      trust: "Your ntfy username and password stay inside ntfy. Pulse receives neither.",
    };
  }

  function stageContent(step, direction) {
    if (PHONE_STEP_IDS.includes(step)) {
      return phoneStage(step);
    }

    if (step === "existing") {
      return {
        eyebrow: "Existing Pulse · another Mac",
        heading: "Connect this Mac to your runner",
        lede:
          "Create a ten-minute code from a Mac that is already connected, then enter that code with your runner’s main address.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              ${surfaceLabel("On your connected Mac")}
              ${phoneInstructions([
                ["Open Pulse settings", "Choose Connected Macs, then Add this Mac."],
                ["Create the pairing code", "The code expires after ten minutes and works once."],
                ["Return to this Mac", "Enter the runner address and code below."],
              ])}
              <div class="pulse-setup__notice">
                <strong>Prototype-only code</strong>
                <p>Use <code>DEMO-PAIR</code> to exercise this public walkthrough. A working setup creates a fresh private code.</p>
              </div>
            </div>
            <div class="pulse-setup__stack">
              ${surfaceLabel("On this Mac")}
              <div class="pulse-setup__field-wrap">
                <label class="pulse-setup__label" for="existing-runner-address">Your Pulse site address</label>
                <input class="pulse-setup__input" id="existing-runner-address" type="url" required value="${escapeHtml(runnerDraftAddress)}" aria-describedby="existing-runner-hint existing-error" />
                <span class="pulse-setup__hint" id="existing-runner-hint">Use the public HTTPS origin with no path, password, query, or fragment.</span>
              </div>
              <div class="pulse-setup__field-wrap">
                <label class="pulse-setup__label" for="pairing-code">Ten-minute pairing code</label>
                <input class="pulse-setup__input pulse-setup__input--code" id="pairing-code" inputmode="text" autocomplete="one-time-code" placeholder="ABCD-EFGH" aria-describedby="pairing-code-hint existing-error" />
                <span class="pulse-setup__hint" id="pairing-code-hint">The code creates separate revocable access for this Mac. It is never saved in browser storage.</span>
              </div>
              <p class="pulse-setup__field-error" id="existing-error" data-existing-error role="alert" hidden></p>
            </div>
          </div>
        `,
        form: "existing",
        primary: "Verify code and connect",
        trust: "Existing reminders and other Macs remain unchanged. This Mac receives its own revocable access.",
      };
    }

    if (step === "runner") {
      return {
        eyebrow: "Cloud runner · your account",
        heading: "Choose where Pulse stays awake",
        lede:
          "The runner checks reminders while your Mac sleeps. You own the account, its quota, and any bill. Pulse does not host other people’s reminders.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Workshop")}
              <div class="pulse-setup__choices">
                <button class="pulse-setup__choice" data-external data-runner-handoff data-external-message="Netlify’s guided Pulse deployment would open in your browser.">
                  <span class="pulse-setup__choice-icon" aria-hidden="true">N</span>
                  <span>
                    <strong>Set up with Netlify ↗</strong>
                    <p>Creates a Pulse runner in your Netlify account from the public template.</p>
                  </span>
                  <span class="pulse-setup__choice-meta">
                    <span class="pulse-setup__badge pulse-setup__badge--accent">Recommended path</span>
                    <span>About 2–4 min once signed in ↗</span>
                  </span>
                </button>
                <a class="pulse-setup__choice" href="#/${direction}/state/advanced">
                  <span class="pulse-setup__choice-icon" aria-hidden="true">${iconSvg("settings")}</span>
                  <span>
                    <strong>Connect another compatible runner</strong>
                    <p>For another provider, an existing deployment, or a self-hosted runner.</p>
                  </span>
                  <span class="pulse-setup__choice-meta">
                    <span class="pulse-setup__choice-cta">Advanced setup →</span>
                    <span>HTTPS required</span>
                  </span>
                </a>
              </div>
            </div>
            <div class="pulse-setup__stack">
              ${surfaceLabel("Browser")}
              <div class="pulse-setup__handoff">
                <div class="pulse-setup__handoff-bar">
                  <span class="pulse-setup__handoff-dot" aria-hidden="true"></span>
                  <span class="pulse-setup__handoff-url">app.netlify.com/start/deploy</span>
                </div>
                <div class="pulse-setup__handoff-body">
                  <span class="pulse-setup__badge pulse-setup__badge--warning">Your provider account</span>
                  <h2 class="pulse-setup__card-title">Netlify handles the deployment</h2>
                  <p>Netlify creates a private copy of the public Pulse runner in an account and team you control. Your ntfy token is not in this handoff.</p>
                  <div class="pulse-setup__handoff-steps">
                    <span><i></i> Sign in or create your Netlify account</span>
                    <span><i></i> Allow Netlify to copy the public Pulse template; Pulse never receives this permission</span>
                    <span><i></i> Choose your personal team or another team where you can create projects</span>
                    <span><i></i> Review the plan and price Netlify shows before deploying</span>
                  </div>
                </div>
              </div>
              <div class="pulse-setup__notice pulse-setup__notice--warning">
                <strong>Provider pricing can change.</strong>
                <p>Netlify shows the current plan and usage terms before you accept them. Pulse never upgrades a plan.</p>
              </div>
            </div>
          </div>
        `,
        primary: "I finished the deployment",
        target: "pairing",
        trust: "Opening the browser is not proof. Pulse verifies the runner when you return.",
      };
    }

    if (step === "pairing") {
      return {
        eyebrow: "Secure connection · this Mac",
        heading: "Connect this Mac",
        lede:
          "Workshop will verify that the runner came from this setup, then give this Mac its own revocable access. The Mac credential stays in Keychain—there is nothing to copy.",
        main: `
          <div class="pulse-setup__content-grid">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Workshop")}
              <div class="pulse-setup__field-wrap">
                <label class="pulse-setup__label" for="runner-address">Your Pulse site address</label>
                <input
                  class="pulse-setup__input"
                  id="runner-address"
                  type="url"
                  required
                  value="${escapeHtml(runnerDraftAddress)}"
                  aria-describedby="runner-address-hint runner-address-error"
                />
                <span class="pulse-setup__hint" id="runner-address-hint">
                  Use the public HTTPS origin from your provider. No path, password, query, or fragment.
                </span>
                <p class="pulse-setup__field-error" id="runner-address-error" data-runner-error role="alert" hidden></p>
              </div>
            </div>
            <div class="pulse-setup__stack">
              <div class="pulse-setup__notice">
                <div class="pulse-setup__notice-head">
                  <strong>Ready for verification</strong>
                  <span class="pulse-setup__badge pulse-setup__badge--accent">Pending</span>
                </div>
                <p>Pulse will verify the address, setup version, and origin before saving access.</p>
              </div>
              ${facts([
                ["1", "Check the runner identity", "A different or redirected origin is blocked."],
                ["2", "Prove this setup created it", "The private setup key stays in native Keychain."],
                ["3", "Give this Mac its own access", "It can be revoked without breaking another Mac."],
              ])}
              <a class="pulse-setup__button pulse-setup__button--quiet" href="#/${direction}/state/fingerprint-mismatch">
                Preview a blocked identity mismatch
              </a>
            </div>
          </div>
        `,
        form: "runner",
        primary: "Verify and connect this runner",
        secondary: "Edit the address",
        trust: "The durable credential stays in Workshop’s native Keychain.",
      };
    }

    if (step === "delivery") {
      return {
        eyebrow: "Secure delivery · your runner",
        heading: "Finish notification delivery",
        lede:
          "One last browser handoff saves your ntfy token directly on the runner you just verified. Pulse and Workshop never receive your ntfy token.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Workshop")}
              <div class="pulse-setup__card">
                <span class="pulse-setup__badge pulse-setup__badge--success">Runner connected</span>
                <h2 class="pulse-setup__subheading">${escapeHtml(setupState.runnerName)}</h2>
                <p>Your Mac has secure access. Notification delivery is the only unfinished job.</p>
              </div>
              ${facts([
                ["check", "Single-use handoff", "Workshop opens it natively and never returns it to Pulse."],
                ["clock", "Ten-minute limit", "An expired page cannot change your runner."],
                ["lock", "Encrypted private storage", "The credential never enters a build, repository, or log."],
              ])}
            </div>
            <div class="pulse-setup__stack">
              ${surfaceLabel("Browser")}
              <div class="pulse-setup__handoff">
                <div class="pulse-setup__handoff-bar">
                  <span class="pulse-setup__handoff-dot" aria-hidden="true"></span>
                  <span class="pulse-setup__handoff-url">${escapeHtml(runnerHost())}/setup/delivery</span>
                </div>
                <div class="pulse-setup__handoff-body">
                  <span class="pulse-setup__badge pulse-setup__badge--warning">Your runner · secure session</span>
                  <h2 class="pulse-setup__card-title">Save ntfy access</h2>
                  <p>The runner-owned page has one field and never echoes the value after saving.</p>
                  <div class="pulse-setup__handoff-steps">
                    <span><i></i> Paste the token created in ntfy</span>
                    <span><i></i> Save to your runner’s encrypted store</span>
                    <span><i></i> Return here for a delivery test</span>
                  </div>
                  <button class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--small pulse-setup__button--handoff" data-external>
                    Open runner setup ↗
                  </button>
                </div>
              </div>
            </div>
          </div>
        `,
        primary: "I saved it — check delivery",
        target: "test",
        trust: "The setup page belongs to your verified runner, not Pulse or Workshop.",
      };
    }

    if (step === "test") {
      return {
        eyebrow: "Delivery proof · your phone",
        heading: "Send one real test",
        lede:
          "Pulse will ask your runner to send a setup-only notification. It creates no reminder or history item, and success still depends on what appears on Android.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Workshop")}
              <div class="pulse-setup__notice">
                <div class="pulse-setup__notice-head">
                  <strong>Ready to send</strong>
                  <span class="pulse-setup__badge pulse-setup__badge--accent">Not sent yet</span>
                </div>
                <p>Your runner is connected and notification access is saved.</p>
              </div>
              ${facts([
                ["1", "One isolated notification", "It cannot repeat, snooze, or become due."],
                ["2", "No pretend receipt", "Provider acceptance is not the same as Android delivery."],
                ["3", "You make the final call", "Pulse asks whether you actually saw the notification."],
              ])}
            </div>
            <div class="pulse-setup__card pulse-setup__test-ready">
              ${surfaceLabel("Android phone")}
              <h2 class="pulse-setup__subheading">Keep your phone nearby</h2>
              <p>The next screen will show the exact test name to look for after the runner accepts it.</p>
            </div>
          </div>
        `,
        primary: "Send a test notification",
        primaryAction: "send-test",
        trust: "Sending the test creates no reminder, occurrence, or completion history.",
      };
    }

    if (step === "test-sent") {
      return {
        eyebrow: "Delivery proof · your phone",
        heading: "Prove it reaches your phone",
        lede:
          "The runner accepted the test. Check the Android notification, then tell Pulse what actually happened. No fake green check based on an HTTP response.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              ${surfaceLabel("Workshop")}
              <div class="pulse-setup__notice pulse-setup__notice--success">
                <div class="pulse-setup__notice-head">
                  <strong>Test accepted by ntfy</strong>
                  <span class="pulse-setup__badge pulse-setup__badge--success">Sent</span>
                </div>
                <p>${setupState.testAttempts > 0 ? "Resent just now" : "Sent just now"} · phone receipt still unconfirmed</p>
              </div>
              ${facts([
                ["1", "Look for “Pulse setup test”", "It is deliberately different from a real reminder."],
                ["2", "Confirm only if you saw it", "Pulse cannot observe Android receipt."],
                ["3", "The test stays clean", "It creates no reminder, occurrence, or history entry."],
              ])}
            </div>
            <div>
              ${surfaceLabel("Android phone")}
              <div class="pulse-setup__test-phone" aria-label="Example Android test notification">
                <div class="pulse-setup__notification">
                  <div class="pulse-setup__notification-head">
                    <span class="pulse-setup__notification-mark">P</span>
                    <span>Pulse setup · now</span>
                  </div>
                  <strong>Your test notification arrived</strong>
                  <p>This is only a setup test. It will not create a reminder.</p>
                  <div class="pulse-setup__notification-guidance">Return to Workshop to confirm what happened.</div>
                </div>
              </div>
            </div>
          </div>
        `,
        primary: "I got it",
        target: "complete",
        secondary: "It did not arrive",
        secondaryTarget: "state/test-not-received",
        trust: "Another test becomes available after a short cooldown. Tests never become recurring reminders.",
      };
    }

    if (step === "complete") {
      return {
        eyebrow: "Setup complete",
        heading: "Pulse is ready",
        lede:
          "Your Android phone receives notifications, your user-owned runner stays awake, and this Mac keeps its connection protected inside Workshop.",
        main: `
          <div class="pulse-setup__content-grid pulse-setup__content-grid--balanced">
            <div class="pulse-setup__stack">
              <div class="pulse-setup__complete-mark" aria-hidden="true">${iconSvg("check")}</div>
              ${facts([
                ["smartphone", "Phone notifications ready", "Confirmed by the test you received."],
                ["cloud", "Cloud runner online", "Owned and billed through your provider account."],
                ["laptop", "This Mac protected", "Its credential lives in native Keychain."],
              ])}
            </div>
            <div class="pulse-setup__card">
              <span class="pulse-setup__badge pulse-setup__badge--accent">Next</span>
              <h2 class="pulse-setup__subheading">Create your first reminder</h2>
              <p>Setup does not invent a test reminder or copy fixture data into your account.</p>
              <div class="pulse-setup__button-row">
                <a class="pulse-setup__button" href="../prototype/index.html#/new">Create a reminder →</a>
                <a class="pulse-setup__button pulse-setup__button--quiet" href="../prototype/index.html#/empty">
                  View empty dashboard
                </a>
              </div>
            </div>
          </div>
        `,
        noActions: true,
      };
    }

    return {
      eyebrow: "Welcome · about 8 minutes",
      heading: "Set up Pulse, one clear step at a time",
      lede:
        "Connect an Android phone and a runner that stays awake when this Mac sleeps. Pulse guides the handoffs; you keep ownership of every account and any cost.",
      main: `
        <div class="pulse-setup__content-grid">
          <div class="pulse-setup__stack">
            ${surfaceLabel("Workshop")}
            ${facts([
              ["smartphone", "Your Android phone", "ntfy receives Done and Snooze notifications."],
              ["cloud", "Your always-on runner", "A compatible cloud service checks reminders while your Mac sleeps."],
              ["check", "One real delivery test", "Setup finishes only after you confirm the phone received it."],
            ])}
          </div>
          <div class="pulse-setup__stack">
            <div class="pulse-setup__notice">
              <strong>Pulse itself is free software.</strong>
              <p>You use your own provider accounts. Their current plans, quotas, and prices apply; Pulse never buys or upgrades one for you.</p>
            </div>
            <div class="pulse-setup__card">
              <span class="pulse-setup__badge pulse-setup__badge--accent">No developer chores</span>
              <p>No terminal, hand-written JSON, pasted folder path, environment-variable lesson, or Keychain scavenger hunt.</p>
            </div>
          </div>
        </div>
      `,
      primary: "Set up Pulse",
      target: "phone",
      secondary: direction === "selected" ? null : "Connect an existing Pulse",
      secondaryTarget: "state/existing-installation",
      quiet: direction === "selected" ? null : "Advanced setup",
      quietTarget: "state/advanced",
      trust: "You can leave and resume after any browser or phone step.",
    };
  }

  function actions(direction, stage) {
    const resendWaitSeconds = Math.ceil(testResendWaitMs() / 1000);
    const primary = stage.primaryAction === "send-test"
      ? `<button class="pulse-setup__button" type="button" data-send-test ${resendWaitSeconds > 0 ? "disabled" : ""}>${resendWaitSeconds > 0 ? `Try again in ${resendWaitSeconds}s` : stage.primary}</button>`
      : stage.externalHref
      ? `<a class="pulse-setup__button" href="${stage.externalHref}">${stage.primary}</a>`
      : stage.external
        ? `<button class="pulse-setup__button" data-external>${stage.primary}</button>`
        : `<a class="pulse-setup__button" data-advance-target="${stage.target}" href="#/${direction}/${stage.target}">${stage.primary}</a>`;
    const secondary = !stage.secondary
      ? ""
      : stage.secondaryHref
        ? `<a class="pulse-setup__button pulse-setup__button--secondary" href="${stage.secondaryHref}">${stage.secondary}</a>`
        : `<a class="pulse-setup__button pulse-setup__button--secondary" ${stage.secondaryTarget === "state/test-not-received" ? "data-report-missing" : ""} href="#/${direction}/${stage.secondaryTarget}">${stage.secondary}</a>`;
    const quiet = stage.quiet
      ? `<a class="pulse-setup__button pulse-setup__button--quiet" href="#/${direction}/${stage.quietTarget}">${stage.quiet}</a>`
      : "";
    return `
      <div class="pulse-setup__stage-actions">
        <p class="pulse-setup__trust-note">${stage.trust}</p>
        <div class="pulse-setup__button-row">${quiet}${secondary}${primary}</div>
      </div>
    `;
  }

  function formActions(stage) {
    const isRunner = stage.form === "runner";
    return `
      <div class="pulse-setup__stage-actions">
        <p class="pulse-setup__trust-note">${stage.trust}</p>
        <div class="pulse-setup__button-row">
          ${isRunner ? '<button class="pulse-setup__button pulse-setup__button--secondary" type="button" data-edit-runner>Edit the address</button>' : ""}
          <button class="pulse-setup__button" type="submit" ${isRunner ? "data-runner-submit" : "data-existing-submit"}>${stage.primary}</button>
        </div>
      </div>
    `;
  }

  function stageMarkup(direction, step) {
    const stage = stageContent(step, direction);
    const previous = WORKFLOW_PREVIOUS[step];
    const back = previous
      ? `<a class="pulse-setup__workflow-back" data-workflow-back href="#/${direction}/${previous.target}">← Back to ${previous.label}</a>`
      : "";
    const markup = `
      <div class="pulse-setup__stage-main">
        ${back}
        ${transientNotice ? `<div class="pulse-setup__notice pulse-setup__notice--success pulse-setup__stage-notice" role="status"><strong>${escapeHtml(transientNotice)}</strong></div>` : ""}
        <p class="pulse-setup__eyebrow">${stage.eyebrow}</p>
        <h1 class="pulse-setup__heading">${stage.heading}</h1>
        <p class="pulse-setup__lede">${stage.lede}</p>
        ${stage.main}
      </div>
      ${stage.noActions || stage.form ? "" : actions(direction, stage)}
    `;
    return stage.form
      ? `<form data-${stage.form}-form novalidate>${markup}${formActions(stage)}</form>`
      : markup;
  }

  function readinessCards(direction, current) {
    const currentIndex = Math.max(
      0,
      STEPS.findIndex((step) => step.id === current),
    );
    const cards = [
      { id: "phone", label: "Phone", copy: "ntfy + Android", completeAt: 2 },
      { id: "runner", label: "Runner", copy: "Your cloud account", completeAt: 3 },
      { id: "delivery", label: "Secure delivery", copy: "Token stays off this Mac", completeAt: 5 },
      { id: "test", label: "Proof", copy: "Confirmed on phone", completeAt: 6 },
    ];
    return cards
      .map((card) => {
        const cardIndex = STEPS.findIndex((step) => step.id === card.id);
        const state = currentIndex > card.completeAt ? "is-complete" : currentIndex >= cardIndex ? "is-current" : "";
        const status = currentIndex > card.completeAt ? "Ready" : currentIndex >= cardIndex ? "In progress" : "Waiting";
        return `
          <a class="pulse-setup__readiness-card ${state}" href="#/${direction}/${card.id}">
            <span>${status}</span>
            <strong>${card.label}</strong>
            <small>${card.copy}</small>
          </a>
        `;
      })
      .join("");
  }

  function renderPrototype(directionId, stepId, recoveryId, selectedMode = false) {
    const direction = DIRECTIONS[directionId];
    const routeBase = selectedMode ? "selected" : directionId;
    const location = recoveryId ? `state/${recoveryId}` : stepId;
    const activeStep = recoveryId
      ? RECOVERY_STAGES[recoveryId] || "welcome"
      : stepId === "test-sent"
        ? "test"
        : PHONE_STEP_IDS.includes(stepId)
          ? "phone"
          : stepId === "existing"
            ? "pairing"
          : stepId;
    if (selectedMode && !recoveryId && stepId === "welcome") {
      return selectedWelcome(routeBase);
    }

    const top = selectedMode
      ? ""
      : `
      <div class="pulse-setup__prototype-top">
        <div>
          <p class="pulse-setup__eyebrow">${direction.label} · ${direction.name}</p>
          <p class="pulse-setup__card-title">${direction.thesis}</p>
        </div>
        ${directionSwitcher(directionId, location)}
      </div>
    `;
    const body = recoveryId ? recoveryMarkup(routeBase, recoveryId) : stageMarkup(routeBase, stepId);

    if (directionId === "board") {
      return `
        <section class="pulse-setup__prototype" aria-label="${direction.name} prototype">
          ${top}
          ${progress(activeStep)}
          <div class="pulse-setup__layout pulse-setup__layout--board">
            <div class="pulse-setup__board-header">
              <div class="pulse-setup__companion-intro">
                <p class="pulse-setup__eyebrow">Setup readiness</p>
                <h1 class="pulse-setup__heading">Make every part ready</h1>
              </div>
              <span class="pulse-setup__badge pulse-setup__badge--accent">Your accounts · your data</span>
            </div>
            <nav class="pulse-setup__readiness" aria-label="Setup areas">
              ${readinessCards(directionId, activeStep)}
            </nav>
            <div class="pulse-setup__board-work">
              <div class="pulse-setup__board-panel">${body}</div>
              <aside class="pulse-setup__board-side" aria-label="Setup context">
                <p class="pulse-setup__rail-title">Why this step matters</p>
                ${facts([
                  ["smartphone", "Phone", activeStep === "phone" ? "Active now" : "Progress stays visible"],
                  ["cloud", "Runner", "Owned by your cloud account"],
                  ["check", "Proof", "Human-confirmed delivery"],
                ])}
                <div class="pulse-setup__notice pulse-setup__notice--success">
                  <strong>Progress is saved</strong>
                  <p>Browser and phone detours do not erase completed work.</p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      `;
    }

    if (directionId === "companion") {
      const context = companionContext(activeStep, recoveryId, stepId);
      return `
        <section class="pulse-setup__prototype" aria-label="${direction.name} prototype">
          ${top}
          ${progress(activeStep)}
          <div class="pulse-setup__layout pulse-setup__layout--companion">
            <aside class="pulse-setup__companion" aria-label="Setup companion">
              <div>
                <p class="pulse-setup__eyebrow">${context.surface}</p>
                <h2 class="pulse-setup__subheading">${context.title}</h2>
                <p class="pulse-setup__body">${context.copy}</p>
              </div>
              ${companionList(routeBase, activeStep)}
              ${activeStep === "complete" ? "" : expertShortcuts(routeBase)}
            </aside>
            <div class="pulse-setup__companion-work">${body}</div>
          </div>
        </section>
      `;
    }

    return `
      <section class="pulse-setup__prototype" aria-label="${direction.name} prototype">
        ${top}
        ${progress(activeStep)}
        <div class="pulse-setup__layout pulse-setup__layout--journey">
          <aside class="pulse-setup__journey-rail" aria-label="Setup steps">
            <p class="pulse-setup__rail-title">Your setup</p>
            ${stepList(directionId, activeStep)}
          </aside>
          <div class="pulse-setup__stage">${body}</div>
        </div>
        ${stateBrowser(directionId)}
      </section>
    `;
  }

  function recoveryMarkup(direction, id) {
    const state = RECOVERY_STATES[id];
    const resendWaitSeconds = Math.ceil(testResendWaitMs() / 1000);
    const advancedRequirements =
      id === "advanced"
        ? `
          <section class="pulse-setup__advanced-requirements" aria-labelledby="advanced-requirements-title">
            <h2 id="advanced-requirements-title">Required before connecting</h2>
            <ul>
              <li><strong>Public HTTPS origin</strong><span>No redirects during pairing.</span></li>
              <li><strong>Persistent private storage</strong><span>Definitions, state, clients, and delivery secret survive restarts.</span></li>
              <li><strong>Always-on scheduler</strong><span>The runner checks due work while this Mac sleeps.</span></li>
              <li><strong>Pulse setup v1 pairing</strong><span>Origin-bound proof and per-device revocable credentials are mandatory.</span></li>
            </ul>
            <a class="pulse-setup__button pulse-setup__button--secondary pulse-setup__button--handoff" data-compatibility-contract href="../../docs/guided-byo-setup-plan.md#runner-compatibility-contract" target="_blank" rel="noreferrer">
              Open the runner compatibility contract ↗
            </a>
          </section>
        `
        : "";
    const primaryAction = state.primaryHref
      ? `<a class="pulse-setup__button" data-recovery-action data-action-kind="document" data-primary-recovery href="${state.primaryHref}" target="_blank" rel="noreferrer">${state.primary} ↗</a>`
      : state.primaryExternal
        ? `<button class="pulse-setup__button" data-recovery-action data-action-kind="external" data-primary-recovery data-external data-external-message="${state.primaryExternalMessage}">${state.primary} ↗</button>`
        : `<a class="pulse-setup__button" data-recovery-action data-action-kind="route" data-primary-recovery ${state.intentional ? `data-advance-target="${state.target}"` : ""} href="#/${direction}/${state.target}">${state.primary}</a>`;
    const secondaryAction = !state.secondary
      ? ""
      : state.secondaryAction === "resend-test"
        ? `<button class="pulse-setup__button pulse-setup__button--secondary" data-recovery-action data-action-kind="resend-test" data-resend-test ${resendWaitSeconds > 0 ? "disabled" : ""}>${resendWaitSeconds > 0 ? `Try again in ${resendWaitSeconds}s` : state.secondary}</button>`
      : state.secondaryAction === "cancel-handoff"
        ? `<button class="pulse-setup__button pulse-setup__button--secondary" data-recovery-action data-action-kind="cancel-handoff" data-cancel-handoff>${state.secondary}</button>`
      : state.secondaryExternal
        ? `<button class="pulse-setup__button pulse-setup__button--secondary" data-recovery-action data-action-kind="external" data-external data-external-message="${state.secondary} would open in your browser.">${state.secondary} ↗</button>`
        : `<a class="pulse-setup__button pulse-setup__button--secondary" data-recovery-action data-action-kind="route" href="#/${direction}/${state.secondaryTarget || state.target}">${state.secondary}</a>`;
    const stage = STEPS.find((step) => step.id === RECOVERY_STAGES[id]) || STEPS[0];
    const backTarget = state.intentional ? (id === "advanced" ? "runner" : "welcome") : RECOVERY_STAGES[id];
    return `
      <div class="pulse-setup__stage-main" data-recovery-state="${state.id}">
        <a class="pulse-setup__workflow-back" data-workflow-back href="#/${direction}/${backTarget}">← Back to ${state.intentional ? (id === "advanced" ? "Runner" : "Start") : stage.short}</a>
        <div class="pulse-setup__recovery">
          <div class="pulse-setup__recovery-hero">
            <span class="pulse-setup__recovery-icon" aria-hidden="true">${iconSvg(state.icon)}</span>
            <div>
              <p class="pulse-setup__eyebrow">${state.eyebrow}</p>
              <h1 class="pulse-setup__heading">${state.title}</h1>
              <p class="pulse-setup__lede">${state.summary}</p>
            </div>
          </div>
          <div class="pulse-setup__safe"><span aria-hidden="true">${iconSvg("check")}</span><strong>${state.safe}</strong></div>
          <div class="pulse-setup__card">
            <span class="pulse-setup__surface-label">What Pulse knows</span>
            <strong>${state.detail}</strong>
          </div>
          ${advancedRequirements}
        </div>
      </div>
      <div class="pulse-setup__stage-actions">
        <p class="pulse-setup__trust-note">${state.intentional ? "This path keeps the same verification and privacy requirements." : "Pulse keeps completed steps unless this repair requires repeating one."}</p>
        <div class="pulse-setup__button-row">
          ${state.restart ? `<button class="pulse-setup__button pulse-setup__button--quiet" data-open-restart data-restart-base="${direction}">Start over</button>` : ""}
          ${secondaryAction}
          ${primaryAction}
        </div>
      </div>
    `;
  }

  function stateBrowser(direction) {
    return `
      <nav class="pulse-setup__state-browser" aria-label="Recovery state catalog">
        ${Object.values(RECOVERY_STATES)
          .map((state) => `<a href="#/${direction}/state/${state.id}">${state.id.replaceAll("-", " ")}</a>`)
          .join("")}
      </nav>
    `;
  }

  function renderCompare() {
    return `
      <section class="pulse-setup__compare">
        <div class="pulse-setup__compare-intro">
          <p class="pulse-setup__eyebrow">G1 experience checkpoint</p>
          <h1 class="pulse-setup__display">Three honest ways to set up Pulse.</h1>
          <p class="pulse-setup__lede">
            Same secure provider-neutral system. Same realistic content, errors, resume, and handoffs.
            The choice is <strong>how the experience organizes the work</strong> on a Mac—not which color costume it wears.
          </p>
          <div class="pulse-setup__principles">
            <span class="pulse-setup__pill">Desktop first</span>
            <span class="pulse-setup__pill">No terminal</span>
            <span class="pulse-setup__pill">User-owned cost</span>
            <span class="pulse-setup__pill">Secrets stay native or cloud-side</span>
            <span class="pulse-setup__pill">Resume after every handoff</span>
          </div>
        </div>

        <div class="pulse-setup__direction-grid">
          ${Object.values(DIRECTIONS)
            .map(
              (direction) => `
                <article class="pulse-setup__direction">
                  <div class="pulse-setup__direction-head">
                    <p class="pulse-setup__direction-kicker">${direction.label}${direction.selected ? " · Selected" : ""}</p>
                    <h2 class="pulse-setup__subheading">${direction.name}</h2>
                    <div class="pulse-setup__mini pulse-setup__mini--${direction.id}" aria-hidden="true">
                      <span></span><span></span><span></span><span></span>
                    </div>
                  </div>
                  <div class="pulse-setup__direction-body">
                    <div>
                      <span class="pulse-setup__badge pulse-setup__badge--accent">${direction.thesis}</span>
                      <p>${direction.description}</p>
                    </div>
                    <dl class="pulse-setup__tradeoff">
                      <dt>Strongest</dt><dd>${direction.strength}</dd>
                      <dt>Tradeoff</dt><dd>${direction.tradeoff}</dd>
                      <dt>Best at</dt><dd>${direction.bestFor}</dd>
                    </dl>
                    <a class="pulse-setup__button" href="#/${direction.id}/welcome">
                      Explore ${direction.name.replace(" View", "")} →
                    </a>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>

        <section aria-labelledby="architecture-title">
          <p class="pulse-setup__eyebrow">Shared system truth</p>
          <h2 class="pulse-setup__subheading" id="architecture-title">The secure path does not change with the layout</h2>
          <div class="pulse-setup__architecture">
            <div><span>On Android</span><strong>Prepare ntfy</strong></div>
            <div><span>In your browser</span><strong>Deploy your runner</strong></div>
            <div><span>Inside Workshop</span><strong>Verify + pair</strong></div>
            <div><span>On your runner</span><strong>Save ntfy access</strong></div>
            <div><span>Back on Android</span><strong>Confirm the test</strong></div>
          </div>
        </section>
      </section>
    `;
  }

  function advanceSelectedSetup(location, patch = {}) {
    const current = route();
    if (!current.selectedMode) return;
    const stageIndex = ROUTE_STAGE_INDEX.get(location) ?? 0;
    const reachedNewCheckpoint = stageIndex >= setupState.furthestIndex;
    saveSetupState({
      lastRoute: reachedNewCheckpoint ? location : setupState.lastRoute,
      furthestIndex: Math.max(setupState.furthestIndex, stageIndex),
      ...patch,
    });
  }

  function validateRunnerOrigin(value) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return { ok: false, message: "Enter the runner’s full public HTTPS address." };
    }
    const rawHostname = parsed.hostname.toLowerCase();
    const hostname = rawHostname.replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
    const privateIpv4 = /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
    const privateIpv6 = /^(?:::|::1$|::ffff:|f[cd][0-9a-f:]*$|fe80:)/i;
    const reservedLocalName =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home") ||
      hostname.endsWith(".lan") ||
      hostname === "localtest.me" ||
      hostname.endsWith(".localtest.me");
    const singleLabelHostname = !hostname.includes(".") && !hostname.includes(":");
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !hostname ||
      reservedLocalName ||
      singleLabelHostname ||
      privateIpv4.test(hostname) ||
      privateIpv6.test(hostname) ||
      !["", "/"].includes(parsed.pathname) ||
      parsed.search ||
      parsed.hash
    ) {
      return {
        ok: false,
        message: "Use the runner’s public HTTPS origin only—no local address, path, password, query, or fragment.",
      };
    }
    return { ok: true, url: parsed };
  }

  function setFieldError(input, error, message) {
    input.setAttribute("aria-invalid", "true");
    error.hidden = false;
    error.textContent = message;
    input.focus();
  }

  function runnerNameFrom(url) {
    return url.hostname.split(".")[0] || "Pulse runner";
  }

  function routeBase() {
    const current = route();
    return current.selectedMode ? "selected" : current.direction;
  }

  function scheduleTransition(expectedHash, targetHash, onAccepted = null) {
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionExpectedHash = expectedHash;
    transitionTimer = window.setTimeout(() => {
      transitionTimer = null;
      transitionExpectedHash = null;
      if (window.location.hash !== expectedHash) return;
      onAccepted?.();
      window.location.hash = targetHash;
    }, 250);
  }

  function handleRunnerSubmit(form) {
    const input = form.querySelector("#runner-address");
    const error = form.querySelector("[data-runner-error]");
    const result = validateRunnerOrigin(input.value.trim());
    if (!result.ok) {
      setFieldError(input, error, result.message);
      return;
    }
    input.removeAttribute("aria-invalid");
    error.hidden = true;
    const submit = form.querySelector("[data-runner-submit]");
    submit.disabled = true;
    submit.textContent = "Verifying…";
    saveSetupState({
      runnerAddress: result.url.origin,
      runnerName: runnerNameFrom(result.url),
      runnerMayExist: true,
      runnerVerified: true,
      lastRoute: setupState.furthestIndex > 4 ? setupState.lastRoute : "delivery",
      furthestIndex: Math.max(setupState.furthestIndex, 4),
    });
    runnerDraftAddress = result.url.origin;
    const base = routeBase();
    scheduleTransition(`#/${base}/pairing`, `#/${base}/delivery`);
  }

  function handleExistingSubmit(form) {
    const address = form.querySelector("#existing-runner-address");
    const code = form.querySelector("#pairing-code");
    const error = form.querySelector("[data-existing-error]");
    const result = validateRunnerOrigin(address.value.trim());
    if (!address.value.trim() || !code.value.trim()) {
      setFieldError(!address.value.trim() ? address : code, error, "Enter both the runner address and pairing code.");
      return;
    }
    if (!result.ok) {
      setFieldError(address, error, result.message);
      return;
    }
    if (code.value.trim().toUpperCase() !== "DEMO-PAIR") {
      setFieldError(code, error, "This public prototype accepts DEMO-PAIR. A working setup validates the private ten-minute code.");
      return;
    }
    address.removeAttribute("aria-invalid");
    code.removeAttribute("aria-invalid");
    error.hidden = true;
    const submit = form.querySelector("[data-existing-submit]");
    submit.disabled = true;
    submit.textContent = "Connecting…";
    saveSetupState({
      runnerAddress: result.url.origin,
      runnerName: runnerNameFrom(result.url),
      runnerMayExist: true,
      runnerVerified: true,
      lastRoute: setupState.furthestIndex > 4 ? setupState.lastRoute : "delivery",
      furthestIndex: Math.max(setupState.furthestIndex, 4),
    });
    runnerDraftAddress = result.url.origin;
    const base = routeBase();
    scheduleTransition(`#/${base}/existing`, `#/${base}/delivery`);
  }

  function testResendWaitMs() {
    return Math.max(0, TEST_RESEND_COOLDOWN_MS - (Date.now() - setupState.lastTestSentAt));
  }

  function sendTest(button, { resend = false } = {}) {
    if (button.disabled) return;
    const waitMs = testResendWaitMs();
    if (waitMs > 0) {
      button.disabled = true;
      button.textContent = `Try again in ${Math.ceil(waitMs / 1000)}s`;
      return;
    }
    button.disabled = true;
    button.textContent = "Sending…";
    live.textContent = "Sending a setup test notification.";
    const base = routeBase();
    const source = resend ? `#/${base}/state/test-not-received` : `#/${base}/test`;
    scheduleTransition(source, `#/${base}/test-sent`, () => {
      saveSetupState({
        testAttempts: setupState.testAttempts + (resend ? 1 : 0),
        lastTestSentAt: Date.now(),
        lastRoute: setupState.furthestIndex > 5 ? setupState.lastRoute : "test-sent",
        furthestIndex: Math.max(setupState.furthestIndex, 5),
      });
    });
  }

  function openRestartDialog(trigger) {
    lastDialogTrigger = trigger;
    restartRouteBase = trigger.dataset.restartBase || "journey";
    restartHasRunner = setupState.runnerMayExist || setupState.runnerVerified;
    overlay.innerHTML = `
      <div class="pulse-setup__modal-backdrop">
        <section
          class="pulse-setup__modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-title"
          aria-describedby="restart-description"
        >
          <p class="pulse-setup__eyebrow">Before you restart</p>
          <h2 class="pulse-setup__subheading" id="restart-title">${restartHasRunner ? "Keep or abandon this runner setup?" : "Clear this setup progress?"}</h2>
          <p id="restart-description">
            ${
              restartHasRunner
                ? "Starting over removes setup from this Mac. A provider runner may remain in your account and use quota until you delete it there. Keep this setup if you still need its project address or deletion controls."
                : "Starting over removes the saved phone and setup progress from this Mac. No runner has been connected or left behind."
            }
          </p>
          <div class="pulse-setup__button-row">
            <button class="pulse-setup__button pulse-setup__button--secondary" data-cancel-restart>Keep this setup</button>
            <button class="pulse-setup__button pulse-setup__button--danger" data-confirm-restart>${restartHasRunner ? "Abandon local setup" : "Clear setup progress"}</button>
          </div>
        </section>
      </div>
    `;
    frame.inert = true;
    overlay.querySelector("[data-cancel-restart]")?.focus();
  }

  function closeRestartDialog({ restoreFocus = true } = {}) {
    overlay.innerHTML = "";
    frame.inert = false;
    if (restoreFocus) lastDialogTrigger?.focus();
    lastDialogTrigger = null;
  }

  function clearToast() {
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = null;
    document.querySelector(".pulse-setup__toast")?.remove();
    live.textContent = "";
  }

  function showToast(message) {
    clearToast();
    const toast = document.createElement("div");
    toast.className = "pulse-setup__toast";
    toast.setAttribute("aria-hidden", "true");
    toast.textContent = message;
    document.body.append(toast);
    live.textContent = message;
    toastTimer = window.setTimeout(clearToast, 4000);
  }

  function render() {
    if (transitionTimer !== null && window.location.hash !== transitionExpectedHash) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
      transitionExpectedHash = null;
    }
    if (cooldownTimer !== null) window.clearTimeout(cooldownTimer);
    cooldownTimer = null;
    let current = route();
    if (current.view === "redirect") {
      window.history.replaceState(null, "", `#/${current.target}`);
      current = route();
    }
    clearToast();
    const compareLink = document.querySelector(".pulse-setup__compare-link");
    const brandContext = document.querySelector(".pulse-setup__brand small");
    if (compareLink) compareLink.hidden = Boolean(current.selectedMode);
    if (brandContext) brandContext.textContent = current.selectedMode ? "Pulse" : "Pulse setup study";
    root.innerHTML =
      current.view === "compare"
        ? renderCompare()
        : renderPrototype(current.direction, current.step, current.state, current.selectedMode);
    root.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if ((current.state === "test-not-received" || current.step === "test") && testResendWaitMs() > 0) {
      cooldownTimer = window.setTimeout(render, Math.min(1_000, testResendWaitMs() + 25));
    }
    transientNotice = "";
  }

  document.addEventListener("click", (event) => {
    const skip = event.target.closest("[data-skip-setup]");
    if (skip) {
      event.preventDefault();
      root.focus({ preventScroll: true });
      return;
    }
    const editRunner = event.target.closest("[data-edit-runner]");
    if (editRunner) {
      const input = document.querySelector("#runner-address");
      input?.focus();
      input?.select();
      return;
    }
    const initialTest = event.target.closest("[data-send-test]");
    if (initialTest) {
      event.preventDefault();
      sendTest(initialTest);
      return;
    }
    const resend = event.target.closest("[data-resend-test]");
    if (resend) {
      event.preventDefault();
      sendTest(resend, { resend: true });
      return;
    }
    const reportMissing = event.target.closest("[data-report-missing]");
    if (reportMissing) {
      saveSetupState({
        lastRoute: "state/test-not-received",
        furthestIndex: Math.min(setupState.furthestIndex, 5),
        deliveryConfirmed: false,
      });
    }
    const advance = event.target.closest("[data-advance-target]");
    if (advance) {
      const target = advance.dataset.advanceTarget;
      const patch = {};
      if (target === "pairing") patch.runnerMayExist = true;
      if (target === "test") patch.deliveryReady = true;
      if (target === "complete") patch.deliveryConfirmed = true;
      advanceSelectedSetup(target, patch);
    }
    if (event.target.closest("[data-runner-handoff]")) {
      saveSetupState({ runnerMayExist: true });
    }
    const external = event.target.closest("[data-external]");
    if (external) {
      event.preventDefault();
      const detail =
        external.dataset.externalMessage || `${external.textContent.replace("↗", "").trim()} would open outside Workshop.`;
      showToast(`Prototype handoff simulated: ${detail} Your safe setup progress remains on this Mac.`);
      return;
    }
    const restart = event.target.closest("[data-open-restart]");
    if (restart) {
      openRestartDialog(restart);
      return;
    }
    if (event.target.closest("[data-cancel-handoff]")) {
      saveSetupState({ runnerMayExist: setupState.runnerVerified });
      transientNotice = "Provider handoff canceled. No runner was connected.";
      window.location.hash = `#/${routeBase()}/runner`;
      return;
    }
    if (event.target.closest("[data-cancel-restart]")) {
      closeRestartDialog();
      return;
    }
    if (event.target.closest("[data-confirm-restart]")) {
      const base = restartRouteBase;
      const hadRunner = restartHasRunner;
      closeRestartDialog({ restoreFocus: false });
      clearSetupState();
      clearToast();
      transientNotice = hadRunner
        ? "Local setup removed. Your provider runner was not deleted and may continue using quota."
        : "Local setup progress removed. No runner was created or left behind.";
      window.location.hash = `#/${base}/welcome`;
      render();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("#runner-address, #existing-runner-address")) {
      runnerDraftAddress = event.target.value;
      event.target.removeAttribute("aria-invalid");
      const error = document.querySelector(
        event.target.matches("#existing-runner-address") ? "[data-existing-error]" : "[data-runner-error]",
      );
      if (error) error.hidden = true;
    }
    if (event.target.matches("#pairing-code")) {
      event.target.removeAttribute("aria-invalid");
      const error = document.querySelector("[data-existing-error]");
      if (error) error.hidden = true;
    }
  });

  document.addEventListener("submit", (event) => {
    const runnerForm = event.target.closest("[data-runner-form]");
    if (runnerForm) {
      event.preventDefault();
      handleRunnerSubmit(runnerForm);
      return;
    }
    const existingForm = event.target.closest("[data-existing-form]");
    if (existingForm) {
      event.preventDefault();
      handleExistingSubmit(existingForm);
    }
  });

  document.addEventListener("keydown", (event) => {
    const dialog = overlay.querySelector("[role='dialog']");
    if (event.key === "Tab" && dialog) {
      const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.key === "Escape" && dialog) {
      event.preventDefault();
      closeRestartDialog();
    }
  });

  window.addEventListener("hashchange", render);
  render();
})();
