import { chromium } from "@playwright/test";

// Inspect the rendered scene container after login: find the tab panels and
// dump their computed styles + child counts to see why content is invisible.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
  // react-native-web renders views as divs with aria-hidden or role=tabpanel-ish structure.
  // Find all divs directly under #root and walk depth to find large subtree with 0 size.
  const root = document.getElementById("root");
  function walk(el, depth, out) {
    if (depth > 14 || !el) return;
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      if (out.length < 60) {
        out.push({
          depth,
          tag: c.tagName,
          cls: (c.className || "").toString().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
          disp: cs.display,
          vis: cs.visibility,
          op: cs.opacity,
          pos: cs.position,
          ovf: cs.overflow,
          text: (c.textContent || "").trim().slice(0, 20),
        });
      }
      walk(c, depth + 1, out);
    }
  }
  const out = [];
  walk(root, 0, out);
  return out;
});
for (const i of info) console.log(JSON.stringify(i));
await browser.close();
