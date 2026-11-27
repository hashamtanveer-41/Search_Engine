import { defineFixtures } from '../../fixture';
import { WidgetFrame } from './frame';
import { Pane } from './pane';

const rows = Array.from({ length: 14 }, (_, i) => ({ id: `req-${100 + i}`, path: ['/api/users', '/api/orders', '/health'][i % 3], ms: 20 + ((i * 37) % 180) }));

export default defineFixtures({
  component: 'derived/views/pane',
  title: 'Pane',
  frame: { width: 760 },
  // Scrolled part-way, the table's header row must sit flush under the pane title, rows hidden behind it.
  play: { 'side by side': [{ wait: 300 }, { scroll: ['[data-slot="ui-pane-body"]', 70] }, { wait: 300 }] },
  cases: {
    'side by side': () => (
      <WidgetFrame id="fx-pane" kind="Logs" title="Requests and the slow ones" height={240}>
        <div className="grid h-full grid-cols-2">
          <Pane title={<>all <b>requests</b></>} aside={`${rows.length} rows`} footer="Scrolls on its own; the title stays.">
            <table className="ui-table"><thead><tr><th>id</th><th>path</th><th>ms</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td className="font-mono">{r.id}</td><td>{r.path}</td><td className="font-mono">{r.ms}</td></tr>)}</tbody></table>
          </Pane>
          <Pane title={<>over <b>150 ms</b></>} aside={`${rows.filter((r) => r.ms > 150).length} rows`}>
            <ul className="grid gap-1 p-3 text-sm">{rows.filter((r) => r.ms > 150).map((r) => <li key={r.id}><span className="font-mono">{r.id}</span> · {r.path} · {r.ms} ms</li>)}</ul>
          </Pane>
        </div>
      </WidgetFrame>
    ),
  },
});
