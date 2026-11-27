import { defineFixtures } from '../../fixture';
import { ToggleGroup, ToggleGroupItem } from '../../base/toggle-group';
import { Button } from '../../base/button';
import { WidgetFrame } from './frame';

export default defineFixtures({
  component: 'derived/views/frame',
  title: 'Frame',
  frame: { width: 760 },
  cases: {
    'drawers and bar': () => (
      <WidgetFrame id="fx-frame" kind="Report" title="Build times this week" height={180}
        actions={<ToggleGroup type="single" defaultValue="p50" variant="outline" size="sm"><ToggleGroupItem value="p50">p50</ToggleGroupItem><ToggleGroupItem value="p95">p95</ToggleGroupItem></ToggleGroup>}
        about={<p>Times are wall-clock from push to green, per branch.</p>}
        details={<table className="ui-table"><thead><tr><th>Day</th><th>p50</th></tr></thead><tbody><tr><td>Mon</td><td>4m 10s</td></tr><tr><td>Tue</td><td>3m 52s</td></tr></tbody></table>}
        controls={<div className="flex w-full items-center gap-2 px-1 text-[12.5px]"><span className="flex-1 truncate">Median build: <b>4m 01s</b></span><Button size="sm" variant="outline">Export</Button></div>}>
        <div className="grid h-full place-items-center text-sm text-muted-foreground">The stage: a fixed height, resizable from its bottom edge.</div>
      </WidgetFrame>
    ),
  },
  play: { 'drawers and bar': [{ wait: 400 }, { click: 'button[aria-label="About this widget"]' }, { wait: 900 }, { press: 'Escape' }, { wait: 500 }, { click: 'button[aria-label="Details"]' }, { wait: 900 }] },
});
