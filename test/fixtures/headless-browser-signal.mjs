import { launchHeadlessBrowser } from "../../scripts/headless-browser.mjs";

await launchHeadlessBrowser();
process.stdout.write("ready\n");
setInterval(() => undefined, 60_000);
