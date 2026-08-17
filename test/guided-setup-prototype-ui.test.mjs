import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const htmlUrl = new URL("../design/onboarding-prototype/index.html", import.meta.url);
const scriptUrl = new URL("../design/onboarding-prototype/onboarding.js", import.meta.url);
const axeUrl = new URL("../node_modules/axe-core/axe.min.js", import.meta.url);

async function prototype(route = "compare") {
  const [html, script, axe] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
    readFile(axeUrl, "utf8"),
  ]);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: `http://pulse.test/?audit=1#/${route}`,
  });
  dom.window.scrollTo = () => {};
  dom.window.eval(axe);
  dom.window.eval(script);
  return dom;
}

function navigate(dom, route) {
  dom.window.location.hash = `#/${route}`;
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
}

async function assertAccessible(dom, state) {
  const result = await dom.window.axe.run(dom.window.document, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  assert.deepEqual(
    Array.from(result.violations, (violation) => ({
      id: violation.id,
      targets: Array.from(violation.nodes, (node) => Array.from(node.target)),
    })),
    [],
    `${state} must have no automated accessibility violations`,
  );
}

test("G1 each direction supports the same complete setup walkthrough", async () => {
  for (const direction of ["journey", "board", "companion"]) {
    const dom = await prototype(`${direction}/welcome`);
    try {
      for (const [step, heading] of [
        ["welcome", "Set up Pulse, one clear step at a time"],
        ["phone", "Add your ntfy account"],
        ["runner", "Choose where Pulse stays awake"],
        ["pairing", "Connect this Mac"],
        ["delivery", "Finish notification delivery"],
        ["test", "Send one real test"],
        ["complete", "Pulse is ready"],
      ]) {
        navigate(dom, `${direction}/${step}`);
        assert.ok(
          [...dom.window.document.querySelectorAll("h1, h2")].some((element) =>
            element.textContent.includes(heading),
          ),
          `${direction}/${step} renders ${heading}`,
        );
        await assertAccessible(dom, `${direction}/${step}`);
      }
    } finally {
      dom.window.close();
    }
  }
});

test("G1 handoffs name their surface and keep notification credentials outside Pulse", async () => {
  const dom = await prototype("journey/phone");
  const { document } = dom.window;
  try {
    assert.match(document.body.textContent, /On your Android phone/);
    assert.equal(document.querySelectorAll("input[type='password']").length, 0);

    navigate(dom, "journey/phone-reserve");
    assert.match(document.body.textContent, /Open ntfy Settings/i);

    navigate(dom, "journey/delivery");
    assert.match(document.body.textContent, /Open runner setup/);
    assert.doesNotMatch(document.body.textContent, /Opens your runner in your browser/);
    assert.match(document.body.textContent, /Pulse and Workshop never receive your ntfy token/);
    assert.equal(document.querySelectorAll("input[type='password']").length, 0);
    await assertAccessible(dom, "secure delivery handoff");
  } finally {
    dom.window.close();
  }
});

test("G1 renders every recovery state honestly and preserves completed work", async () => {
  const dom = await prototype("journey/state/resume");
  try {
    for (const state of [
      "resume",
      "phone-permission",
      "phone-account",
      "phone-subscription",
      "ntfy-verification",
      "private-topic",
      "adapter-unavailable",
      "provider-authorization",
      "team-permission",
      "invalid-url",
      "incompatible-runner",
      "fingerprint-mismatch",
      "proof-failed",
      "secure-storage-failed",
      "runner-starting",
      "test-rejected",
      "test-not-received",
      "existing-installation",
      "stale-setup",
      "migrated-setup",
      "advanced",
    ]) {
      navigate(dom, `journey/state/${state}`);
      assert.ok(dom.window.document.querySelector("[data-recovery-state]"), `${state} has a recovery surface`);
      assert.ok(dom.window.document.querySelector(".pulse-setup__recovery-icon svg"), `${state} uses a vector state icon`);
      assert.ok(dom.window.document.querySelector(".pulse-setup__safe svg"), `${state} uses a vector safety icon`);
      assert.match(dom.window.document.body.textContent, /safe|saved|preserved|not deleted|still there/i);
      await assertAccessible(dom, state);
    }
  } finally {
    dom.window.close();
  }
});

test("G1 destructive restart uses a modal and restores focus when cancelled", async () => {
  const dom = await prototype("journey/state/resume");
  const { document } = dom.window;
  try {
    const restart = document.querySelector("[data-open-restart]");
    restart.focus();
    restart.click();
    assert.equal(document.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.equal(document.activeElement.getAttribute("data-cancel-restart"), "");
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.querySelector("[role='dialog']"), null);
    assert.equal(document.activeElement, restart);
  } finally {
    dom.window.close();
  }
});

test("G1 selected Companion path serves guided and experienced users without bypassing proof", async () => {
  const dom = await prototype("companion/welcome");
  const { document } = dom.window;
  try {
    assert.equal(document.querySelectorAll("h1").length, 1, "the active job owns the page heading");
    assert.equal(document.querySelectorAll(".pulse-setup__stage-actions").length, 1);

    const shortcuts = document.querySelector("[data-expert-shortcuts]");
    assert.ok(shortcuts, "the persistent companion exposes compact experienced-user paths");
    assert.match(shortcuts.textContent, /Skip provider walkthroughs, not verification/i);
    assert.ok(shortcuts.querySelector('a[href="#/companion/state/existing-installation"]'));
    assert.ok(shortcuts.querySelector('a[href="#/companion/state/advanced"]'));

    const stepLinks = document.querySelectorAll(".pulse-setup__companion-list a");
    assert.equal(stepLinks.length, 1, "future security steps are not direct-jump links");
    assert.equal(document.querySelectorAll(".pulse-setup__companion-list [aria-disabled='true']").length, 6);

    navigate(dom, "companion/state/advanced");
    assert.match(document.body.textContent, /Required before connecting/i);
    assert.match(document.body.textContent, /HTTPS|persistent storage|scheduler|pairing/i);
    assert.equal(document.querySelectorAll('a[href*="/delivery"], a[href*="/test"], a[href*="/complete"]').length, 0);
    await assertAccessible(dom, "selected Companion advanced path");
  } finally {
    dom.window.close();
  }
});

test("G1 selected Companion recovery actions have distinct truthful consequences", async () => {
  const dom = await prototype("companion/state/resume");
  const { document } = dom.window;
  try {
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => element.textContent.trim() === "Start over")
        .length,
      1,
      "resume offers one consequential start-over action",
    );

    navigate(dom, "companion/state/private-topic");
    assert.ok(document.querySelector('a[href="#/companion/state/advanced"]'));

    navigate(dom, "companion/state/existing-installation");
    assert.ok(document.querySelector('a[href="#/companion/welcome"]'));

    navigate(dom, "companion/state/advanced");
    const guidedAction = [...document.querySelectorAll('a[href="#/companion/runner"]')].find((element) =>
      /guided setup/i.test(element.textContent),
    );
    assert.ok(guidedAction);

    navigate(dom, "companion/state/runner-starting");
    const providerAction = [...document.querySelectorAll("button")].find((element) =>
      /Open Netlify/.test(element.textContent),
    );
    assert.ok(providerAction?.hasAttribute("data-external"));
  } finally {
    dom.window.close();
  }
});

test("G1 participant route starts with one concrete doorway before introducing the companion", async () => {
  const dom = await prototype("selected/welcome");
  const { document } = dom.window;
  try {
    assert.equal(document.querySelector(".pulse-setup__direction-switcher"), null);
    assert.equal(document.querySelector(".pulse-setup__compare-link")?.hidden, true);
    assert.ok(document.querySelector(".pulse-setup__welcome"), "the first screen is a focused doorway");
    assert.equal(
      document.querySelector(".pulse-setup__layout--companion"),
      null,
      "the companion does not compete before setup begins",
    );
    assert.match(document.body.textContent, /Let’s get Pulse working on your phone/);
    assert.doesNotMatch(document.body.textContent, /Stay oriented|Guidance when you need it|No developer chores/i);
    assert.doesNotMatch(document.body.textContent, /sysadmin/i);
    const primary = document.querySelector('[data-primary-start][href="#/selected/phone"]');
    assert.equal(primary?.textContent.trim(), "Start with my phone →");
    assert.ok(primary.closest(".pulse-setup__welcome-copy"), "the first action stays with the task it begins");
    assert.ok(document.querySelector('a[href="#/selected/state/existing-installation"]'));
    assert.ok(document.querySelector('a[href="#/selected/state/advanced"]'));
    await assertAccessible(dom, "selected participant route");

    navigate(dom, "selected/phone");
    assert.ok(document.querySelector(".pulse-setup__layout--companion"), "the companion begins with cross-device work");
    assert.match(document.querySelector(".pulse-setup__companion")?.textContent ?? "", /On your Android phone/);
    assert.match(document.querySelector(".pulse-setup__companion")?.textContent ?? "", /Start in ntfy/);
    const headingNames = [...document.querySelectorAll("h1, h2")].map((heading) => heading.textContent.trim());
    assert.equal(new Set(headingNames).size, headingNames.length, "companion and task headings stay distinct");
    assert.doesNotMatch(
      document.querySelector(".pulse-setup__companion")?.textContent ?? "",
      /Stay oriented across three screens|Right now/i,
    );
    await assertAccessible(dom, "selected phone companion");
  } finally {
    dom.window.close();
  }
});

test("G1 every local onboarding link resolves under the documented repository-root server", async () => {
  const dom = await prototype("selected/state/advanced");
  try {
    const repositoryRoot = new URL("../../", htmlUrl);
    const prototypeRoot = new URL("design/onboarding-prototype/", repositoryRoot);
    for (const link of dom.window.document.querySelectorAll('a[href]:not([href^="#"])')) {
      const href = link.getAttribute("href");
      if (!href || /^(?:https?:|mailto:)/.test(href)) continue;
      const target = new URL(href, prototypeRoot);
      await access(target);
    }
  } finally {
    dom.window.close();
  }
});

test("G1 semantic fact icons use one consistent vector system instead of font-dependent glyphs", async () => {
  const dom = await prototype("selected/welcome");
  const { document } = dom.window;
  try {
    for (const step of ["welcome", "delivery", "complete"]) {
      navigate(dom, `selected/${step}`);
      const icons = [...document.querySelectorAll(".pulse-setup__fact-icon")];
      assert.ok(icons.length >= 3, `${step} shows its supporting facts`);
      for (const icon of icons) {
        assert.ok(icon.querySelector("svg"), `${step} renders a scoped SVG icon`);
        assert.equal(icon.textContent.trim(), "", `${step} does not depend on a Unicode fallback glyph`);
      }
    }

    navigate(dom, "selected/state/phone-account");
    for (const selector of [".pulse-setup__recovery-icon", ".pulse-setup__safe"]) {
      const iconSurface = document.querySelector(selector);
      assert.ok(iconSurface?.querySelector("svg"), `${selector} uses the same vector icon system`);
    }

    navigate(dom, "selected/complete");
    assert.ok(document.querySelector(".pulse-setup__complete-mark svg"), "the completion hero uses the vector system");

    navigate(dom, "selected/phone-reserve");
    assert.ok(document.querySelector(".pulse-setup__phone-progress li.is-complete i svg"));

    navigate(dom, "journey/runner");
    const completedSteps = [...document.querySelectorAll(".pulse-setup__step-link.is-complete span:first-child")];
    assert.ok(completedSteps.length >= 2);
    assert.ok(completedSteps.every((marker) => marker.querySelector("svg")));
    await assertAccessible(dom, "semantic vector fact icons");
  } finally {
    dom.window.close();
  }
});

test("G1 phone setup gives every ntfy task its own exact, illustrated screen", async () => {
  const dom = await prototype("selected/phone");
  const { document } = dom.window;
  try {
    assert.match(document.body.textContent, /Phone setup · 1 of 4/i);
    assert.match(document.body.textContent, /Settings.*Manage users.*Add users.*Add new user/is);
    assert.match(document.body.textContent, /You’re done when.*ntfy\.sh user appears under Users/is);
    assert.ok(document.querySelector("[data-ntfy-screen='android-user']"));
    assert.ok(document.querySelector('a[href="#/selected/phone-reserve"]'));
    await assertAccessible(dom, "phone account screen");

    navigate(dom, "selected/phone-reserve");
    assert.match(document.body.textContent, /Phone setup · 2 of 4/i);
    assert.match(document.body.textContent, /Settings.*Reserved topics.*Add reserved topic/is);
    assert.match(document.body.textContent, /Only I can publish and subscribe/i);
    assert.ok(document.querySelector("[data-ntfy-screen='reserve-topic']"));
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /Open ntfy Settings/i.test(element.textContent))
        .length,
      1,
    );
    assert.ok(document.querySelector('a[href="#/selected/phone-subscribe"]'));
    await assertAccessible(dom, "phone reservation screen");

    navigate(dom, "selected/phone-subscribe");
    assert.match(document.body.textContent, /Phone setup · 3 of 4/i);
    assert.match(document.body.textContent, /tap \+.*Instant delivery.*Subscribe/is);
    assert.match(document.body.textContent, /You’re done when.*Pulse appears under Subscribed topics/is);
    assert.ok(document.querySelector("[data-ntfy-screen='android-subscribe']"));
    assert.ok(document.querySelector("[data-topic-qr]"));
    assert.ok(document.querySelector('a[href="#/selected/phone-token"]'));
    await assertAccessible(dom, "phone subscription screen");

    navigate(dom, "selected/phone-token");
    assert.match(document.body.textContent, /Phone setup · 4 of 4/i);
    assert.match(document.body.textContent, /Account.*Access tokens.*Create access token/is);
    assert.match(document.body.textContent, /Pulse runner.*Never expires.*Create token/is);
    assert.match(document.body.textContent, /keep the ntfy tab open/i);
    assert.ok(document.querySelector("[data-ntfy-screen='access-token']"));
    assert.equal(document.querySelectorAll("input[type='password']").length, 0);
    assert.ok(document.querySelector('a[href="#/selected/runner"]'));
    await assertAccessible(dom, "phone token screen");
  } finally {
    dom.window.close();
  }
});

test("G1 public prototype never presents a demo topic as usable setup data", async () => {
  const dom = await prototype("selected/phone-reserve");
  const { document } = dom.window;
  try {
    assert.doesNotMatch(document.body.textContent, /pulse_demo/i);
    assert.match(document.body.textContent, /Real setup generates a unique private topic/i);
    assert.match(document.querySelector("[data-topic-preview]")?.textContent ?? "", /^pulse_•+$/);
    assert.equal(document.querySelector("[data-copy-topic]")?.disabled, true);

    navigate(dom, "selected/phone-subscribe");
    assert.doesNotMatch(document.body.textContent, /pulse_demo|pulse_[a-f0-9]{24,}/i);
    assert.match(document.body.textContent, /Preview only · do not scan/i);
    await assertAccessible(dom, "masked public topic preview");
  } finally {
    dom.window.close();
  }
});

test("G1 every workflow screen has one obvious route to the immediately previous task", async () => {
  const dom = await prototype("selected/welcome");
  const { document } = dom.window;
  try {
    assert.equal(document.querySelector("[data-workflow-back]"), null, "the first screen has nowhere to go back to");

    for (const [step, previous, label] of [
      ["phone", "welcome", "Back to Start"],
      ["phone-reserve", "phone", "Back to Sign in"],
      ["phone-subscribe", "phone-reserve", "Back to Reserve topic"],
      ["phone-token", "phone-subscribe", "Back to Subscribe"],
      ["runner", "phone-token", "Back to Runner token"],
      ["pairing", "runner", "Back to Runner"],
      ["delivery", "pairing", "Back to Connect"],
      ["test", "delivery", "Back to Delivery"],
      ["test-sent", "test", "Back to Test"],
      ["complete", "test-sent", "Back to Test result"],
    ]) {
      navigate(dom, `selected/${step}`);
      const back = document.querySelector("[data-workflow-back]");
      assert.equal(document.querySelectorAll("[data-workflow-back]").length, 1, `${step} has one previous-step control`);
      assert.equal(back?.textContent.trim(), `← ${label}`);
      assert.equal(back?.getAttribute("href"), `#/selected/${previous}`);
      assert.equal(
        document.querySelector(".pulse-setup__stage-main")?.firstElementChild,
        back,
        `${step} keeps Back before the task heading`,
      );
    }

    await assertAccessible(dom, "workflow back navigation");
  } finally {
    dom.window.close();
  }
});

test("G1 selected flow keeps one primary action and never claims future success", async () => {
  const dom = await prototype("selected/runner");
  const { document } = dom.window;
  try {
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /Deploy with Netlify/i.test(element.textContent))
        .length,
      0,
      "runner setup is offered once through its provider choice",
    );
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /I finished the deployment/i.test(element.textContent))
        .length,
      1,
    );

    navigate(dom, "selected/pairing");
    assert.doesNotMatch(document.body.textContent, /Runner identity matches|Verified/);
    assert.match(document.body.textContent, /Pulse will verify/i);
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /Verify and connect this runner/i.test(element.textContent))
        .length,
      1,
    );

    navigate(dom, "selected/delivery");
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /Open runner setup/i.test(element.textContent))
        .length,
      1,
      "secure delivery has one browser handoff",
    );
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /I saved it/i.test(element.textContent)).length,
      1,
    );

    navigate(dom, "selected/test");
    assert.doesNotMatch(document.body.textContent, /Test accepted by ntfy|Sent just now/);
    assert.match(document.querySelector(".pulse-setup__companion")?.textContent ?? "", /Keep your phone nearby/);
    assert.equal(document.querySelector("[data-send-test]")?.textContent.trim(), "Send a test notification");

    navigate(dom, "selected/test-sent");
    assert.match(document.body.textContent, /Test accepted by ntfy/);
    assert.match(document.body.textContent, /phone receipt still unconfirmed/);
    assert.match(document.querySelector(".pulse-setup__companion")?.textContent ?? "", /Check for the test/);
    assert.ok(document.querySelector('a[href="#/selected/complete"]'));

    navigate(dom, "selected/complete");
    assert.equal(document.querySelector("[data-expert-shortcuts]"), null, "setup exits disappear after completion");
    assert.equal(
      [...document.querySelectorAll("button, a")].filter((element) => /Create (a|your first) reminder/i.test(element.textContent))
        .length,
      1,
      "completion offers one primary creation action",
    );
    await assertAccessible(dom, "selected completion");
  } finally {
    dom.window.close();
  }
});

test("G1 completion handoffs resolve when the documented prototype server is used", async () => {
  const dom = await prototype("selected/complete");
  try {
    const links = [...dom.window.document.querySelectorAll('.pulse-setup__card a[href*="prototype/index.html"]')];
    assert.equal(links.length, 2);
    for (const link of links) {
      const target = new URL(link.getAttribute("href").split("#")[0], htmlUrl);
      await access(target);
    }
  } finally {
    dom.window.close();
  }
});

test("G1 status chips stay compact and use non-redundant state language", async () => {
  const dom = await prototype("selected/pairing");
  const { document } = dom.window;
  try {
    const status = document.querySelector(".pulse-setup__notice-head .pulse-setup__badge");
    assert.equal(status?.textContent.trim(), "Pending");
    assert.doesNotMatch(document.body.textContent, /Not connected yet/i);
    await assertAccessible(dom, "compact pairing status");
  } finally {
    dom.window.close();
  }
});

test("G1 numbered fact sequences use centered circular step markers", async () => {
  const dom = await prototype("selected/pairing");
  const { document } = dom.window;
  try {
    const markers = [...document.querySelectorAll(".pulse-setup__fact-icon.is-number")];
    assert.deepEqual(
      markers.map((marker) => marker.textContent.trim()),
      ["1", "2", "3"],
    );
    await assertAccessible(dom, "numbered fact markers");
  } finally {
    dom.window.close();
  }
});

test("G1 runner choices use card hierarchy instead of underlining every line", async () => {
  const dom = await prototype("selected/runner");
  const { document } = dom.window;
  try {
    const advanced = document.querySelector('a.pulse-setup__choice[href="#/selected/state/advanced"]');
    assert.ok(advanced);
    assert.equal(advanced.querySelector("strong")?.textContent.trim(), "Connect another compatible runner");
    assert.match(advanced.querySelector("p")?.textContent ?? "", /another provider|self-hosted runner/i);
    assert.equal(advanced.querySelector(".pulse-setup__choice-cta")?.textContent.trim(), "Advanced setup →");
    assert.ok(advanced.querySelector(".pulse-setup__choice-icon svg"));
    await assertAccessible(dom, "runner choice hierarchy");
  } finally {
    dom.window.close();
  }
});
