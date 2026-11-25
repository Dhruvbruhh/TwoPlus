/**
 * Signed-in shots for the new surfaces: Nutrition tab and the /scan modal.
 * Run from mobile/: node scripts/_shot-extra.mjs (SHOT_EMAIL/SHOT_PASS set).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "D:/TwoPlus/design-shots";
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.SHOT_EMAIL;
const PASS = process.env.SHOT_PASS;
if (!EMAIL || !PASS) {
  console.error("Set SHOT_EMAIL and SHOT_PASS");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);

await page.fill('input[type="email"], input', EMAIL);
await page.locator('input[type="password"]').fill(PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(6000);

// Nutrition tab.
try {
  await page.getByText("Nutrition", { exact: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/standard-nutrition.png` });
  console.log("standard-nutrition.png captured");
} catch (e) {
  console.log(`nutrition failed: ${e.message.split("\n")[0]}`);
  await page.screenshot({ path: `${OUT}/standard-nutrition-error.png` });
}

// Scanner modal from the Nutrition tab.
try {
  await page.getByText("Scan meal", { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/standard-scan.png` });
  console.log("standard-scan.png captured");
} catch (e) {
  console.log(`scan failed: ${e.message.split("\n")[0]}`);
  await page.screenshot({ path: `${OUT}/standard-scan-error.png` });
}

await browser.close();
console.log("done");
