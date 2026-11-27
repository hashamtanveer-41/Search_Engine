import { defineFixtures } from '../fixture';
import { Tabs, TabsList, TabsTrigger } from './tabs';

export default defineFixtures({
  component: 'base/tabs',
  title: 'Tabs',
  frame: { width: 520, padding: 24 },
  cases: {
    'drag and let go past the end': () => (
      <Tabs defaultValue="components">
        <TabsList><TabsTrigger value="components">Components</TabsTrigger><TabsTrigger value="views">Views</TabsTrigger><TabsTrigger value="screen">Screen</TabsTrigger><TabsTrigger value="lessons">Lessons</TabsTrigger></TabsList>
      </Tabs>
    ),
  },
  // Press the first tab, drag the pill past the last one and let go outside the bar: it settles on
  // the last tab. Then a press on "Views" jumps straight there.
  play: { 'drag and let go past the end': [{ wait: 400 }, { drag: { from: '[data-slot=tabs-trigger] >> nth=0', by: [420, 18] } }, { wait: 900 }, { click: '[data-slot=tabs-trigger] >> nth=1' }, { wait: 900 }] },
});
