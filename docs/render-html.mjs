// Render an HTML diagram (regression-execution-flow.html / architecture.html)
// to a transparent-background PNG using the framework's already-installed
// Chromium. Usage:  node docs/render-html.mjs <html> [out.png]
import { chromium } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const input  = process.argv[2] || 'regression-execution-flow.html';
const output = process.argv[3] || input.replace(/\.html?$/, '.png');
const inPath  = resolve(__dirname, input);
const outPath = resolve(__dirname, output);

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1100 },
    deviceScaleFactor: 2, // retina-sharp for slides
});
const page = await ctx.newPage();
await page.goto('file://' + inPath, { waitUntil: 'networkidle' });

// hide the page background so the screenshot is transparent around the canvas
await page.addStyleTag({ content: 'html,body{background:transparent!important;}' });

const canvas = page.locator('.canvas');
await canvas.screenshot({ path: outPath, omitBackground: true });

console.log(`saved -> ${outPath}`);
await browser.close();
