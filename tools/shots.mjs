// Self-review screenshots: builds are served by `vite preview`, the Quest 3 is
// emulated by IWER (?emu), hands are posed through IWER's remote control API.
// Usage: npm run shots  → PNGs in shots/
import { createRequire } from 'node:module';
// Playwright comes preinstalled in the cloud dev container (not a project dependency).
const { chromium } = createRequire(import.meta.url)('playwright');
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const OUT = 'shots';
await mkdir(OUT, { recursive: true });

const server = await preview({ preview: { port: 4173, strictPort: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
const remote = (method, params) =>
  page.evaluate(([m, p]) => window.xrdevice.remote.dispatch(m, p), [method, params]);

/** World position of the welcome button + panel normal (toward the user). */
const buttonPose = () =>
  page.evaluate(() => {
    const g = window.keysvr.panel.button.group;
    g.updateWorldMatrix(true, false);
    const e = g.matrixWorld.elements;
    return { x: e[12], y: e[13], z: e[14], nx: e[8], ny: e[9], nz: e[10] };
  });

/** Put the right index fingertip `dist` metres in front of the button. */
async function fingerAt(dist) {
  const b = await buttonPose();
  await remote('set_hand_pose', { device: 'hand-right', poseId: 'point' }).catch(() => {});
  await remote('set_transform', {
    device: 'hand-right',
    anchor: 'index-tip',
    position: { x: b.x + b.nx * dist, y: b.y + b.ny * dist, z: b.z + b.nz * dist },
  });
  await wait(400);
}

try {
  await page.goto(`${base}?emu`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 60000 });
  await shot('01-intro');

  await page.click('#start');
  await page.waitForFunction(() => window.keysvr.renderer.xr.isPresenting, null, { timeout: 30000 });
  await wait(3000); // room + first frames
  await shot('02-xr-welcome');

  await fingerAt(0.04);
  await shot('03-hover');

  await fingerAt(-0.003);
  await shot('04-pressed');

  await fingerAt(0.12);
  await shot('05-done');

  const info = await page.evaluate(() => {
    const r = window.keysvr.renderer.info.render;
    return { drawCalls: r.calls, triangles: r.triangles };
  });
  console.log('render stats:', JSON.stringify(info));

  const mode = await page.evaluate(() => window.keysvr.panel.getMode());
  console.log('panel mode after press:', mode);
  if (mode !== 'done') errors.push('poke did not press the button');
} finally {
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  await browser.close();
  server.httpServer.close();
}
process.exit(errors.length ? 1 : 0);
