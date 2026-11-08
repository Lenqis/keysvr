import type { PanelContent } from '../ui/panel';
import { noteLabel } from './keyboardModel';

export type Step = 'start' | 'restoring' | 'confirmSaved' | 'touchLeft' | 'touchRight' | 'verify' | 'tester';

/** Everything the panels show, gathered by CalibrationFlow. */
export interface FlowView {
  step: Step;
  status: string;
  statusColor: string;
  keyCount: number;
  verifyIdx: number;
  /** label of the yellow key to press now */
  target: string;
  heightTuned: boolean;
  lastNote: { midi: number; color: string } | null;
  depthText: string;
  sensLabel: string;
}

export interface FlowActions {
  recalibrate(): void;
  confirm(): void;
  nudge(dir: -1 | 1): void;
  cycleKeys(): void;
  finish(): void;
  cycleSensitivity(): void;
}

/** Panel texts and buttons for each calibration / tester step. */
export function panelFor(v: FlowView, a: FlowActions): PanelContent {
  const status = { text: v.status || ' ', color: v.statusColor, weight: 700 };
  switch (v.step) {
    case 'start':
    case 'restoring':
      return { title: 'Загрузка калибровки…', lines: [] };
    case 'confirmSaved':
      return {
        title: 'Синтезатор на месте?',
        lines: ['Голубая сетка должна лежать точно на клавишах', 'Если съехала — откалибруй заново'],
        buttons: [[
          { label: 'Заново', variant: 'secondary', onPress: a.recalibrate },
          { label: 'Всё верно', onPress: a.confirm },
        ]],
      };
    case 'touchLeft':
      return {
        title: 'Шаг 1 из 3',
        lines: [
          'Поставь указательный палец',
          { text: 'на самую ЛЕВУЮ клавишу', weight: 700, color: '#ffffff' },
          'у ближнего к тебе края. Держи 1 сек.',
        ],
        picture: 'left',
      };
    case 'touchRight':
      return {
        title: 'Шаг 2 из 3',
        lines: [
          'Теперь поставь палец',
          { text: 'на самую ПРАВУЮ клавишу', weight: 700, color: '#ffffff' },
          'у ближнего к тебе края. Держи 1 сек.',
        ],
        picture: 'right',
        buttons: [[{ label: 'Назад', variant: 'secondary', onPress: a.recalibrate }]],
      };
    case 'verify':
      return {
        title: 'Шаг 3 из 3 · проверка',
        lines: [
          v.verifyIdx < 2 ? `Нажми жёлтую клавишу (${v.verifyIdx + 1} из 2) — ${v.target}` : 'Можно проверить любые клавиши',
          status,
          v.heightTuned ? { text: 'Высота клавиш подстроена под нажатие ✓', color: '#8af59a' } : ' ',
        ],
        buttons: [
          [
            { label: '◀', variant: 'secondary', onPress: () => a.nudge(-1) },
            { label: '▶', variant: 'secondary', onPress: () => a.nudge(1) },
            { label: `Клавиш: ${v.keyCount}`, variant: 'secondary', grow: 2, onPress: a.cycleKeys },
          ],
          [
            { label: 'Заново', variant: 'secondary', onPress: a.recalibrate },
            { label: 'Готово ✓', onPress: a.finish },
          ],
        ],
      };
    case 'tester': {
      const note = v.lastNote;
      return {
        title: 'Тестер клавиш',
        lines: [
          note ? { text: noteLabel(note.midi), color: note.color, size: 0.03, weight: 800 } : 'Нажимай любые клавиши',
          note ? { text: 'Руки ✓   Микрофон — на следующем этапе', color: '#8af59a' } : ' ',
          { text: v.depthText, color: '#a3a9c9', size: 0.018 },
        ],
        buttons: [[
          { label: 'Калибровка', variant: 'secondary', onPress: a.recalibrate },
          { label: `Чувствительность: ${v.sensLabel}`, variant: 'secondary', grow: 1.8, onPress: a.cycleSensitivity },
        ]],
      };
    }
  }
}
