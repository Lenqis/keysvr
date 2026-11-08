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
const synth = (expr, arg) => page.evaluate(expr, arg);
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
  await remote('set_hand_pose', { device: 'hand-left', poseId: 'point' }).catch(() => {});
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
  await page.click('#mic');
  await page.waitForFunction(() => window.keysvr.mic.state !== 'starting', null, { timeout: 10000 });
  if ((await page.evaluate(() => window.keysvr.mic.state)) !== 'on') errors.push('fake mic did not start');
  await shot('01-intro');

  await enterXR();
  await expectStep('touchLeft');
  await shot('02-touch-left');

  // Touch the end keys a bit off-centre (as real people do): the two-key verify
  // step must correct the resulting offset and width error.
  const left = await synth(() => window.fakeSynth.keyPoint(36, 0.004, 0, 0.008));
  const right = await synth(() => window.fakeSynth.keyPoint(96, 0.004, 0, -0.006));
  // Repro of a reported bug: the other hand comes down and rests still below the
  // keys (on the lap) — it must NOT be captured as the calibration point.
  await remote('animate_to', { device: 'hand-left', anchor: 'index-tip', position: { x: -0.15, y: 0.62, z: 0.05 }, orientation: PRESS_POSE, duration: 0.8 });
  await wait(900);
  const look = (p) => remote('look_at', { device: 'headset', target: p });
  await look(left); // people look at the key they touch
  await tipTo(up(left, 0.05), 0.9);
  await tipTo(left, 0.4);
  await wait(1000);
  await shot('03-holding');
  await page.waitForFunction(() => window.keysvr.flow.step === 'touchRight', null, { timeout: 8000 }).catch(() => {});
  await expectStep('touchRight');
  await tipTo(up(left, 0.06), 0.3);
  await shot('04-touch-right');

  await look(right);
  await tipTo(up(right, 0.06), 1.4); // realistic speed (< 1.5 m/s keeps tracking "reliable")
  await tipTo(right, 0.4);
  // Software-rendered emulator runs ~2.5x slower than real time: hold longer.
  await page.waitForFunction(() => window.keysvr.flow.step === 'verify', null, { timeout: 8000 }).catch(() => {});
  await expectStep('verify');
  const lh = await page.evaluate(() => window.keysvr.flow.left);
  if (Math.abs(lh.y - left.y) > 0.02) errors.push('left point captured from the wrong hand: ' + JSON.stringify(lh));
  await look({ x: 0, y: 0.9, z: -0.45 });
  await tipTo(up(right, 0.06), 0.3);
  await shot('05-verify');

  // Press the two yellow keys (C3, C6) at their real centres.
  for (const [i, midi] of [[0, 48], [1, 84]]) {
    const k = await synth((m) => window.fakeSynth.keyPoint(m, 0.04), midi);
    await tipTo(up(k, 0.03), 0.6);
    await tipTo(up(k, -0.009), 0.2);
    await wait(300);
    if (i === 1) await shot('06-verify-pressed');
    await tipTo(up(k, 0.04), 0.2);
    await wait(300);
  }
  const vi = await page.evaluate(() => window.keysvr.flow.verify.idx);
  if (vi !== 2) errors.push('verify step did not register both yellow keys, idx=' + vi);

  await pokeButton('Готово ✓');
  await wait(400);
  await expectStep('tester');

  // Accuracy sweep: white and black keys across the range must be detected exactly.
  const wrong = [];
  for (const midi of [40, 47, 52, 59, 61, 66, 70, 76, 82, 89]) {
    const k = await synth((m) => window.fakeSynth.keyPoint(m, window.fakeSynth.isBlack(m) ? 0.03 : 0.05), midi);
    await tipTo(up(k, 0.025), 0.4);
    await tipTo(up(k, -0.008), 0.15);
    await wait(250);
    const held = await page.evaluate(() => window.keysvr.flow.heldNotes());
    if (held.length !== 1 || held[0] !== midi) wrong.push(`${midi}→${JSON.stringify(held)}`);
    await tipTo(up(k, 0.025), 0.15);
    await wait(150);
  }
  console.log('accuracy sweep:', wrong.length ? 'WRONG ' + wrong.join(', ') : 'all 10 keys exact');
  if (wrong.length) errors.push('accuracy sweep: ' + wrong.join(', '));

  // Mic: hand presses `hand`, the synth actually sounds `sound` (null = silence).
  const micCases = [
    { hand: 60, sound: 60, want: 'match', lit: 60 },
    { hand: 60, sound: 61, want: 'corrected', lit: 61, shot: '08b-tester-mic-fixed' },
    { hand: 72, sound: 70, want: 'corrected', lit: 70 },
    { hand: 48, sound: 49, want: 'corrected', lit: 49 },
    { hand: 62, sound: null, want: 'handOnly', lit: null }, // hovering finger, no sound → not lit
    { hand: null, sound: 65, want: 'micOnly', lit: 65, shot: '08c-tester-mic-only' }, // hands missed it
  ];
  const stats = () => page.evaluate(() => ({ ...window.keysvr.flow.testerMic.stats }));
  for (const c of micCases) {
    const before = await stats();
    const k = c.hand === null ? null : await synth((m) => window.fakeSynth.keyPoint(m, 0.05), c.hand);
    if (k) {
      // The fake synth sounds at the moment of the press (as a real key bottoming out).
      await page.evaluate((o) => { window.fakeSoundPlan.offset = o; }, c.sound === null ? null : c.sound - c.hand);
      await tipTo(up(k, 0.025), 0.4);
      await remote('animate_to', { device: 'hand-right', anchor: 'index-tip', position: up(k, -0.008), orientation: PRESS_POSE, duration: 0.15 });
    } else await page.evaluate((m) => window.fakeSound(m, 5), c.sound);
    await page.waitForFunction((b) => {
      const t = window.keysvr.flow.testerMic.stats;
      return Object.keys(t).some((key) => t[key] > b[key]);
    }, before, { timeout: 4000 }).catch(() => {});
    await wait(200);
    const after = await stats();
    const got = Object.keys(after).filter((key) => after[key] > before[key]).join('+') || 'none';
    const lit = await page.evaluate(() => window.keysvr.flow.shownNotes());
    console.log(`mic: hand ${c.hand}, sound ${c.sound} → ${got}, lit ${JSON.stringify(lit)}`);
    if (got !== c.want) errors.push(`mic case ${JSON.stringify(c)} → ${got}`);
    if (JSON.stringify(lit) !== JSON.stringify(c.lit === null ? [] : [c.lit])) errors.push(`mic case ${JSON.stringify(c)} lit ${JSON.stringify(lit)}`);
    if (c.shot) await shot(c.shot);
    await page.evaluate(() => { window.fakeSoundPlan.offset = null; });
    if (k) await tipTo(up(k, 0.025), 0.15);
    await wait(1600);
  }
  // From here on the fake synth sounds every pressed key, like the real one.
  await page.evaluate(() => { window.fakeSoundPlan.offset = 0; });

  const e4 = await synth(() => window.fakeSynth.keyPoint(64, 0.05));
  await tipTo(up(e4, 0.03), 0.4);
  await tipTo(up(e4, -0.009), 0.2);
  await wait(200);
  // Left index presses the neighbouring F4 at the same time (two labels side by side).
  const f4 = await synth(() => window.fakeSynth.keyPoint(65, 0.07));
  await remote('animate_to', { device: 'hand-left', anchor: 'index-tip', position: up(f4, 0.03), orientation: PRESS_POSE, duration: 0.8 });
  await wait(900);
  await remote('animate_to', { device: 'hand-left', anchor: 'index-tip', position: up(f4, -0.009), orientation: PRESS_POSE, duration: 0.2 });
  await wait(400);
  const held = await page.evaluate(() => [...window.keysvr.flow.heldNotes()]);
  console.log('held:', JSON.stringify(held));
  if (held.length !== 2) errors.push('expected 2 held keys, got ' + JSON.stringify(held));
  await shot('07-tester-two-keys');
  await remote('animate_to', { device: 'hand-left', anchor: 'index-tip', position: up(f4, 0.05), orientation: PRESS_POSE, duration: 0.2 });
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

  // Back to calibration from the tester: tester buttons must disappear (they covered the text).
  await pokeButton('Калибровка');
  await wait(500);
  await expectStep('touchLeft');
  const leftover = await page.evaluate(() => ['Калибровка', 'Микр.: вкл'].filter((l) => window.keysvr.panel.buttonByLabel(l)));
  if (leftover.length) errors.push('tester buttons left on the calibration panel: ' + leftover.join(', '));
  await shot('10-recalibrate');

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
