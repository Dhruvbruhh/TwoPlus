// Renders brand/feature-graphic.svg to the 1024x500 PNG the Play Store needs,
// next to the SVG so the pair travels together. Uses the Chromium Playwright
// already installed, so it adds no dependency; run it whenever the SVG changes.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const svg = await readFile("brand/feature-graphic.svg", "utf8");
const dataURL = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// Inter is the app's typeface (mobile loads @expo-google-fonts/inter). Register
// the repo's own copies so the render does not depend on system fonts.
const inter = "mobile/node_modules/@expo-google-fonts/inter";
const bold = await readFile(`${inter}/700Bold/Inter_700Bold.ttf`);
const medium = await readFile(`${inter}/500Medium/Inter_500Medium.ttf`);
const fontCss = [
  ["InterBold", bold],
  ["InterMedium", medium],
]
  .map(
    ([name, buf]) =>
      `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${buf.toString("base64")}) format('truetype');}`,
  )
  .join("\n");

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
await page.setContent(
  `<style>${fontCss}
   html,body{margin:0}img{display:block;width:1024px;height:500px}</style>
   <img id="g" src="${dataURL}" alt="">`,
);
await page.waitForSelector("#g");
const b64 = await page.evaluate(async () => {
  const img = document.getElementById("g");
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 500;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, 1024, 500);
  return canvas.toDataURL("image/png").split(",")[1];
});
await browser.close();

await mkdir("release/store", { recursive: true });
const out = "release/store/feature-graphic-1024x500.png";
const buf = Buffer.from(b64, "base64");
await writeFile(out, buf);
console.log(`${out}  1024x500  ${(buf.length / 1024).toFixed(1)} KB`);
