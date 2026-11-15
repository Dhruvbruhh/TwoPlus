/**
 * Screenshot the member app (Expo web preview on :8082) at three phone sizes.
 * Run from repo root: node mobile/scripts/_design-shots.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "D:/TwoPlus/design-shots";
fs.mkdirSync(OUT, { recursive: true });

const sizes = [
  ["small", 320, 700],
  ["standard", 390, 844],
  ["large", 430, 932],
];

const browser = await chromium.launch();
for (const [label, w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${label}-entry.png` });
  console.log(`${label}: ${w}x${h} -> ${label}-entry.png`);
  await page.close();
}
await browser.close();
