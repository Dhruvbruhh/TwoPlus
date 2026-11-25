/**
 * Signed-in design shots: every tab at three phone sizes.
 * Run from repo root: node mobile/scripts/_design-shots-auth.mjs
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

const SIZES = [
  ["small", 320, 700],
  ["standard", 390, 844],
  ["large", 430, 932],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);

// Sign in (Expo web renders RN inputs as native inputs).
await page.fill('input[type="email"], input', EMAIL);
const pw = page.locator('input[type="password"]');
await pw.fill(PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/after-login.png` });
console.log("after-login captured; url:", page.url());

// Interior tabs. Tab bar buttons are RN-web views with text; click by label.
const tabs = ["Home", "Train", "Community", "Coach", "Profile"];
for (const tab of tabs) {
  try {
    await page.getByText(tab, { exact: true }).last().click({ timeout: 8000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/standard-${tab.toLowerCase()}.png` });
    console.log(`standard-${tab.toLowerCase()}.png captured`);
  } catch (e) {
    console.log(`tab ${tab} failed: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `${OUT}/standard-${tab.toLowerCase()}-error.png` });
  }
}

// Profile needs scrolling to reach the panes; grab a second shot scrolled.
try {
  await page.getByText("Profile", { exact: true }).last().click();
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/standard-profile-scrolled.png` });
} catch {}

// Small + large for Home and Train only (the two most layout-sensitive).
for (const [label, w, h] of SIZES) {
  if (label === "standard") continue;
  await page.setViewportSize({ width: w, height: h });
  for (const tab of ["Home", "Train"]) {
    try {
      await page.getByText(tab, { exact: true }).last().click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/${label}-${tab.toLowerCase()}.png` });
    } catch (e) {
      console.log(`${label} ${tab} failed: ${e.message.split("\n")[0]}`);
    }
  }
}

await browser.close();
console.log("done");
