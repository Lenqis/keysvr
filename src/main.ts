import { App } from './xr/app';
import { micPermission } from './audio/mic';

const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const hint = document.querySelector<HTMLParagraphElement>('#hint')!;
const micBtn = document.querySelector<HTMLButtonElement>('#mic')!;

function showError(text: string): void {
  hint.textContent = text;
  hint.classList.add('error');
}

async function boot(): Promise<void> {
  // ?emu loads Meta's Quest 3 emulator (used for automated screenshots / desktop testing).
  const emu = new URLSearchParams(location.search).has('emu');
  if (emu) {
    const { installEmulator } = await import('./dev/emulator');
    await installEmulator();
  }

  const app = new App();
  if (emu) {
    const { addFakeSynth } = await import('./dev/fakeSynth');
    addFakeSynth(app.scene);
    const { fakeMicSource } = await import('./dev/fakeSound');
    app.micSource = fakeMicSource;
  }
  (window as unknown as { keysvr: App }).keysvr = app; // handle for test scripts

  if (!(await App.isSupported())) {
    startBtn.textContent = 'Начало';
    showError('Этот браузер не поддерживает смешанную реальность. Откройте страницу в браузере Quest 3.');
    return;
  }

  startBtn.disabled = false;
  startBtn.textContent = 'Начало';
  app.onSessionEnd = () => document.body.classList.remove('in-xr');
  await setupMic(app, emu);
  startBtn.addEventListener('click', async () => {
    // Permission already given → mic starts silently with the session (no prompt in VR).
    if (micBtn.classList.contains('on') || micBtn.hidden) void app.mic.start(app.micSource);
    try {
      await app.start();
      document.body.classList.add('in-xr');
    } catch (err) {
      showError(`Не удалось запустить VR: ${(err as Error).message}`);
    }
  });
}

/**
 * The mic permission prompt is shown on this 2D page (a prompt inside VR is unreliable).
 * Mic is optional: without it keys are detected by hands only.
 */
async function setupMic(app: App, emu: boolean): Promise<void> {
  const show = (text: string, cls: '' | 'on' | 'bad') => {
    micBtn.hidden = false;
    micBtn.textContent = text;
    micBtn.className = cls;
  };
  if (!emu && (await micPermission()) === 'granted') return; // hidden: starts with the session
  show('🎤 Разрешить микрофон', '');
  micBtn.addEventListener('click', async () => {
    if (micBtn.classList.contains('on')) return;
    await app.mic.start(app.micSource);
    if (app.mic.state === 'on') show('🎤 Микрофон включён ✓', 'on');
    else show(app.mic.state === 'denied' ? '🎤 Микрофон запрещён — разреши в настройках сайта' : '🎤 Микрофон недоступен', 'bad');
  });
}

boot().catch((err) => showError(`Ошибка запуска: ${(err as Error).message}`));
