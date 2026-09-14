import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withHeadlessBrowser } from "../scripts/headless-browser.mjs";

const governedFiles = [
  "guided-setup-browser.test.mjs",
  "guided-setup-browser-interactions.test.mjs",
  "guided-setup-browser-keyboard.test.mjs",
  "plugin-theme-browser.test.mjs",
  "plugin-recurrence-browser.test.mjs",
  "../scripts/render-guided-setup-evidence.mjs",
];

test("normal Pulse browser checks use the shared Playwright harness and never fall back to installed GUI Chrome", () => {
  for (const relativePath of governedFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Applications\/Google Chrome\.app/, `${relativePath} must not launch installed macOS Chrome`);
    assert.doesNotMatch(source, /execFile(?:Sync)?\(|\bspawn\(/, `${relativePath} must not spawn a browser per route`);
    assert.match(source, /headless-browser\.mjs/, `${relativePath} must use the shared headless browser lifecycle`);
  }

  const harness = readFileSync(new URL("../scripts/headless-browser.mjs", import.meta.url), "utf8");
  const testRunner = readFileSync(new URL("../scripts/run-mjs-tests.mjs", import.meta.url), "utf8");
  const rootManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(harness, /headless:\s*true/, "Playwright must always launch in headless mode");
  assert.match(harness, /process\.env\.PULSE_TEST_CHROME/, "a system browser remains an explicit opt-in only");
  assert.doesNotMatch(harness, /Google Chrome|\/usr\/bin\/(?:google-chrome|chromium)/, "the harness must not contain automatic system browser fallbacks");
  assert.match(harness, /finally\s*\{[\s\S]*closeHeadlessBrowser/, "normal and exceptional paths must close the browser");
  assert.match(harness, /\["SIGINT",\s*"SIGTERM"\]/, "interrupt and termination paths must close active browsers");
  assert.match(harness, /pendingLaunches/, "termination must also close a browser whose launch is still resolving");
  assert.match(rootManifest.scripts.test, /run-mjs-tests\.mjs/, "normal checks must use the bounded test orchestrator");
  assert.match(rootManifest.scripts["test:coverage"], /run-mjs-tests\.mjs --coverage/, "coverage checks must use the bounded test orchestrator");
  assert.match(testRunner, /--test-concurrency=1/, "the orchestrator must not stampede macOS with competing browser processes");
});

test("SIGTERM closes the managed browser process and leaves no marked child behind", { timeout: 20_000 }, async () => {
  const marker = `pulse-sigterm-${process.pid}-${Date.now()}`;
  const child = spawn(process.execPath, [new URL("fixtures/headless-browser-signal.mjs", import.meta.url).pathname], {
    env: { ...process.env, PULSE_TEST_BROWSER_MARKER: marker },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`browser fixture did not become ready: ${stderr}`)), 12_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (!chunk.includes("ready")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`browser fixture exited before readiness (${code}): ${stderr}`)));
  });
  assert.match(execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }), new RegExp(marker));
  child.kill("SIGTERM");
  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`browser fixture ignored SIGTERM: ${stderr}`)), 8_000);
    child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
  assert.ok(exit.code === 143 || exit.signal === "SIGTERM", JSON.stringify(exit));
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.doesNotMatch(execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }), new RegExp(marker));
});

test("callback failure and harness timeout both close their managed browser children", { timeout: 20_000 }, async () => {
  const previousMarker = process.env.PULSE_TEST_BROWSER_MARKER;
  try {
    for (const mode of ["failure", "timeout"]) {
      const marker = `pulse-${mode}-${process.pid}-${Date.now()}`;
      process.env.PULSE_TEST_BROWSER_MARKER = marker;
      if (mode === "failure") {
        await assert.rejects(withHeadlessBrowser(async () => { throw new Error("deliberate browser callback failure"); }), /deliberate browser callback failure/);
      } else {
        await assert.rejects(withHeadlessBrowser(() => new Promise(() => undefined), { timeoutMs: 25 }), /timed out after 25 ms/);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.doesNotMatch(execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }), new RegExp(marker), `${mode} cleanup left a browser process behind`);
    }
  } finally {
    if (previousMarker === undefined) delete process.env.PULSE_TEST_BROWSER_MARKER;
    else process.env.PULSE_TEST_BROWSER_MARKER = previousMarker;
  }
});
