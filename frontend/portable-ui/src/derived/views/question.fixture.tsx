import * as React from 'react';
import { defineFixtures } from '../../fixture';
import {
  AgainButton, CheckButton, ChoiceQuestionView, NumberAnswer, OrderList, QuestionLayout, TextAnswer, Verdict, parseNumber, type Tone,
} from './question';

/** Order the steps of an incident response; checked against the runbook's order. */
const STEPS = [
  { id: 'ack', label: 'Acknowledge the page so nobody else starts on it' },
  { id: 'scope', label: 'Check the dashboards: what is broken, for whom' },
  { id: 'mitigate', label: 'Mitigate: roll back the last deploy' },
  { id: 'tell', label: 'Post a status update for customers' },
  { id: 'review', label: 'Write the post-incident review' },
];
const DECOY = { id: 'blame', label: 'Find out who merged the change' };
const POOL = [STEPS[2], DECOY, STEPS[0], STEPS[4], STEPS[1], STEPS[3]].map((s) => ({ ...s, plain: s.label }));

function IncidentOrder() {
  const steps = STEPS, items = POOL;
  const [answer, setAnswer] = React.useState<string[]>([]);
  const [checked, setChecked] = React.useState<null | { ok: boolean; wrong: Set<string> }>(null);
  const check = () => {
    const wrong = new Set(answer.filter((id, i) => id !== steps[i]?.id));
    setChecked({ ok: wrong.size === 0 && answer.length === steps.length, wrong });
  };
  const tone: Tone = checked ? (checked.ok ? 'ok' : 'bad') : 'idle';
  return (
    <QuestionLayout uid="fx-incident" label="Runbook" kind="Put in order" bodyScroll={false} height={430}
      prompt="Production is returning errors after a deploy. In what order do you act?"
      help="One of the steps does not belong in the response at all."
      hints={['Users first: stop the damage before you explain it.', 'Blame is not a step.']}
      solution={() => <ol className="list-decimal pl-5">{steps.map((s) => <li key={s.id}>{s.label}</li>)}</ol>}
      feedback={checked
        ? <Verdict ok={checked.ok}>{checked.ok ? 'That is the runbook order.' : checked.wrong.size === 1 ? 'One step is out of place or does not belong.' : `${checked.wrong.size} steps are out of place or do not belong.`}</Verdict>
        : 'Add the steps that belong, in order.'}
      tone={tone}
      actions={<>{answer.length > 0 && <AgainButton label="Start over" onClick={() => { setAnswer([]); setChecked(null); }} />}<CheckButton onClick={check} disabled={!answer.length} /></>}>
      <OrderList uid="fx-incident" items={items} answer={answer} onChange={(a) => { setAnswer(a); setChecked(null); }} problems={checked?.wrong}
        poolLabel="Actions" answerLabel="Your response" />
    </QuestionLayout>
  );
}

/** A conversion with a tolerance: the field previews how the number was read. */
function Conversion() {
  const [value, setValue] = React.useState('');
  const [result, setResult] = React.useState<null | 'ok' | 'bad' | 'nan'>(null);
  const expected = 250 * 1.0842;
  const check = () => {
    const n = parseNumber(value);
    setResult(Number.isNaN(n) ? 'nan' : Math.abs(n - expected) <= 0.01 ? 'ok' : 'bad');
  };
  return (
    <QuestionLayout uid="fx-fx" label="Exercise" kind="Work it out" height={250}
      prompt="A hotel bill is €250. At 1 EUR = 1.0842 USD, what is it in dollars?"
      help="To the cent. A comma or a point both work as the decimal mark."
      hints={['Multiply: euros × the rate.']}
      solution={() => <p>250 × 1.0842 = <b>271.05</b> USD.</p>}
      feedback={result === 'ok' ? <Verdict ok>271.05 USD.</Verdict> : result === 'bad' ? <Verdict ok={false}>Check which way the rate goes.</Verdict> : result === 'nan' ? 'That is not a number yet.' : 'Type your answer, then press Enter or Check.'}
      tone={result === 'ok' ? 'ok' : result === 'bad' ? 'bad' : result === 'nan' ? 'info' : 'idle'}
      actions={<CheckButton onClick={check} />}>
      <label htmlFor="fx-fx-answer" className="ui-caption mb-1.5 block">Amount in USD</label>
      <NumberAnswer id="fx-fx-answer" unit="USD" value={value} onChange={(v) => { setValue(v); setResult(null); }} onSubmit={check}
        mark={result === 'ok' ? 'correct' : result === 'bad' ? 'incorrect' : undefined} />
    </QuestionLayout>
  );
}

function Capital() {
  const [value, setValue] = React.useState('');
  const [ok, setOk] = React.useState<boolean | null>(null);
  const check = () => setOk(value.trim().toLowerCase() === 'canberra');
  return (
    <QuestionLayout uid="fx-capital" label="Quiz" kind="Type it" height={230}
      prompt="What is the capital of Australia?"
      feedback={ok === null ? 'One word.' : <Verdict ok={ok}>{ok ? 'Canberra.' : 'Not Sydney: the capital was built between Sydney and Melbourne.'}</Verdict>}
      tone={ok === null ? 'idle' : ok ? 'ok' : 'bad'}
      actions={<CheckButton onClick={check} />}>
      <TextAnswer id="fx-capital-answer" label="Your answer" value={value} onChange={(v) => { setValue(v); setOk(null); }} onSubmit={check} />
    </QuestionLayout>
  );
}

export default defineFixtures({
  component: 'derived/views/question',
  title: 'Question',
  frame: { width: 760 },
  cases: {
    'pick one (driving theory)': () => (
      <ChoiceQuestionView uid="fx-drive" label="Theory test" kind="Pick one"
        prompt="You are on a motorway and see a red X above your lane. What should you do?"
        hints={['Red means a hard rule, not advice.']}
        options={[
          { id: 'a', label: 'Slow down and stay in the lane', feedback: 'A red X closes the lane: you must not drive in it.' },
          { id: 'b', label: 'Move to a lane without a red X', correct: true, feedback: 'The lane is closed ahead, often for a breakdown or workers.' },
          { id: 'c', label: 'Use the hard shoulder', feedback: 'Only when a sign over it shows a speed limit.' },
        ]} />
    ),
    'select several (security review)': () => (
      <ChoiceQuestionView uid="fx-sec" label="Review" multiple
        prompt="Which of these belong in a pull request that adds a login form?"
        options={[
          { id: 'csrf', label: 'A CSRF token on the form', correct: true, feedback: 'Without one, another site can post the form for a logged-in user.' },
          { id: 'rate', label: 'Rate limiting on failed attempts', correct: true, feedback: 'It slows down password guessing.' },
          { id: 'log', label: 'Logging the submitted password for debugging', feedback: 'Never: logs are read by many people and kept for a long time.' },
          { id: 'https', label: 'Serving the page over HTTPS only', correct: true, feedback: 'Otherwise the password crosses the network in clear text.' },
        ]} />
    ),
    'put in order (incident response)': () => <IncidentOrder />,
    'a number (currency)': () => <Conversion />,
    'a word': () => <Capital />,
  },
  play: {
    'pick one (driving theory)': [{ wait: 400 }, { click: '[data-slot=question-option] >> nth=0' }, { wait: 1000 }],
    'select several (security review)': [{ wait: 400 }, { click: '[data-slot=question-option] >> nth=0' }, { click: '[data-slot=question-option] >> nth=2' }, { wait: 300 }, { click: 'button:has-text("Check")' }, { wait: 500 }, { hover: '[data-slot=question-option] >> nth=2' }, { wait: 900 }],
    'put in order (incident response)': [{ wait: 400 }, { click: 'button[aria-label^="Add “Acknowledge"]' }, { click: 'button[aria-label^="Add “Check the dashboards"]' }, { click: 'button[aria-label^="Add “Find out"]' }, { wait: 300 }, { click: 'button:has-text("Check")' }, { wait: 1000 }],
    'a number (currency)': [{ wait: 400 }, { type: ['input', '271,05'] }, { wait: 300 }, { click: 'button:has-text("Check")' }, { wait: 1000 }],
  },
});
