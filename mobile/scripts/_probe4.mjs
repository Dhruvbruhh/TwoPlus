import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(8000);

const found = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
    almostThere: body.includes("Almost there"),
    membership: body.includes("MEMBERSHIP"),
    good: /GOOD|MORNING|AFTERNOON|EVENING/i.test(body),
    sceneText: body.replace(/\s+/g, " ").slice(0, 200),
  };
});
console.log(JSON.stringify(found, null, 2));

// Dump the scene subtree (the zero-height branch) fully.
const scene = await page.evaluate(() => {
  const root = document.getElementById("root");
  // find the deepest 390x844 background div then serialize its innerHTML
  const divs = Array.from(root.querySelectorAll("div"));
  const bg = divs.find((d) => d.className.includes("r-backgroundCo"));
  return bg ? { childCount: bg.children.length, html: bg.innerHTML.slice(0, 1500) } : null;
});
console.log("scene childCount:", scene?.childCount);
console.log("scene html:", scene?.html);
await browser.close();
