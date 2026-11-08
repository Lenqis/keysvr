import { App } from './xr/app';

const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const hint = document.querySelector<HTMLParagraphElement>('#hint')!;

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
  startBtn.addEventListener('click', async () => {
    try {
      await app.start();
      document.body.classList.add('in-xr');
    } catch (err) {
      showError(`Не удалось запустить VR: ${(err as Error).message}`);
    }
  });
}

boot().catch((err) => showError(`Ошибка запуска: ${(err as Error).message}`));
