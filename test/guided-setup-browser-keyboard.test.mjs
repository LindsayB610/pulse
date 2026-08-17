import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const chromeCandidates = [
  process.env.PULSE_TEST_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
const html = readFileSync(new URL("../design/onboarding-prototype/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../design/onboarding-prototype/onboarding.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../design/onboarding-prototype/onboarding.js", import.meta.url), "utf8");

const delay = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function devtoolsPage(process) {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Chrome did not expose DevTools.")), 10_000);
    process.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(Number(match[1]));
    });
    process.once("exit", (code) => reject(new Error(`Chrome exited before DevTools was ready (${code}).`)));
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = pages.find((candidate) => candidate.type === "page");
    if (page) return page.webSocketDebuggerUrl;
    await delay(50);
  }
  throw new Error("Chrome exposed no inspectable page.");
}

async function protocol(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    close() {
      if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
      return new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1_000);
        socket.addEventListener(
          "close",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket.close();
      });
    },
    send(method, params = {}) {
      sequence += 1;
      const id = sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}

async function stopBrowser(browser) {
  if (!browser || browser.exitCode !== null || browser.signalCode !== null) return;
  const exited = new Promise((resolve) => browser.once("exit", resolve));
  browser.kill();
  await Promise.race([exited, delay(3_000)]);
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill("SIGKILL");
    await Promise.race([exited, delay(1_000)]);
  }
}

async function key(client, value, { code = value, modifiers = 0, virtualKeyCode = 0 } = {}) {
  const params = {
    key: value,
    code,
    modifiers,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  };
  const text = value === "Enter" ? "\r" : undefined;
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyDown", text, unmodifiedText: text });
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

test("G1 native browser keys activate forms and remain contained by the restart dialog", async () => {
  assert.ok(chrome, "Chrome or Chromium is required for native keyboard proof; set PULSE_TEST_CHROME");
  const temp = mkdtempSync(join(tmpdir(), "pulse-guided-setup-keyboard-"));
  const profile = join(temp, "profile");
  let browser;
  let client;
  try {
    writeFileSync(join(temp, "onboarding.css"), css);
    writeFileSync(join(temp, "onboarding.js"), script);
    writeFileSync(join(temp, "index.html"), html);
    browser = spawn(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        `file://${join(temp, "index.html")}#/selected/welcome`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    client = await protocol(await devtoolsPage(browser));
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await delay(250);

    await evaluate(client, 'localStorage.clear(); location.hash = "#/selected/welcome"; document.querySelector("[data-primary-start]").focus()');
    await key(client, "Enter", { code: "Enter", virtualKeyCode: 13 });
    await delay(50);
    assert.equal(await evaluate(client, "location.hash"), "#/selected/phone");

    await evaluate(
      client,
      `(async () => { for (const target of ["phone-reserve","phone-subscribe","phone-token","runner","pairing"]) {
        document.querySelector('a[href="#/selected/' + target + '"]').click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const input = document.querySelector("#runner-address");
      input.focus();
      input.select(); })()`,
    );
    await client.send("Input.insertText", { text: "https://pulse-native-keyboard.example" });
    await key(client, "Enter", { code: "Enter", virtualKeyCode: 13 });
    await delay(400);
    const formResult = await evaluate(
      client,
      `JSON.stringify({
        hash: location.hash,
        value: document.querySelector("#runner-address")?.value,
        error: document.querySelector("[data-runner-error]")?.textContent,
        active: document.activeElement?.id,
        disabled: document.querySelector("[data-runner-submit]")?.disabled
      })`,
    );
    assert.equal(JSON.parse(formResult).hash, "#/selected/delivery", formResult);

    await evaluate(
      client,
      '(async () => { location.hash = "#/selected/welcome"; await new Promise((resolve) => setTimeout(resolve, 20)); document.querySelector("[data-open-restart]").focus(); })()',
    );
    await key(client, "Enter", { code: "Enter", virtualKeyCode: 13 });
    assert.equal(await evaluate(client, "document.activeElement.hasAttribute('data-cancel-restart')"), true);

    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Shift",
      code: "ShiftLeft",
      modifiers: 8,
      windowsVirtualKeyCode: 16,
    });
    await key(client, "Tab", { code: "Tab", modifiers: 8, virtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: 16,
    });
    assert.equal(await evaluate(client, "document.activeElement.hasAttribute('data-confirm-restart')"), true);

    await key(client, "Tab", { code: "Tab", virtualKeyCode: 9 });
    assert.equal(await evaluate(client, "document.activeElement.hasAttribute('data-cancel-restart')"), true);
    await key(client, "Escape", { code: "Escape", virtualKeyCode: 27 });
    assert.equal(await evaluate(client, "document.querySelector('[role=dialog]') === null"), true);
    assert.equal(await evaluate(client, "document.activeElement.hasAttribute('data-open-restart')"), true);
  } finally {
    if (client) await client.close();
    await stopBrowser(browser);
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
