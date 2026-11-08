// Self-review screenshots: builds are served by `vite preview`, the Quest 3 is
// emulated by IWER (?emu) with a fake 61-key synth; hands are driven through
// IWER's remote control API. Usage: npm run shots  → PNGs in shots/
import { createRequire } from 'node:module';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
// Playwright comes preinstalled in the cloud dev container (not a project dependency).
const { chromium } = createRequire(import.meta.url)('playwright');

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
  console.log('shot', name, '| step:', await step());
};
const step = () => page.evaluate(() => window.keysvr.flow.step);
const remote = (method, params) =>
  page.evaluate(([m, p]) => window.xrdevice.remote.dispatch(m, p), [method, params]);
const expectStep = async (want) => {
  const s = await step();
  if (s !== want) errors.push(`expected step ${want}, got ${s}`);
};

const PRESS_POSE = { fingers: [0, -0.7, -1], palm: [0, -1, 0] };
/** Smoothly moves the right index fingertip to `p` (world). */
async function tipTo(p, seconds = 0.4, orientation = PRESS_POSE) {
  await remote('animate_to', {
    device: 'hand-right', anchor: 'index-tip', position: p, orientation, duration: seconds,
  });
  await wait(seconds * 1000 + 100);
}
const synth = (expr) => page.evaluate(expr);
const up = (p, dy) => ({ x: p.x, y: p.y + dy, z: p.z });

/** Pokes a panel button by label with the right index finger. */
async function pokeButton(label) {
  const b = await page.evaluate((l) => {
    const g = window.keysvr.panel.buttonByLabel(l)?.group;
    if (!g) return null;
    g.updateWorldMatrix(true, false);
    const e = g.matrixWorld.elements;
    return { x: e[12], y: e[13], z: e[14], nx: e[8], ny: e[9], nz: e[10] };
  }, label);
  if (!b) { errors.push(`button not found: ${label}`); return; }
  const at = (d) => ({ x: b.x + b.nx * d, y: b.y + b.ny * d, z: b.z + b.nz * d });
  const face = { fingers: { x: -b.nx, y: -b.ny, z: -b.nz }, palm: [0, -1, 0] };
  await tipTo(at(0.06), 0.4, face);
  await tipTo(at(-0.004), 0.25, face);
  await tipTo(at(0.06), 0.25, face);
}

async function enterXR() {
  await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 60000 });
  await page.click('#start');
  await page.waitForFunction(() => window.keysvr.renderer.xr.isPresenting, null, { timeout: 30000 });
  await remote('set_hand_pose', { device: 'hand-right', poseId: 'point' }).catch(() => {});
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.32, z: 0.2 } });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.9, z: -0.45 } });
  // Park the hand instantly (no downward approach, so it must not be captured).
  await remote('set_transform', { device: 'hand-right', anchor: 'index-tip', position: { x: 0.25, y: 1.0, z: -0.05 }, orientation: PRESS_POSE });
  await wait(1500);
}

try {
  await page.goto(`${base}?emu`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 60000 });
  await shot('01-intro');

  await enterXR();
  await expectStep('touchLeft');
  await shot('02-touch-left');

  const left = await synth(() => window.fakeSynth.left);
  const right = await synth(() => window.fakeSynth.right);
  await tipTo(up(left, 0.05), 0.9);
  await tipTo(left, 0.4);
  await wait(1000);
  await shot('03-holding');
  await page.waitForFunction(() => window.keysvr.flow.step === 'touchRight', null, { timeout: 8000 }).catch(() => {});
  await expectStep('touchRight');
  await tipTo(up(left, 0.06), 0.3);
  await shot('04-touch-right');

  await tipTo(up(right, 0.06), 1.4); // realistic speed (< 1.5 m/s keeps tracking "reliable")
  await tipTo(right, 0.4);
  // Software-rendered emulator runs ~2.5x slower than real time: hold longer.
  await page.waitForFunction(() => window.keysvr.flow.step === 'verify', null, { timeout: 8000 }).catch(() => {});
  await expectStep('verify');
  await tipTo(up(right, 0.06), 0.3);
  await shot('05-verify');

  // Press middle C on the fake synth (should match the grid).
  const c4 = await synth(() => window.fakeSynth.keyPoint(60, 0.04));
  await tipTo(up(c4, 0.03), 0.5);
  await tipTo(up(c4, -0.009), 0.2);
  await wait(200);
  await shot('06-verify-pressed');
  await tipTo(up(c4, 0.04), 0.2);

  await pokeButton('Готово ✓');
  await wait(400);
  await expectStep('tester');

  const e4 = await synth(() => window.fakeSynth.keyPoint(64, 0.05));
  await tipTo(up(e4, 0.03), 0.4);
  await tipTo(up(e4, -0.009), 0.2);
  await wait(200);
  await shot('07-tester-e4');
  const fs4 = await synth(() => window.fakeSynth.keyPoint(66, 0.04));
  await tipTo(up(fs4, 0.03), 0.3);
  await tipTo(up(fs4, -0.009), 0.2);
  await wait(200);
  await shot('08-tester-black');
  await tipTo(up(fs4, 0.05), 0.2);

  // Measure the app alone (hide the fake synth, which stands in for the real one).
  await page.evaluate(() => { window.fakeSynth.group.visible = false; });
  await wait(300);
  const info = await page.evaluate(() => {
    const r = window.keysvr.renderer.info.render;
    return { drawCalls: r.calls, triangles: r.triangles };
  });
  await page.evaluate(() => { window.fakeSynth.group.visible = true; });
  console.log('render stats:', JSON.stringify(info));

  // New session: the saved calibration should come back.
  await page.reload({ waitUntil: 'networkidle' });
  await enterXR();
  await wait(3200);
  await expectStep('confirmSaved');
  await shot('09-confirm-saved');
} finally {
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  await browser.close();
  server.httpServer.close();
}
process.exit(errors.length ? 1 : 0);
