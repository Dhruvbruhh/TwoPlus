import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => {
  if (["log", "info", "error"].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 300));
});
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(8000);
console.log("body html length:", await page.evaluate(() => document.body.innerHTML.length));
const texts = await page.evaluate(() =>
  Array.from(document.querySelectorAll("*"))
    .filter((e) => e.children.length === 0 && e.textContent?.trim())
    .map((e) => e.textContent.trim())
    .slice(0, 30),
);
console.log("leaf texts:", JSON.stringify(texts));
await browser.close();
