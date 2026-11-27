import * as React from 'react';
import { defineFixtures } from '../fixture';
import { Chip } from './chip';
import { Combobox } from './combobox';
import { Field } from './field';

const IN_USE = ['Backend', 'Database', 'Design', 'Frontend', 'Testing', 'Writing', 'Presenting'];

/** Tags as Team adds them: the ones in use suggested, a new one added with Enter. */
function Tags() {
  const [tags, setTags] = React.useState(['Frontend']);
  const [text, setText] = React.useState('');
  const offered = IN_USE.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">{tags.map((t) => <Chip key={t} variant="outline">{t}</Chip>)}</div>
      <Field label="Add a tag" hint="Type to narrow the list; ↑ ↓ and Enter, or a new one and Enter.">
        <Combobox value={text} onValueChange={setText} options={offered} allowCreate placeholder="Backend, Design…"
          onChoose={(tag) => { setTags((t) => [...t, tag]); setText(''); }} />
      </Field>
    </div>
  );
}

/** Choosing from a list only, each with a detail; nothing typed outside it is taken. */
function Pick() {
  const [text, setText] = React.useState('');
  const [chosen, setChosen] = React.useState<string | null>(null);
  return (
    <Field label="Class" hint={chosen ? `Chosen: ${chosen}` : 'Only a class on the list can be chosen.'}>
      <Combobox value={text} onValueChange={setText} size="sm" emptyText="No class by that name."
        options={[{ value: 'BSSE-5A', detail: 'SE 200' }, { value: 'BSCS-6B', detail: 'CS 310' }, { value: 'BSSE-3C', detail: 'SE 120' }]}
        onChoose={(v) => { setChosen(v); setText(v); }} />
    </Field>
  );
}

export default defineFixtures({
  component: 'base/combobox',
  title: 'Combobox',
  frame: { width: 360, padding: 16 },
  cases: {
    'tags, new ones added': () => <Tags />,
    'a list only, small': () => <Pick />,
  },
  play: {
    'tags, new ones added': [
      { wait: 300 }, { click: '[role=combobox]' }, { wait: 500 }, { type: ['[role=combobox]', 'de'] }, { wait: 500 },
      { press: 'ArrowDown' }, { wait: 300 }, { press: 'Enter' }, { wait: 500 }, { type: ['[role=combobox]', 'Research'] }, { wait: 400 }, { press: 'Enter' }, { wait: 600 },
    ],
  },
});
