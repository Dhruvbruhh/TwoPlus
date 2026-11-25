import { chromium } from "@playwright/test";

// Minimal visual check: does the red probe scene render?
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(9000);
await page.screenshot({ path: "D:/TwoPlus/design-shots/probe-red.png" });
const has = await page.evaluate(() => document.body.innerText.includes("HELLO SCENE"));
console.log("HELLO SCENE visible:", has);
await browser.close();
