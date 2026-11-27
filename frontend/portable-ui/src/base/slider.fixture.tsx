import { defineFixtures } from '../fixture';
import { Slider } from './slider';

export default defineFixtures({
  component: 'base/slider',
  frame: { width: 520, padding: 24 },
  play: { value: [{ wait: 300 }, { drag: { from: '[data-slot=slider-thumb]', by: [180, 0] } }, { wait: 500 }, { hold: { on: '[data-slot=slider-track]', x: 0.15, ms: 1200 } }, { wait: 400 }] },
  cases: {
    plain: () => <Slider defaultValue={[40]} aria-label="Amount" />,
    marks: () => <Slider defaultValue={[10]} min={0} max={20} step={1} marks={[0, 5, 10, 15, 20].map((v) => ({ value: v, label: v }))} aria-label="Waiting places" />,
    tones: () => <div className="grid gap-6">{(['info', 'ok', 'warn', 'bad'] as const).map((t, i) => <Slider key={t} tone={t} defaultValue={[20 + i * 20]} aria-label={t} />)}</div>,
    range: () => <Slider defaultValue={[20, 70]} aria-label="Range" showValue />,
    value: () => <div className="pt-8"><Slider defaultValue={[0.8]} min={0} max={2} step={0.1} showValue={(v) => `r = ${v.toFixed(1)}`} aria-label="Growth rate" /></div>,
  },
});
