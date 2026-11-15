import { chromium } from "@playwright/test";

// Decisive ScrollView probe: does RNW ScrollView render its children at all?
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

const res = await page.evaluate(() => {
  const body = document.body.innerText;
  const scrollHost = document.querySelector('[data-testid="probe-scroll"]');
  // RNW renders ScrollView as a div with overflow auto; find any scrollable div
  const scrollables = Array.from(document.querySelectorAll("div")).filter(
    (d) => {
      const s = getComputedStyle(d);
      return s.overflowY === "auto" || s.overflowY === "scroll";
    },
  );
  return {
    marker: body.includes("SV PROBE OK"),
    hasProbeHost: !!scrollHost,
    scrollableCount: scrollables.length,
    sampleScrollable: scrollables[0]
      ? {
          h: scrollables[0].clientHeight,
          childCount: scrollables[0].children.length,
          text: scrollables[0].innerText.slice(0, 80),
        }
      : null,
  };
});
console.log(JSON.stringify(res, null, 2));
await page.screenshot({ path: "D:/TwoPlus/design-shots/probe-sv.png" });
await browser.close();
