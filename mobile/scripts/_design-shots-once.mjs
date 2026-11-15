/**
 * One-off: sign in and capture the redesigned screens, incl. Nutrition + scan.
 * Writes its own log file because this machine's shell swallows node output.
 * Run: node mobile/scripts/_design-shots-once.mjs  (SHOT_EMAIL/SHOT_PASS set)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "D:/TwoPlus/design-shots";
const LOG = `${OUT}/once-run.log`;
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
fs.writeFileSync(LOG, `start ${new Date().toISOString()}\n`);

try {
  const EMAIL = process.env.SHOT_EMAIL;
  const PASS = process.env.SHOT_PASS;
  if (!EMAIL || !PASS) throw new Error("Set SHOT_EMAIL and SHOT_PASS");

  const browser = await chromium.launch();
  log("browser launched");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(4000);
  log("metro loaded");

  await page.locator('input[type="email"], input').first().fill(EMAIL, { timeout: 15000 });
  await page.locator('input[type="password"]').fill(PASS, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.getByText("Sign in", { exact: true }).click();
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${OUT}/lt-after-login.png` });
  log(`after login, url: ${page.url()}`);

  const tabs = ["Home", "Train", "Nutrition", "Community", "Coach", "Profile"];
  for (const tab of tabs) {
    try {
      await page.getByText(tab, { exact: true }).last().click({ timeout: 10000 });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/lt-${tab.toLowerCase()}.png` });
      log(`${tab} ok`);
    } catch (e) {
      log(`${tab} FAILED: ${String(e).split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/lt-${tab.toLowerCase()}-error.png` });
    }
  }

  await browser.close();
  log("done");
} catch (e) {
  log(`FATAL: ${String(e)}`);
}
