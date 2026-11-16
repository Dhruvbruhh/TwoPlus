// Play listing icon: a 512x512 PNG high-quality downscale of the member app's
// real icon (mobile/assets/icon.png), exported next to the feature graphic.
// Play accepts the 1024 source directly, but the listing asks for 512, so the
// exact size is produced rather than left to the Console's resampler.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const SRC = "mobile/assets/icon.png";
const OUT = "release/store/listing-icon-512x512.png";

const b64 = (await readFile(SRC)).toString("base64");
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 512, height: 512 } })).newPage();
await page.setContent(`<img id="i" src="data:image/png;base64,${b64}">`);
await page.waitForSelector("#i");
const out = await page.evaluate(async () => {
  const img = document.getElementById("i");
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, 512, 512);
  return canvas.toDataURL("image/png").split(",")[1];
});
await browser.close();

await mkdir("release/store", { recursive: true });
const buf = Buffer.from(out, "base64");
await writeFile(OUT, buf);
console.log(`${OUT}  512x512  ${(buf.length / 1024).toFixed(1)} KB`);
