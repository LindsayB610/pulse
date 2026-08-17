import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prototypeRoot = join(repositoryRoot, "design", "onboarding-prototype");
const outputRoot = join(repositoryRoot, "design", "onboarding-evidence");
const chrome =
  process.env.PULSE_TEST_CHROME ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

const steps = ["welcome", "phone", "runner", "pairing", "delivery", "test", "complete"];
const phoneSteps = ["phone-reserve", "phone-subscribe", "phone-token"];
const directions = ["journey", "board", "companion"];
const recoveryStates = [
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
];

const jobs = [
  { file: "compare-desktop.jpg", route: "compare", width: 1440, height: 1650 },
  { file: "compare-narrow.jpg", route: "compare", width: 500, height: 3300 },
  ...directions.flatMap((direction) =>
    steps.map((step) => ({
      file: `${direction}-${step}-desktop.jpg`,
      route: `${direction}/${step}`,
      width: 1440,
      height: 1400,
    })),
  ),
  ...recoveryStates.flatMap((state) => [
    {
      file: `journey-state-${state}-desktop.jpg`,
      route: `journey/state/${state}`,
      width: 1440,
      height: state === "advanced" ? 1450 : 1200,
    },
    {
      file: `journey-state-${state}-narrow.jpg`,
      route: `journey/state/${state}`,
      width: 500,
      height: state === "advanced" ? 1800 : 1400,
    },
  ]),
  ...["phone", "runner", "pairing", "delivery", "test", "complete"].map((step) => ({
    file: `journey-${step}-narrow.jpg`,
    route: `journey/${step}`,
    width: 500,
    height: 1400,
  })),
  {
    file: "journey-phone-zoom-200.jpg",
    route: "journey/phone",
    width: 720,
    height: 1100,
    scale: 2,
  },
  {
    file: "companion-welcome-narrow.jpg",
    route: "companion/welcome",
    width: 500,
    height: 1500,
  },
  {
    file: "companion-state-existing-installation-desktop.jpg",
    route: "companion/state/existing-installation",
    width: 1440,
    height: 1200,
  },
  {
    file: "companion-state-advanced-desktop.jpg",
    route: "companion/state/advanced",
    width: 1440,
    height: 1450,
  },
  {
    file: "companion-state-advanced-narrow.jpg",
    route: "companion/state/advanced",
    width: 500,
    height: 1800,
  },
  {
    file: "selected-welcome-desktop.jpg",
    route: "selected/welcome",
    width: 1440,
    height: 1300,
  },
  {
    file: "selected-welcome-narrow.jpg",
    route: "selected/welcome",
    width: 500,
    height: 1500,
  },
  ...steps.slice(1).map((step) => ({
    file: `selected-${step}-desktop.jpg`,
    route: `selected/${step}`,
    width: 1440,
    height: 1400,
  })),
  ...phoneSteps.map((step) => ({
    file: `selected-${step}-desktop.jpg`,
    route: `selected/${step}`,
    width: 1440,
    height: 1500,
  })),
  {
    file: "selected-test-sent-desktop.jpg",
    route: "selected/test-sent",
    width: 1440,
    height: 1400,
  },
  {
    file: "selected-existing-desktop.jpg",
    route: "selected/existing",
    width: 1440,
    height: 1500,
  },
  ...["phone", "runner", "pairing", "delivery", "test", "complete"].map((step) => ({
    file: `selected-${step}-narrow.jpg`,
    route: `selected/${step}`,
    width: 500,
    height: 1800,
  })),
  ...phoneSteps.map((step) => ({
    file: `selected-${step}-narrow.jpg`,
    route: `selected/${step}`,
    width: 500,
    height: 2000,
  })),
  {
    file: "selected-test-sent-narrow.jpg",
    route: "selected/test-sent",
    width: 500,
    height: 1800,
  },
  {
    file: "selected-existing-narrow.jpg",
    route: "selected/existing",
    width: 500,
    height: 2100,
  },
  ...recoveryStates.flatMap((state) => [
    {
      file: `selected-state-${state}-desktop.jpg`,
      route: `selected/state/${state}`,
      width: 1440,
      height: state === "advanced" ? 1450 : 1400,
    },
    {
      file: `selected-state-${state}-narrow.jpg`,
      route: `selected/state/${state}`,
      width: 500,
      height: 1800,
    },
  ]),
];

function server() {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
      const target = resolve(prototypeRoot, relative);
      if (!target.startsWith(`${prototypeRoot}/`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(extname(target)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

async function render(baseUrl, job) {
  const target = join(outputRoot, job.file);
  const profile = await mkdtemp(join(tmpdir(), "pulse-evidence-chrome-"));
  const args = [
    "--headless=new",
    "--hide-scrollbars",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-cache",
    "--no-first-run",
    "--no-sandbox",
    "--virtual-time-budget=2500",
    `--user-data-dir=${profile}`,
    `--window-size=${job.width},${job.height}`,
    `--screenshot=${target}`,
  ];
  if (job.scale) args.push(`--force-device-scale-factor=${job.scale}`);
  args.push(`${baseUrl}/?evidence=${encodeURIComponent(job.file)}#/${job.route}`);
  try {
    await execute(chrome, args, { maxBuffer: 1024 * 1024, timeout: 20_000 });
    process.stdout.write(`rendered ${job.file}\n`);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

await mkdir(outputRoot, { recursive: true });
const localServer = server();
await new Promise((resolveListen, reject) => {
  localServer.once("error", reject);
  localServer.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = localServer.address();
  if (!address || typeof address === "string") throw new Error("Prototype server did not expose a port.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const requestedFiles = new Set(process.argv.slice(2));
  const queue = requestedFiles.size > 0 ? jobs.filter((job) => requestedFiles.has(job.file)) : [...jobs];
  if (requestedFiles.size > 0 && queue.length !== requestedFiles.size) {
    const knownFiles = new Set(queue.map((job) => job.file));
    const unknownFiles = [...requestedFiles].filter((file) => !knownFiles.has(file));
    throw new Error(`Unknown evidence target${unknownFiles.length === 1 ? "" : "s"}: ${unknownFiles.join(", ")}`);
  }
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) await render(baseUrl, job);
    }
  });
  await Promise.all(workers);
} finally {
  await new Promise((resolveClose) => localServer.close(resolveClose));
}
