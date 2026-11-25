import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
await page.goto("http://localhost:8082", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"], input', process.env.SHOT_EMAIL);
await page.locator('input[type="password"]').fill(process.env.SHOT_PASS);
await page.getByText("Sign in", { exact: true }).click();
await page.waitForTimeout(9000);

// Click the Home tab explicitly, then dump the full scene subtree with sizes.
await page.getByText("Home", { exact: true }).last().click();
await page.waitForTimeout(4000);

const dump = await page.evaluate(() => {
  const divs = Array.from(document.querySelectorAll("div"));
  const bg = divs.find((d) => d.className.includes("r-backgroundCo"));
  if (!bg) return "no bg div";
  const lines = [];
  function walk(el, depth) {
    if (depth > 10) return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    lines.push(
      `${"  ".repeat(depth)}<${el.tagName.toLowerCase()}> ${Math.round(r.width)}x${Math.round(r.height)} d=${cs.display} fd=${cs.flexDirection} ai=${cs.alignItems} txt=${JSON.stringify((el.childNodes.length === 1 && el.textContent) || "").slice(0, 40)}`,
    );
    for (const c of el.children) walk(c, depth + 1);
  }
  walk(bg, 0);
  return lines.join("\n");
});
console.log(dump);
await browser.close();
