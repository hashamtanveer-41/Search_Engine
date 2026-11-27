import * as React from 'react';
import { defineFixtures } from '../src/fixture';
import { Card, CardContent, CardHeader, CardTitle } from '../src/derived/card';
import { DebugButton, DebugPanel, LayoutShifts } from './Debug';

/** A banner that comes and goes above a card, every 1.2 s: a layout shift each time. */
function Shifting() {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const id = setInterval(() => setShown((v) => !v), 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      {shown && <div className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm">A late banner pushes what is below it down</div>}
      <Card>
        <CardHeader><CardTitle>Continuity</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">This card moves whenever the banner comes or goes.</CardContent>
      </Card>
      <LayoutShifts />
    </div>
  );
}

export default defineFixtures({
  component: 'playground/debug',
  title: 'Debug dialog (playground)',
  frame: { width: 600, padding: 16 },
  cases: {
    panel: () => <div className="rounded-lg border bg-background px-5 py-3"><DebugPanel /></div>,
    open: () => <DebugButton defaultOpen />,
    'layout shifts': () => <Shifting />,
  },
});
