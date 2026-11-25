/** Console + error capture for the blank-tab bug. */
import { chromium } from "@playwright/test";

const EMAIL = process.env.SHOT_EMAIL;
const PASS = process.env.SHOT_PASS;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") console.log(`[console.${t}]`, m.text().slice(0, 500));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 800)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText));

await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', EMAIL);
await page.locator('input[type="password"]').fill(PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(7000);
console.log("--- after login, DOM text sample:");
console.log((await page.locator("body").innerText()).slice(0, 400).replace(/\n+/g, " | "));
await page.getByText("Train", { exact: true }).last().click();
await page.waitForTimeout(4000);
console.log("--- after Train tap, DOM text sample:");
console.log((await page.locator("body").innerText()).slice(0, 400).replace(/\n+/g, " | "));
await browser.close();
