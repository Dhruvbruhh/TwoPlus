import { chromium } from "@playwright/test";

// Does the Screen primitive render its children on web?
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
});
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(9000);

const res = await page.evaluate(() => ({
  marker: document.body.innerText.includes("SCREEN PROBE OK"),
  fullText: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
}));
console.log(JSON.stringify(res, null, 2));
await browser.close();
