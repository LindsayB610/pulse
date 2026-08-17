import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const htmlUrl = new URL("../design/onboarding-prototype/index.html", import.meta.url);
const scriptUrl = new URL("../design/onboarding-prototype/onboarding.js", import.meta.url);

async function prototype(route = "selected/welcome", storedState = null, { preview = true } = {}) {
  const [html, script] = await Promise.all([readFile(htmlUrl, "utf8"), readFile(scriptUrl, "utf8")]);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: `http://pulse.test/${preview ? "?audit=1" : ""}#/${route}`,
  });
  if (storedState !== null) {
    dom.window.localStorage.setItem("pulse.setup.prototype", JSON.stringify(storedState));
  }
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(script);
  return dom;
}

function navigate(dom, route) {
  dom.window.location.hash = `#/${route}`;
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
}

function submit(dom, form) {
  form.dispatchEvent(new dom.window.SubmitEvent("submit", { bubbles: true, cancelable: true }));
}

const wait = (milliseconds = 350) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("G1 skip link focuses setup without escaping the selected journey", async () => {
  const dom = await prototype("selected/phone");
  try {
    const skip = dom.window.document.querySelector("[data-skip-setup]");
    skip.click();
    assert.equal(dom.window.location.hash, "#/selected/phone");
    assert.equal(dom.window.document.activeElement.id, "setup-root");
    assert.match(dom.window.document.querySelector("h1")?.textContent ?? "", /Add your ntfy account/);
  } finally {
    dom.window.close();
  }
});

test("G1 runner verification rejects unsafe origins, preserves correction, and derives connected identity", async () => {
  const dom = await prototype("selected/pairing");
  const { document } = dom.window;
  try {
    const form = document.querySelector("[data-runner-form]");
    const input = document.querySelector("#runner-address");
    for (const unsafeOrigin of [
      "not a website",
      "http://pulse.example",
      "https://localhost:8888",
      "https://pulse",
      "https://0.0.0.0",
      "https://127.0.0.1",
      "https://100.64.0.1",
      "https://[::]",
      "https://[::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:10.0.0.1]",
      "https://localhost.",
      "https://device.local.",
      "https://foo.localhost",
      "https://metadata.google.internal",
      "https://localtest.me",
      "https://user:password@pulse.example",
      "https://pulse.example/api",
      "https://pulse.example?token=oops#fragment",
    ]) {
      input.value = unsafeOrigin;
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      submit(dom, form);
      assert.equal(dom.window.location.hash, "#/selected/pairing", unsafeOrigin);
      assert.equal(input.getAttribute("aria-invalid"), "true", unsafeOrigin);
      assert.equal(document.activeElement, input, unsafeOrigin);
    }
    assert.match(document.querySelector("[data-runner-error]")?.textContent ?? "", /public HTTPS/i);

    navigate(dom, "selected/runner");
    navigate(dom, "selected/pairing");
    assert.equal(document.querySelector("#runner-address")?.value, "https://pulse.example?token=oops#fragment");
    assert.doesNotMatch(
      dom.window.localStorage.getItem("pulse.setup.prototype") ?? "",
      /token=oops|fragment/,
      "unvalidated URL material never enters browser storage",
    );

    const validInput = document.querySelector("#runner-address");
    validInput.value = "https://pulse-acorn.example";
    validInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    submit(dom, document.querySelector("[data-runner-form]"));
    assert.match(document.querySelector("[data-runner-submit]")?.textContent ?? "", /Verifying/);
    assert.equal(document.querySelector("[data-runner-submit]")?.disabled, true);
    await wait();

    assert.equal(dom.window.location.hash, "#/selected/delivery");
    assert.match(document.body.textContent, /pulse-acorn/);
  } finally {
    dom.window.close();
  }
});

test("G1 selected routes cannot manufacture progress or completion", async () => {
  const dom = await prototype("selected/complete/extra", null, { preview: false });
  try {
    assert.equal(dom.window.location.hash, "#/selected/welcome");
    assert.match(dom.window.document.querySelector("h1")?.textContent ?? "", /get Pulse working/i);
    assert.doesNotMatch(dom.window.document.body.textContent, /Pulse is ready/);

    navigate(dom, "selected/state/test-rejected");
    assert.equal(dom.window.location.hash, "#/selected/welcome");
    assert.equal(dom.window.document.querySelector("[data-resume-setup]"), null);

    for (const inherited of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      navigate(dom, `selected/state/${inherited}`);
      assert.equal(dom.window.location.hash, "#/selected/welcome", inherited);
      assert.doesNotMatch(dom.window.document.body.textContent, /undefined|native code/i, inherited);
    }
  } finally {
    dom.window.close();
  }
});

test("G1 setup progress advances only through successful user actions", async () => {
  const dom = await prototype("selected/welcome", null, { preview: false });
  const { document } = dom.window;
  try {
    document.querySelector("[data-primary-start]").click();
    await wait(0);
    assert.equal(dom.window.location.hash, "#/selected/phone");
    navigate(dom, "selected/complete");
    assert.equal(dom.window.location.hash, "#/selected/phone");

    navigate(dom, "selected/welcome");
    assert.match(document.querySelector("[data-resume-setup]")?.textContent ?? "", /Continue at Phone/);
    assert.match(document.body.textContent, /2 of 7/);
  } finally {
    dom.window.close();
  }
});

test("G1 reporting a missing test revokes Ready until delivery is reconfirmed", async () => {
  const dom = await prototype(
    "selected/test-sent",
    {
      lastRoute: "complete",
      furthestIndex: 6,
      runnerAddress: "https://pulse-ready.example",
      runnerName: "pulse-ready",
      runnerMayExist: true,
      runnerVerified: true,
      deliveryReady: true,
      deliveryConfirmed: true,
      testAttempts: 1,
      lastTestSentAt: Date.now() - 60_000,
    },
    { preview: false },
  );
  try {
    dom.window.document.querySelector("[data-report-missing]").click();
    await wait(20);
    assert.equal(dom.window.location.hash, "#/selected/state/test-not-received");
    assert.equal(
      [...dom.window.document.querySelectorAll(".pulse-setup__companion-list a")].some((link) => /Ready/.test(link.textContent ?? "")),
      false,
    );
    navigate(dom, "selected/complete");
    assert.equal(dom.window.location.hash, "#/selected/state/test-not-received");
    assert.doesNotMatch(dom.window.document.body.textContent, /Pulse is ready/);
  } finally {
    dom.window.close();
  }
});

test("G1 unvalidated runner drafts stay in memory only", async () => {
  const dom = await prototype(
    "selected/pairing",
    {
      lastRoute: "pairing",
      furthestIndex: 3,
      runnerAddress: "https://pulse-safe.example",
      runnerName: "pulse-safe",
      runnerMayExist: true,
      runnerVerified: false,
      deliveryReady: false,
      deliveryConfirmed: false,
      testAttempts: 0,
      lastTestSentAt: 0,
    },
    { preview: false },
  );
  const { document } = dom.window;
  try {
    const input = document.querySelector("#runner-address");
    input.value = "https://alice:super-secret@pulse.example/path?token=oops#fragment";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    navigate(dom, "selected/runner");
    navigate(dom, "selected/pairing");
    assert.match(document.querySelector("#runner-address")?.value ?? "", /super-secret/);
    assert.doesNotMatch(dom.window.localStorage.getItem("pulse.setup.prototype") ?? "", /super-secret|token=oops/);

    dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
    const persisted = JSON.parse(dom.window.localStorage.getItem("pulse.setup.prototype") ?? "{}");
    assert.equal(persisted.runnerAddress, "https://pulse-safe.example");
  } finally {
    dom.window.close();
  }
});

test("G1 corrupted browser state cannot inject a route or break the setup doorway", async () => {
  const dom = await prototype("selected/welcome", {
    lastRoute: 'pairing\" onmouseover=\"alert(1)',
    furthestIndex: 999,
    runnerAddress: { unexpected: true },
    runnerName: "<script>bad()</script>",
    testAttempts: "many",
    pairingCode: "must-not-survive",
  });
  try {
    assert.equal(dom.window.document.querySelector("[data-resume-setup]"), null);
    assert.match(dom.window.document.querySelector("h1")?.textContent ?? "", /get Pulse working/i);
    assert.doesNotMatch(dom.window.document.documentElement.innerHTML, /onmouseover=|must-not-survive/);
  } finally {
    dom.window.close();
  }
});

test("G1 resume accepts only real setup routes from browser storage", async () => {
  const dom = await prototype("selected/welcome", {
    lastRoute: "state/not-a-real-state",
    furthestIndex: 4,
    runnerAddress: "https://pulse-safe.example",
    runnerName: "pulse-safe",
    testAttempts: 0,
  });
  try {
    assert.equal(dom.window.document.querySelector("[data-resume-setup]"), null);
    assert.doesNotMatch(dom.window.document.documentElement.innerHTML, /not-a-real-state/);
  } finally {
    dom.window.close();
  }
});

test("G1 legacy progress cannot claim a runner or Ready without matching proof flags", async () => {
  const dom = await prototype(
    "selected/welcome",
    {
      lastRoute: "complete",
      furthestIndex: 6,
      runnerAddress: "https://pulse-unproven.example",
      runnerName: "pulse-unproven",
      testAttempts: 8,
      lastTestSentAt: Date.now(),
    },
    { preview: false },
  );
  try {
    assert.match(dom.window.document.querySelector("[data-resume-setup]")?.textContent ?? "", /Continue at Runner/);
    assert.doesNotMatch(dom.window.document.body.textContent, /Pulse is ready|Runner connected/i);
    const persisted = JSON.parse(dom.window.localStorage.getItem("pulse.setup.prototype") ?? "{}");
    assert.deepEqual(
      {
        lastRoute: persisted.lastRoute,
        furthestIndex: persisted.furthestIndex,
        runnerMayExist: persisted.runnerMayExist,
        runnerVerified: persisted.runnerVerified,
        deliveryReady: persisted.deliveryReady,
        deliveryConfirmed: persisted.deliveryConfirmed,
      },
      {
        lastRoute: "runner",
        furthestIndex: 2,
        runnerMayExist: false,
        runnerVerified: false,
        deliveryReady: false,
        deliveryConfirmed: false,
      },
    );
  } finally {
    dom.window.close();
  }
});

test("G1 existing-Pulse setup collects and validates the promised one-time pairing code", async () => {
  const dom = await prototype("selected/state/existing-installation");
  const { document } = dom.window;
  try {
    assert.equal(document.querySelector("[data-primary-recovery]")?.getAttribute("href"), "#/selected/existing");
    navigate(dom, "selected/existing");
    assert.ok(document.querySelector("[data-existing-form]"));
    assert.ok(document.querySelector("#existing-runner-address"));
    assert.ok(document.querySelector("#pairing-code"));
    submit(dom, document.querySelector("[data-existing-form]"));
    assert.match(document.querySelector("[data-existing-error]")?.textContent ?? "", /runner address and pairing code/i);

    document.querySelector("#existing-runner-address").value = "https://pulse-oak.example";
    document
      .querySelector("#existing-runner-address")
      .dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    document.querySelector("#pairing-code").value = "temporary-secret";
    document.querySelector("#pairing-code").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(document.querySelector("[data-existing-error]")?.hidden, true);
    navigate(dom, "selected/welcome");
    navigate(dom, "selected/existing");
    assert.equal(document.querySelector("#existing-runner-address")?.value, "https://pulse-oak.example");
    assert.equal(document.querySelector("#pairing-code")?.value, "");

    document.querySelector("#pairing-code").value = "DEMO-PAIR";
    submit(dom, document.querySelector("[data-existing-form]"));
    assert.match(document.querySelector("[data-existing-submit]")?.textContent ?? "", /Connecting/);
    await wait();
    assert.equal(dom.window.location.hash, "#/selected/delivery");
    assert.match(document.body.textContent, /pulse-oak/);
  } finally {
    dom.window.close();
  }
});

test("G1 initial test waits for provider acceptance and late results cannot hijack navigation", async () => {
  const dom = await prototype("selected/test");
  const { document } = dom.window;
  try {
    const send = document.querySelector("[data-send-test]");
    assert.ok(send);
    send.click();
    assert.equal(dom.window.location.hash, "#/selected/test");
    assert.equal(send.disabled, true);
    assert.match(send.textContent, /Sending/);
    navigate(dom, "selected/delivery");
    await wait();
    assert.equal(dom.window.location.hash, "#/selected/delivery");

    navigate(dom, "selected/test");
    document.querySelector("[data-send-test]").click();
    await wait();
    assert.equal(dom.window.location.hash, "#/selected/test-sent");
  } finally {
    dom.window.close();
  }
});

test("G1 missing-notification recovery reaches every named phone repair and actually resends", async () => {
  const dom = await prototype("selected/state/test-not-received");
  const { document } = dom.window;
  try {
    assert.equal(document.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"), "6");
    assert.equal(document.querySelector("[data-primary-recovery]")?.getAttribute("href"), "#/selected/state/phone-permission");
    navigate(dom, "selected/state/phone-permission");
    assert.equal(document.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"), "6");
    assert.match(document.body.textContent, /Android notification permission|subscription.*mute|Instant delivery/is);
    assert.ok(document.querySelector('a[href="#/selected/phone-subscribe"]'));
    navigate(dom, "selected/state/test-not-received");
    const resend = document.querySelector("[data-resend-test]");
    resend.click();
    assert.equal(resend.disabled, true);
    assert.match(resend.textContent, /Sending/);
    await wait();
    assert.equal(dom.window.location.hash, "#/selected/test-sent");
    assert.match(document.body.textContent, /Resent just now/);
    navigate(dom, "selected/state/test-not-received");
    const limited = document.querySelector("[data-resend-test]");
    assert.equal(limited?.disabled, true);
    assert.match(limited?.textContent ?? "", /Try again in/);
  } finally {
    dom.window.close();
  }
});

test("G1 resend cooldown expires without requiring a reload", async () => {
  const dom = await prototype("selected/state/test-not-received", {
    lastRoute: "test-sent",
    furthestIndex: 5,
    runnerAddress: "https://pulse-cooldown.example",
    runnerName: "pulse-cooldown",
    testAttempts: 1,
    lastTestSentAt: Date.now() - 29_950,
  });
  try {
    assert.equal(dom.window.document.querySelector("[data-resend-test]")?.disabled, true);
    await wait(125);
    assert.equal(dom.window.document.querySelector("[data-resend-test]")?.disabled, false);
    assert.match(dom.window.document.querySelector("[data-resend-test]")?.textContent ?? "", /Send one more test/);
  } finally {
    dom.window.close();
  }
});

test("G1 main Test cooldown counts down and future timestamps fail open", async () => {
  const dom = await prototype("selected/test", {
    lastRoute: "test",
    furthestIndex: 5,
    runnerAddress: "https://pulse-cooldown.example",
    runnerName: "pulse-cooldown",
    runnerMayExist: true,
    runnerVerified: true,
    deliveryReady: true,
    deliveryConfirmed: false,
    testAttempts: 1,
    lastTestSentAt: Date.now() - 28_500,
  });
  try {
    const first = dom.window.document.querySelector("[data-send-test]")?.textContent ?? "";
    assert.match(first, /Try again in 2s/);
    await wait(1_100);
    const second = dom.window.document.querySelector("[data-send-test]")?.textContent ?? "";
    assert.match(second, /Try again in 1s/);
    await wait(650);
    assert.equal(dom.window.document.querySelector("[data-send-test]")?.disabled, false);

    dom.window.close();
    const future = await prototype("selected/test", {
      lastRoute: "test",
      furthestIndex: 5,
      runnerAddress: "https://pulse-cooldown.example",
      runnerName: "pulse-cooldown",
      runnerMayExist: true,
      runnerVerified: true,
      deliveryReady: true,
      deliveryConfirmed: false,
      testAttempts: 1,
      lastTestSentAt: Date.now() + 86_400_000,
    });
    try {
      assert.equal(future.window.document.querySelector("[data-send-test]")?.disabled, false);
    } finally {
      future.window.close();
    }
  } finally {
    if (!dom.window.closed) dom.window.close();
  }
});

test("G1 every two-action recovery offers distinct truthful consequences and keeps its real stage", async () => {
  const dom = await prototype("selected/state/resume");
  const { document } = dom.window;
  const stageByState = {
    resume: 4,
    "phone-permission": 6,
    "phone-account": 2,
    "phone-subscription": 2,
    "ntfy-verification": 2,
    "private-topic": 2,
    "adapter-unavailable": 3,
    "provider-authorization": 3,
    "team-permission": 3,
    "invalid-url": 4,
    "incompatible-runner": 4,
    "fingerprint-mismatch": 4,
    "proof-failed": 4,
    "secure-storage-failed": 4,
    "runner-starting": 4,
    "test-rejected": 6,
    "test-not-received": 6,
    "existing-installation": 4,
    "stale-setup": 4,
    "migrated-setup": 4,
    advanced: 3,
  };
  try {
    for (const [state, expectedStage] of Object.entries(stageByState)) {
      navigate(dom, `selected/state/${state}`);
      assert.equal(
        document.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"),
        String(expectedStage),
        `${state} reports the stage where the user actually is`,
      );
      const actions = [...document.querySelectorAll(".pulse-setup__stage-actions [data-recovery-action]")];
      if (actions.length < 2) continue;
      const consequences = actions.map((action) =>
        [action.tagName, action.getAttribute("href"), action.getAttribute("data-action-kind"), action.getAttribute("data-external-message")].join("|"),
      );
      assert.equal(new Set(consequences).size, consequences.length, `${state} actions are not cosmetic synonyms`);
    }
  } finally {
    dom.window.close();
  }
});

test("G1 safe local progress resumes visibly without persisting a pairing code", async () => {
  const dom = await prototype("selected/pairing", {
    lastRoute: "pairing",
    furthestIndex: 3,
    runnerAddress: "https://pulse-safe.example",
    runnerName: "pulse-safe",
    runnerMayExist: true,
    runnerVerified: false,
    deliveryReady: false,
    deliveryConfirmed: false,
    testAttempts: 0,
    lastTestSentAt: 0,
  });
  const { document } = dom.window;
  try {
    const input = document.querySelector("#runner-address");
    input.value = "https://pulse-resume.example";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    navigate(dom, "selected/welcome");
    const resume = document.querySelector("[data-resume-setup]");
    assert.equal(resume?.getAttribute("href"), "#/selected/pairing");
    assert.match(resume?.textContent ?? "", /Continue at Connect/);
    assert.match(document.body.textContent, /4 of 7/);
    assert.doesNotMatch(dom.window.localStorage.getItem("pulse.setup.prototype") ?? "", /pairingCode|DEMO-PAIR/);
  } finally {
    dom.window.close();
  }
});

test("G1 reviewing an earlier step keeps the furthest safe checkpoint returnable", async () => {
  const dom = await prototype("selected/pairing", {
    lastRoute: "pairing",
    furthestIndex: 3,
    runnerAddress: "https://pulse-safe.example",
    runnerName: "pulse-safe",
    runnerMayExist: true,
    runnerVerified: false,
    deliveryReady: false,
    deliveryConfirmed: false,
    testAttempts: 0,
    lastTestSentAt: 0,
  });
  const { document } = dom.window;
  try {
    navigate(dom, "selected/phone");
    const connect = [...document.querySelectorAll(".pulse-setup__companion-list a")].find((link) =>
      /Connect/.test(link.textContent ?? ""),
    );
    assert.equal(connect?.getAttribute("href"), "#/selected/pairing");
    navigate(dom, "selected/welcome");
    assert.equal(document.querySelector("[data-resume-setup]")?.getAttribute("href"), "#/selected/pairing");
  } finally {
    dom.window.close();
  }
});

test("G1 external feedback announces once, clears on navigation, and never survives abandonment", async () => {
  const dom = await prototype("selected/runner");
  const { document } = dom.window;
  try {
    document.querySelector("[data-external]").click();
    assert.equal(document.querySelectorAll("[aria-live='polite'], [role='status']").length, 1);
    assert.ok(document.querySelector(".pulse-setup__toast")?.getAttribute("aria-hidden"));
    assert.match(document.querySelector("#setup-live")?.textContent ?? "", /simulated/i);
    navigate(dom, "selected/pairing");
    assert.equal(document.querySelector(".pulse-setup__toast"), null);

    navigate(dom, "selected/state/resume");
    document.querySelector("[data-open-restart]").click();
    document.querySelector("[data-confirm-restart]").click();
    assert.equal(dom.window.location.hash, "#/selected/welcome");
    assert.match(document.body.textContent, /Local setup removed.*provider runner was not deleted/is);
    assert.doesNotMatch(document.body.textContent, /setup remains saved/i);
  } finally {
    dom.window.close();
  }
});

test("G1 restart consequences reflect whether a runner may exist and notices render once", async () => {
  const dom = await prototype("selected/welcome", null, { preview: false });
  const { document } = dom.window;
  try {
    document.querySelector("[data-primary-start]").click();
    await wait(0);
    navigate(dom, "selected/welcome");
    document.querySelector("[data-open-restart]").click();
    assert.doesNotMatch(document.querySelector("[role='dialog']")?.textContent ?? "", /deployed runner|quota/i);
    document.querySelector("[data-confirm-restart]").click();
    assert.match(document.body.textContent, /Local setup progress removed.*No runner/is);
    document.querySelector("[data-primary-start]").click();
    await wait(0);
    assert.doesNotMatch(document.body.textContent, /Local setup progress removed/i);
  } finally {
    dom.window.close();
  }
});

test("G1 cancelling a provider handoff returns to runner choice with a truthful result", async () => {
  const dom = await prototype("selected/state/provider-authorization");
  const { document } = dom.window;
  try {
    document.querySelector("[data-cancel-handoff]").click();
    await wait(0);
    assert.equal(dom.window.location.hash, "#/selected/runner");
    assert.match(document.body.textContent, /Provider handoff canceled.*No runner was connected/is);
  } finally {
    dom.window.close();
  }
});

test("G1 restart modal traps focus and makes the background inert", async () => {
  const dom = await prototype("selected/state/resume");
  const { document } = dom.window;
  try {
    document.querySelector("[data-open-restart]").click();
    const cancel = document.querySelector("[data-cancel-restart]");
    const confirm = document.querySelector("[data-confirm-restart]");
    assert.equal(document.querySelector(".pulse-setup__frame").inert, true);
    cancel.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    assert.equal(document.activeElement, confirm);
    confirm.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    assert.equal(document.activeElement, cancel);
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.querySelector(".pulse-setup__frame").inert, false);
  } finally {
    dom.window.close();
  }
});

test("G1 user-facing copy and illustrations do not contradict the real task", async () => {
  const dom = await prototype("selected/welcome");
  const { document } = dom.window;
  try {
    assert.match(document.body.textContent, /Plan for about 15 minutes/i);
    navigate(dom, "selected/phone");
    assert.match(document.body.textContent, /Create or sign in to ntfy/i);
    navigate(dom, "selected/phone-subscribe");
    assert.match(document.body.textContent, /Android phone camera/i);
    assert.match(document.body.textContent, /Preview only.*do not scan/is);
    assert.doesNotMatch(document.body.textContent, /Pixel camera|doze mode/i);
    navigate(dom, "selected/phone-token");
    assert.match(document.body.textContent, /revoking it stops Pulse delivery/i);
    navigate(dom, "selected/test-sent");
    assert.doesNotMatch(document.body.textContent, /CONFIRM TEST|DISMISS/);
    assert.match(document.body.textContent, /Return to Workshop to confirm/i);
    navigate(dom, "selected/complete");
    assert.doesNotMatch(document.body.textContent, /webview/i);
    navigate(dom, "selected/state/invalid-url");
    assert.match(document.body.textContent, /What Pulse knows/i);
    assert.doesNotMatch(document.body.textContent, /Current truth|security boundary allows/i);
    navigate(dom, "selected/state/advanced");
    assert.ok(document.querySelector("[data-compatibility-contract]"));
  } finally {
    dom.window.close();
  }
});
