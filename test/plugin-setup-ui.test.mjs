import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", { pretendToBeVisual: true, url: "https://workshop.test" });
  const previous = { window: globalThis.window, document: globalThis.document, customEvent: globalThis.CustomEvent, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { dom, previous };
}

function button(document, label) {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.trim().includes(label));
  assert.ok(found, `button ${label} should exist`);
  return found;
}

function setInput(input, value) {
  Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

test("G5 mounted production wizard completes the guided path without exposing credentials", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const calls = [];
  const connected = [];
  const pending = {
    version: 1,
    setupId: "setup_fixture",
    serviceId: "pulse-runner",
    configFile: "pulse.config.json",
    installationId: "installation_fixture",
    publicKey: "MCowBQYDK2VwAyEAfixturePublicKeyMaterial000000000",
    fingerprint: "AA:BB:CC:DD:EE:FF:00:11",
    suggestedTopic: "pulse_fixture_topic_4e5c9be5d99347d8a4394e2c",
    state: "welcome",
  };
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === "begin_managed_secure_service_setup") return { ...pending };
    if (command === "update_managed_secure_service_setup") return { ...pending, state: args.state };
    if (command === "complete_managed_secure_service_setup") return { version: 1, endpoint: args.endpoint, credentialRef: "redacted-reference" };
    if (command === "read_managed_secure_service_metadata") return { version: 1, endpoint: "https://pulse-fixture.example", credentialRef: "redacted-reference" };
    if (command === "request_managed_secure_service") return { status: 202, body: { accepted: true } };
    if (command === "open_managed_secure_service_handoff") return { opened: true };
    if (command === "open_external_url") return undefined;
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, onConnected: (requester) => connected.push(requester), onManualSetup: () => {} })); });
    assert.match(dom.window.document.body.textContent, /Set up Pulse without becoming its sysadmin/);

    await act(async () => { button(dom.window.document, "Set up Pulse").click(); });
    assert.match(dom.window.document.body.textContent, /Sign into ntfy on your Android phone/);
    await act(async () => { button(dom.window.document, "Open ntfy account").click(); });
    await act(async () => { button(dom.window.document, "My ntfy user is saved").click(); });
    assert.match(dom.window.document.body.textContent, /Reserve the private topic/);
    assert.match(dom.window.document.body.textContent, new RegExp(pending.suggestedTopic));
    await act(async () => { button(dom.window.document, "Back").click(); });
    assert.match(dom.window.document.body.textContent, /Sign into ntfy/);
    await act(async () => { button(dom.window.document, "My ntfy user is saved").click(); });
    await act(async () => { button(dom.window.document, "My topic is already reserved").click(); });
    await act(async () => { button(dom.window.document, "Open ntfy for Android").click(); });
    await act(async () => { button(dom.window.document, "Pulse appears in my topics").click(); });
    await act(async () => { button(dom.window.document, "Open ntfy account").click(); });
    await act(async () => { button(dom.window.document, "I created the runner token").click(); });
    await act(async () => { button(dom.window.document, "Quick setup with Netlify").click(); });
    await act(async () => { button(dom.window.document, "Open Netlify deployment").click(); });
    const netlifyCall = calls.find((call) => call.command === "open_external_url" && call.args.url.includes("app.netlify.com"));
    assert.ok(netlifyCall);
    assert.match(netlifyCall.args.url, /#PULSE_SETUP_PUBLIC_KEY=/);
    assert.doesNotMatch(netlifyCall.args.url, /token|credential|secret/i);
    await act(async () => { button(dom.window.document, "I finished the deployment").click(); });

    const origin = dom.window.document.querySelector('[aria-label="Pulse runner site address"]');
    await act(async () => { setInput(origin, "https://pulse-fixture.example"); });
    await act(async () => { origin.closest("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.match(dom.window.document.body.textContent, /Give your runner access to ntfy/);
    assert.equal([...dom.window.document.querySelectorAll("button")].some((item) => item.textContent.includes("Start over")), false, "a completed pairing cannot be falsely reset from the webview");
    assert.equal([...dom.window.document.querySelectorAll("button")].some((item) => item.textContent.includes("Back")), false, "the first post-pair step has no dead pre-pair destination");
    await act(async () => { button(dom.window.document, "Open my secure runner page").click(); });
    await act(async () => { button(dom.window.document, "I saved ntfy access").click(); });
    await act(async () => { button(dom.window.document, "Back").click(); });
    assert.match(dom.window.document.body.textContent, /Give your runner access to ntfy/);
    await act(async () => { button(dom.window.document, "I saved ntfy access").click(); });
    await act(async () => { button(dom.window.document, "Send test notification").click(); });
    assert.match(dom.window.document.body.textContent, /Test sent/);
    await act(async () => { button(dom.window.document, "I got it").click(); });
    assert.match(dom.window.document.body.textContent, /Pulse is ready/);
    await act(async () => { button(dom.window.document, "Create my first reminder").click(); });
    assert.equal(connected.length, 1);
    assert.equal(typeof connected[0], "function");

    const serializedCalls = JSON.stringify(calls);
    assert.doesNotMatch(serializedCalls, /ntfy[_ -]?token|authorization|bearer|privateKey/i);
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G5 runner origin validation rejects local, path-bearing, and credentialed addresses", async () => {
  const { normalizeRunnerOrigin } = await import("../plugin/dist/index.js");
  assert.equal(normalizeRunnerOrigin("https://runner.example/"), "https://runner.example");
  for (const unsafe of ["http://runner.example", "https://localhost", "https://runner.example/api", "https://user:pass@runner.example"]) {
    assert.throws(() => normalizeRunnerOrigin(unsafe), /HTTPS site address/i);
  }
});

test("G5 guided handoffs lead with the required action and reveal confirmation after it opens", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const pending = {
    version: 1,
    setupId: "setup_handoff",
    serviceId: "pulse-runner",
    configFile: "pulse.config.json",
    installationId: "installation_handoff",
    publicKey: "MCowBQYDK2VwAyEAhandoffPublicKeyMaterial000000000",
    fingerprint: "AA:BB:CC:DD:EE:FF:00:11",
    suggestedTopic: "pulse_handoff_topic",
    state: "runner-deploy",
  };
  const invoke = async (command, args) => {
    if (command === "open_external_url") return undefined;
    if (command === "update_managed_secure_service_setup") return { ...pending, state: args.state };
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, restored: pending, initialState: "runner-deploy", onConnected: () => {}, onManualSetup: () => {} })); });
    let actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["Open Netlify deployment", "I already finished the deployment"]);
    assert.equal(actions[0].classList.contains("pulse-ui__button--primary"), true);
    assert.ok(actions[0].querySelector("svg"), "the external handoff uses the shared vector icon");

    await act(async () => { actions[0].click(); });
    actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["I finished the deployment", "Open Netlify again"]);
    assert.equal(actions[0].classList.contains("pulse-ui__button--primary"), true);
    assert.match(dom.window.document.querySelector("[role='status']").textContent, /Finish the deployment there, then return to Workshop/i);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G5 phone and secret steps put open or copy actions before completion claims", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const opened = [];
  const invoke = async (command, args) => {
    if (command === "open_external_url" || command === "open_managed_secure_service_handoff") {
      opened.push({ command, args });
      return command === "open_managed_secure_service_handoff" ? { opened: true } : undefined;
    }
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  const render = async (initialState) => {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { key: initialState, invoke, initialState, onConnected: () => {}, onManualSetup: () => {} })); });
  };
  try {
    await render("phone-user");
    let actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["Open ntfy account", "My ntfy user is already saved"]);
    assert.ok(actions[0].querySelector("svg"));

    await render("phone-topic");
    actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["Copy topic", "My topic is already reserved"]);

    await render("delivery-secret");
    actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["Open my secure runner page", "I already saved ntfy access"]);
    await act(async () => { actions[0].click(); });
    actions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(actions.map((candidate) => candidate.textContent.trim()), ["I saved ntfy access", "Open the secure page again"]);
    assert.equal(opened.at(-1).command, "open_managed_secure_service_handoff");
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G5 wizard advances or resets only after Workshop persists the transition", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const pending = {
    version: 1,
    setupId: "setup_transaction",
    serviceId: "pulse-runner",
    configFile: "pulse.config.json",
    installationId: "installation_transaction",
    publicKey: "MCowBQYDK2VwAyEAtransactionPublicKeyMaterial00000",
    fingerprint: "AA:11:BB:22:CC:33:DD:44",
    suggestedTopic: "pulse_transaction_topic_4e5c9be5d99347d8a4",
    state: "welcome",
  };
  const invoke = async (command, args) => {
    if (command === "begin_managed_secure_service_setup") return pending;
    if (command === "update_managed_secure_service_setup") {
      if (args.state === "phone-user") return { ...pending, state: args.state };
      throw new Error("Native progress save failed.");
    }
    if (command === "cancel_managed_secure_service_setup") throw new Error("Native setup cancel failed.");
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, onConnected: () => {}, onManualSetup: () => {} })); });
    await act(async () => { button(dom.window.document, "Set up Pulse").click(); });
    assert.match(dom.window.document.body.textContent, /Sign into ntfy/);

    await act(async () => {
      button(dom.window.document, "My ntfy user is already saved").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(dom.window.document.body.textContent, /Sign into ntfy/);
    assert.match(dom.window.document.querySelector("[role='alert']").textContent, /progress save failed/i);

    const resetTrigger = button(dom.window.document, "Start over");
    resetTrigger.focus();
    await act(async () => { resetTrigger.click(); });
    assert.match(dom.window.document.querySelector("[role='dialog']").textContent, /Your ntfy account, provider account, and any runner deployment/i);
    assert.equal(dom.window.document.activeElement.textContent.trim(), "Keep this setup");
    const dialogButtons = [...dom.window.document.querySelectorAll("[role='dialog'] button")];
    await act(async () => { dialogButtons[0].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    assert.equal(dom.window.document.activeElement.textContent.trim(), "Clear setup progress");
    await act(async () => { dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    assert.equal(dom.window.document.activeElement.textContent.trim(), "Keep this setup");
    await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
    assert.equal(dom.window.document.querySelector("[role='dialog']"), null);
    assert.equal(dom.window.document.activeElement, resetTrigger);
    await act(async () => { resetTrigger.click(); });
    await act(async () => {
      button(dom.window.document, "Clear setup progress").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(dom.window.document.body.textContent, /Sign into ntfy/);
    assert.match(dom.window.document.querySelector("[role='dialog'] [role='alert']").textContent, /setup cancel failed/i);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G5 existing-installation setup cancels its native one-time record before returning to welcome", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const calls = [];
  const pending = {
    version: 1, setupId: "setup_existing", serviceId: "pulse-runner", configFile: "pulse.config.json",
    installationId: "installation_existing", publicKey: "fixture-public-key", fingerprint: "AA:BB",
    suggestedTopic: "fixture-existing-topic", state: "existing",
  };
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === "begin_managed_secure_service_setup") return pending;
    if (command === "update_managed_secure_service_setup") return { ...pending, state: args.state };
    if (command === "cancel_managed_secure_service_setup") return undefined;
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, onConnected: () => {}, onManualSetup: () => {} })); });
    await act(async () => {
      button(dom.window.document, "Connect an existing Pulse").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(dom.window.document.body.textContent, /installation_existing/);
    const copyInstallation = button(dom.window.document, "Copy installation id");
    assert.ok(copyInstallation.querySelector("svg"));
    await act(async () => { button(dom.window.document, "Back").click(); });
    assert.equal(calls.some((call) => call.command === "cancel_managed_secure_service_setup"), false, "Back cannot silently invalidate a one-time deployment key");
    assert.match(dom.window.document.querySelector("[role='dialog']").textContent, /will no longer pair/i);
    await act(async () => {
      button(dom.window.document, "Clear setup progress").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.match(dom.window.document.body.textContent, /Set up Pulse without becoming its sysadmin/);
    assert.ok(calls.some((call) => call.command === "cancel_managed_secure_service_setup" && call.args.setupId === pending.setupId));
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G5 setup notification tests are single-flight under duplicate activation", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  let resolveRequest;
  const pendingRequest = new Promise((resolve) => { resolveRequest = resolve; });
  let sends = 0;
  const invoke = async (command, args) => {
    if (command === "read_managed_secure_service_metadata") return { version: 1, endpoint: "https://pulse-fixture.example", credentialRef: "redacted-reference" };
    if (command === "request_managed_secure_service") {
      assert.equal(args.request.path, "/api/setup/test-notification");
      sends += 1;
      return pendingRequest;
    }
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, initialState: "delivery-test", onConnected: () => {}, onManualSetup: () => {} })); });
    assert.deepEqual([...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")].map((candidate) => candidate.textContent.trim()), ["Send test notification"]);
    const send = button(dom.window.document, "Send test notification");
    await act(async () => { send.click(); send.click(); });
    assert.equal(sends, 1);
    assert.equal(send.disabled, true);
    await act(async () => { resolveRequest({ status: 202, body: { accepted: true } }); await pendingRequest; });
    assert.match(dom.window.document.body.textContent, /Test sent/);
    const sentActions = [...dom.window.document.querySelectorAll(".pulse-ui__setup-actions button")];
    assert.deepEqual(sentActions.map((candidate) => candidate.textContent.trim()), ["I got it", "Send one more test"]);
    assert.equal(sentActions[0].classList.contains("pulse-ui__button--primary"), true);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G6 migration pairs the existing runner without replacing reminder data or exposing a secret", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const calls = [];
  const connected = [];
  const pending = {
    version: 1, setupId: "setup_migration", serviceId: "pulse-runner", configFile: "pulse.config.json",
    installationId: "installation_migration", publicKey: "MCowBQYDK2VwAyEAmigrationPublicKeyMaterial000000000",
    fingerprint: "11:22:33:44:55:66:77:88", suggestedTopic: "unused_migration_topic", state: "migration",
  };
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === "begin_managed_secure_service_setup") return pending;
    if (command === "update_managed_secure_service_setup") return { ...pending, state: args.state };
    if (command === "complete_managed_secure_service_setup") return { version: 1, endpoint: args.endpoint, credentialRef: "redacted-reference" };
    if (command === "read_managed_secure_service_metadata") return { version: 1, endpoint: "https://existing-pulse.example", credentialRef: "redacted-reference" };
    if (command === "open_external_url") return undefined;
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, initialState: "migration", onConnected: (requester) => connected.push(requester), onManualSetup: () => {} })); });
    assert.match(dom.window.document.body.textContent, /Move this Mac to Workshop-managed access/);
    assert.match(dom.window.document.body.textContent, /update this deployment to the current Pulse release/i);
    assert.match(dom.window.document.body.textContent, /sync that fork with the upstream Pulse repository/i);
    assert.match(dom.window.document.body.textContent, /does not replace reminders, history, ntfy access/i);
    assert.match(dom.window.document.body.textContent, new RegExp(pending.publicKey));
    const origin = dom.window.document.querySelector('[aria-label="Existing Pulse site address for migration"]');
    await act(async () => { setInput(origin, "https://existing-pulse.example"); });
    await act(async () => { origin.closest("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(connected.length, 1);
    assert.ok(calls.some((call) => call.command === "complete_managed_secure_service_setup" && call.args.endpoint === "https://existing-pulse.example"));
    assert.doesNotMatch(JSON.stringify(calls), /ntfy[_ -]?token|authorization|bearer|privateKey/i);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("G6 migration shows the native verification gate instead of hiding a Tauri string rejection", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseSetupWizard } = await import("../plugin/dist/index.js");
  const pending = {
    version: 1, setupId: "setup_migration_error", serviceId: "pulse-runner", configFile: "pulse.config.json",
    installationId: "installation_migration_error", publicKey: "MCowBQYDK2VwAyEAmigrationErrorPublicKeyMaterial0000",
    fingerprint: "11:22:33:44:55:66:77:88", suggestedTopic: "unused_migration_topic", state: "migration",
  };
  const invoke = async (command, args) => {
    if (command === "begin_managed_secure_service_setup") return pending;
    if (command === "update_managed_secure_service_setup") return { ...pending, state: args.state };
    if (command === "complete_managed_secure_service_setup") {
      throw "Managed secure service manifest is invalid.";
    }
    throw new Error(`Unexpected command ${command}`);
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(PulseSetupWizard, { invoke, initialState: "migration", onConnected: () => {}, onManualSetup: () => {} })); });
    const origin = dom.window.document.querySelector('[aria-label="Existing Pulse site address for migration"]');
    await act(async () => { setInput(origin, "https://existing-pulse.example"); });
    await act(async () => { origin.closest("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.match(dom.window.document.body.textContent, /Workshop stopped during runner verification: Managed secure service manifest is invalid\. Your previous connection is unchanged\./);
    assert.doesNotMatch(dom.window.document.body.textContent, /Workshop could not verify the updated runner/);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
