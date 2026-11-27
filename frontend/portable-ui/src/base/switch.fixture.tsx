import { defineFixtures } from '../fixture';
import { Label } from './label';
import { Switch } from './switch';

export default defineFixtures({
  component: 'base/switch',
  title: 'Switch',
  frame: { width: 320, padding: 16 },
  cases: {
    states: () => (
      <div className="grid gap-3">
        <Label className="gap-2"><Switch />Off</Label>
        <Label className="gap-2"><Switch defaultChecked />On</Label>
        <Label className="gap-2"><Switch size="sm" defaultChecked />Small, on</Label>
        <Label className="gap-2"><Switch disabled />Disabled</Label>
      </div>
    ),
  },
  play: { states: [{ wait: 300 }, { click: '[role=switch] >> nth=0' }, { wait: 500 }, { click: '[role=switch] >> nth=1' }, { wait: 600 }] },
});
