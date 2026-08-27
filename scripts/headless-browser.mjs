import { chromium } from "playwright";

const activeBrowsers = new Set();
const pendingLaunches = new Set();
let shuttingDown = false;

export async function launchHeadlessBrowser() {
  if (shuttingDown) throw new Error("The Pulse headless-browser harness is shutting down.");
  const launch = chromium.launch({
    headless: true,
    args: process.env.PULSE_TEST_BROWSER_MARKER
      ? [`--pulse-test-browser-marker=${process.env.PULSE_TEST_BROWSER_MARKER}`]
      : [],
    ...(process.env.PULSE_TEST_CHROME
      ? { executablePath: process.env.PULSE_TEST_CHROME }
      : {}),
  });
  pendingLaunches.add(launch);
  let browser;
  try {
    browser = await launch;
  } finally {
    pendingLaunches.delete(launch);
  }
  activeBrowsers.add(browser);
  browser.on("disconnected", () => activeBrowsers.delete(browser));
  if (shuttingDown) {
    await closeHeadlessBrowser(browser);
    throw new Error("The Pulse headless-browser harness shut down during browser launch.");
  }
  return browser;
}

export async function closeHeadlessBrowser(browser) {
  if (!browser || !activeBrowsers.has(browser)) return;
  activeBrowsers.delete(browser);
  await browser.close().catch(() => undefined);
}

export async function withHeadlessBrowser(run, { timeoutMs = 60_000 } = {}) {
  const browser = await launchHeadlessBrowser();
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(browser)),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Pulse headless-browser run timed out after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    await closeHeadlessBrowser(browser);
  }
}

export async function closeAllHeadlessBrowsers() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.allSettled([...pendingLaunches]);
  const browsers = [...activeBrowsers];
  activeBrowsers.clear();
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await closeAllHeadlessBrowsers();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
