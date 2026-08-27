import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { withHeadlessBrowser } from "../scripts/headless-browser.mjs";

const html = readFileSync(new URL("../design/onboarding-prototype/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../design/onboarding-prototype/onboarding.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../design/onboarding-prototype/onboarding.js", import.meta.url), "utf8");

test("G1 native browser keys activate forms and remain contained by the restart dialog", async () => {
  const temp = mkdtempSync(join(tmpdir(), "pulse-guided-setup-keyboard-"));
  try {
    writeFileSync(join(temp, "onboarding.css"), css);
    writeFileSync(join(temp, "onboarding.js"), script);
    writeFileSync(join(temp, "index.html"), html);

    await withHeadlessBrowser(async (browser) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      try {
        await page.goto(`file://${join(temp, "index.html")}#/selected/welcome`, { waitUntil: "load" });
        await page.evaluate(() => localStorage.clear());

        await page.locator("[data-primary-start]").focus();
        await page.keyboard.press("Enter");
        assert.equal(new URL(page.url()).hash, "#/selected/phone");

        for (const target of ["phone-reserve", "phone-subscribe", "phone-token", "runner", "pairing"]) {
          await page.locator(`a[href="#/selected/${target}"]`).click();
        }
        const input = page.locator("#runner-address");
        await input.focus();
        await input.fill("https://pulse-native-keyboard.example");
        await page.keyboard.press("Enter");
        await page.waitForURL(/#\/selected\/delivery$/, { timeout: 2_000 });
        const formResult = await page.evaluate(() => ({
          hash: location.hash,
          value: document.querySelector("#runner-address")?.value,
          error: document.querySelector("[data-runner-error]")?.textContent,
          active: document.activeElement?.id,
          disabled: document.querySelector("[data-runner-submit]")?.disabled,
        }));
        assert.equal(formResult.hash, "#/selected/delivery", JSON.stringify(formResult));

        await page.evaluate(async () => {
          location.hash = "#/selected/welcome";
          await new Promise((resolve) => setTimeout(resolve, 20));
          document.querySelector("[data-open-restart]")?.focus();
        });
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("[data-cancel-restart]").evaluate((element) => element === document.activeElement), true);

        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.locator("[data-confirm-restart]").evaluate((element) => element === document.activeElement), true);

        await page.keyboard.press("Tab");
        assert.equal(await page.locator("[data-cancel-restart]").evaluate((element) => element === document.activeElement), true);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("[role=dialog]").count(), 0);
        assert.equal(await page.locator("[data-open-restart]").evaluate((element) => element === document.activeElement), true);
      } finally {
        await page.close();
      }
    });
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
