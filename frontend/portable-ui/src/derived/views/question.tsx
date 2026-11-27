// Question: the layout every question shares, whatever it asks and wherever it sits, and the answer
// inputs more than one kind of question uses.
//
//   ┌ header ─ PRACTICE  Select all that apply ─────────────── [💡 0/2] [📖] [⤢] ┐
//   │ the prompt (and, small, how to answer)                                      │
//   │ the answer area, as tall as it needs                                        │
//   ├ bar ─ what to do, or how it went (tinted)          [Try again] [Check / …] ─┤
//
// The widget is as tall as its content: nothing empty under the options. The bar is the one place to
// act and the one place that says how it went: a line on what to do, then the verdict, tinted green
// or red, with the next thing to press. Hints and the solution are tools in the header and open in
// popovers over the page (the solution only after a second "show me" click, so it is never seen by
// accident). A wrong answer offers "Show solution" in the bar too.
//
// Inside a set, the column is one of the set's stacked questions (the set is as tall as its tallest,
// so stepping never resizes it) and the bar goes to the set's bar, with the set's own button
// (Continue, See results) after the question's.
//
// Answer inputs: ChoiceList (pick one or several; after checking, pointing at a marked option says
// why), OrderList (build an order from a pool, two columns of one height), AnswerInput / NumberAnswer /
// TextAnswer (a field with its own reserved preview line, so typing never moves anything).
// ChoiceQuestionView is a whole multiple-choice question built from them.
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, BookOpenCheck, Check, CircleAlert, Eye, GripVertical, Lightbulb, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '../../base/button';
import { CheckboxMark } from '../../base/checkbox';
import { Input } from '../../base/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../base/popover';
import { cn } from '../../lib/utils';
import { WidgetFrame } from './frame';
import './question.css';

export type Tone = 'ok' | 'bad' | 'info' | 'idle';
/** How a question is framed: on its own, or one item inside a set. A quiet frame (a set in exam or
 * placement mode) shows no right/wrong, hints or solution, and reports every saved answer. */
export type QuestionFrame = {
  nested?: boolean; position?: string; quiet?: boolean;
  /** Inside a set: where the open question's bar goes (the set's own bar), and whether this one is open. */
  bar?: HTMLElement | null; active?: boolean;
  /** Inside a set: the set's own button, after the question's (Continue, See results). */
  next?: React.ReactNode;
};

export interface QuestionLayoutProps {
  uid: string;
  /** What the frame calls itself, small, before the kind ("Question", "Practice", "Quiz"). */
  label?: string;
  /** What the person does, said in the header ("Pick one", "Fill in the blanks"). */
  kind: string;
  prompt?: React.ReactNode;
  /** Under the prompt, small: how to type the answer, what to do. */
  help?: React.ReactNode;
  /** Beside the prompt: an answer short enough to sit next to the question (a number, a word). */
  inline?: React.ReactNode;
  children?: React.ReactNode;
  feedback: React.ReactNode;
  tone?: Tone;
  actions?: React.ReactNode;
  hints?: React.ReactNode[];
  /** The worked solution, rendered only once asked for. */
  solution?: () => React.ReactNode;
  solutionLabel?: string;
  /** Only for an answer area that lays out its own scrolling parts (`bodyScroll={false}`): its height. */
  height?: number;
  frame?: QuestionFrame;
  /** Let the answer area grow with its content (default), or give it `height` and let it lay out its
   *  own scrolling parts (two columns that scroll on their own). */
  bodyScroll?: boolean;
}

/** A rough height for text: lines of about `perLine` characters, 21px each. */
export const textHeight = (text: string, perLine = 92, line = 21) => Math.max(1, Math.ceil(text.length / perLine)) * line;
export const clampHeight = (n: number, low = 220, high = 520) => Math.max(low, Math.min(high, Math.round(n)));

export function QuestionLayout({ uid, label = 'Question', kind, prompt, help, inline, children, feedback, tone = 'idle', actions, hints, solution, solutionLabel = 'Solution', height = 320, frame, bodyScroll = true }: QuestionLayoutProps) {
  const quiet = !!frame?.quiet;
  const shownTone: Tone = quiet ? 'idle' : tone;
  const [solutionOpen, setSolutionOpen] = React.useState(false);
  const tools = (
    <QuestionTools hints={quiet ? undefined : hints} solution={quiet ? undefined : solution} solutionLabel={solutionLabel}
      open={solutionOpen} onOpenChange={setSolutionOpen} />
  );
  // A wrong answer offers the solution where the eye already is.
  const offerSolution = !quiet && solution && shownTone === 'bad' && (
    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSolutionOpen(true)}><BookOpenCheck aria-hidden />Show solution</Button>
  );
  const bar = <Bar tone={shownTone} feedback={feedback} actions={<>{offerSolution}{actions}{frame?.next}</>} tools={frame?.nested ? tools : undefined} />;
  const column = (
    <div data-slot="question" className="flex min-h-0 flex-col">
      {prompt !== undefined && (
        <div data-slot="question-prompt" className="px-4 pt-3.5 pb-1">
          {frame?.nested && frame.position && <p className="ui-caption mb-2">{frame.position} · {kind}</p>}
          <div className={cn(inline && 'flex flex-wrap items-baseline gap-x-3 gap-y-2')}>
            <div id={`${uid}-q`} className="text-[15px] leading-relaxed font-medium">{prompt}</div>
            {inline && <div data-slot="question-inline" className="min-w-0 py-1">{inline}</div>}
          </div>
          {help && <p id={`${uid}-help`} className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{help}</p>}
        </div>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div data-slot="question-body" className={cn('px-4 pt-2 pb-4', !bodyScroll && 'flex flex-col overflow-hidden')}
          style={bodyScroll ? undefined : { height }}>{children}</div>
      )}
      {(children === undefined || children === null || children === false) && <div aria-hidden className="h-3" />}
    </div>
  );
  if (frame?.nested) {
    return (
      <div role="group" aria-labelledby={`${uid}-q`}>
        {column}
        {/* The open question's bar is the set's bar (one bar, not two). */}
        {frame.bar ? frame.active && createPortal(bar, frame.bar) : <div className="border-t">{bar}</div>}
      </div>
    );
  }
  return (
    <WidgetFrame id={uid} kind={label} title={kind} fit maxHeight={720} actions={tools}
      controls={bar} controlsTone={shownTone === 'idle' ? undefined : shownTone}>
      {column}
    </WidgetFrame>
  );
}

/** The layout under its general name. */
export const Question = QuestionLayout;

/** The bar: what to do or how it went (up to three lines), then the buttons. The set's bar is tinted
 *  by this (`data-tone`), the frame's by its own `controlsTone`. */
function Bar({ tone, feedback, actions, tools }: { tone: Tone; feedback: React.ReactNode; actions?: React.ReactNode; tools?: React.ReactNode }) {
  return (
    <div data-slot="question-bar" data-tone={tone === 'idle' ? undefined : tone}
      className={cn('flex min-h-10 w-full min-w-0 items-center gap-1.5 self-stretch px-2 py-1 transition-colors duration-(--dur-quick)',
        tools && 'data-[tone=ok]:bg-ok-soft data-[tone=bad]:bg-bad-soft data-[tone=info]:bg-info-soft/60')}>
      {tools}
      <div data-slot="question-feedback" data-tone={tone} role="status"
        className={cn('line-clamp-3 min-w-0 flex-1 px-1.5 py-1 text-[13px] leading-snug', tone === 'idle' && 'text-muted-foreground')}>
        {feedback}
      </div>
      {actions}
    </div>
  );
}

/** The header's tools: hints and the solution, each in a popover over the page. */
function QuestionTools({ hints, solution, solutionLabel, open, onOpenChange }: {
  hints?: React.ReactNode[]; solution?: () => React.ReactNode; solutionLabel: string; open: boolean; onOpenChange(open: boolean): void;
}) {
  if (!(hints && hints.length) && !solution) return null;
  return (
    <span className="flex items-center gap-0.5">
      {hints && hints.length > 0 && <Hints hints={hints} />}
      {solution && (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Show ${solutionLabel.toLowerCase()}`} title={solutionLabel}><BookOpenCheck /></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(440px,92vw)] p-0 text-[13.5px] leading-relaxed">
            <div className="max-h-96 overflow-auto p-3"><Spoiler label={solutionLabel.toLowerCase()}>{solution}</Spoiler></div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** Hints, one at a time, in a popover over the page (it never pushes anything down). */
export function Hints({ hints }: { hints: React.ReactNode[] }) {
  const [shown, setShown] = React.useState(0);
  return (
    <Popover onOpenChange={(open) => { if (open && shown === 0) setShown(1); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="h-6 gap-1 px-1.5 text-xs" aria-label={`Hints, ${shown} of ${hints.length} shown`} title="Hint">
          <Lightbulb aria-hidden />
          <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">{shown}/{hints.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,90vw)] p-0">
        <ol aria-live="polite" className="grid max-h-72 gap-px overflow-auto">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={i} className="px-3 py-2 text-[13px] leading-relaxed not-last:border-b">
              <span className="ui-caption mr-1.5 text-warn">Hint {i + 1}</span>{hint}
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between border-t px-2 py-1.5">
          <span className="pl-1 text-[11.5px] text-muted-foreground">{shown < hints.length ? `${hints.length - shown} more` : 'That is every hint.'}</span>
          {shown < hints.length && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShown(shown + 1)}><Lightbulb aria-hidden />Another hint</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A spoiler: nothing inside is rendered until asked for. The ask is a short line and a button (no
 *  tall empty box), and the answer opens in the same place. */
export function Spoiler({ label = 'solution', children }: { label?: string; children: () => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  if (open) return <div data-slot="spoiler" className="grid gap-2">{children()}</div>;
  return (
    <div data-slot="spoiler" data-closed="" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 basis-56 text-[13px] text-muted-foreground">Have a real try first: the {label} helps most once you have been stuck for a while.</p>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}><Eye aria-hidden />Show the {label}</Button>
    </div>
  );
}

export function Verdict({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return (
    <>
      <strong className={cn('mr-1 inline-flex items-center gap-1 align-[-2px]', ok ? 'text-ok' : 'text-bad')}>
        {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}{ok ? 'Correct.' : 'Not quite.'}
      </strong>
      <span className="text-foreground">{children}</span>
    </>
  );
}

export const CheckButton = ({ quiet, ...props }: { quiet?: boolean } & React.ComponentProps<typeof Button>) => (
  <Button size="sm" className="h-7 text-xs" {...props}><Check aria-hidden />{quiet ? 'Save answer' : 'Check'}</Button>
);
export const AgainButton = ({ label = 'Try again', ...props }: { label?: string } & React.ComponentProps<typeof Button>) => (
  <Button variant="outline" size="sm" className="h-7 text-xs" {...props}><RotateCcw aria-hidden />{label}</Button>
);

export const letterOf = (i: number) => String.fromCharCode(65 + i);

/** One answer option (a choice, a step to judge): a full-width row with a marker, the text and its state. */
export function OptionRow({ marker, state, children, className, ...props }: React.ComponentProps<'button'> & {
  marker: React.ReactNode; state?: 'right' | 'wrong' | 'fine' | 'chosen';
}) {
  return (
    <button type="button" data-slot="question-option" data-state={state}
      className={cn(
        'group/option flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm leading-snug outline-none pointer-coarse:min-h-11',
        'transition-[background-color,border-color,opacity] duration-(--dur-quick) hover:border-foreground/35 ui-focus',
        'aria-disabled:cursor-default data-[state=chosen]:border-foreground/60 data-[state=chosen]:bg-muted',
        'data-[state=right]:border-ok data-[state=right]:bg-ok-soft data-[state=wrong]:border-bad data-[state=wrong]:bg-bad-soft data-[state=fine]:border-dashed data-[state=fine]:border-ok-line',
        className,
      )}
      {...props}>
      {/* The base checkbox's mark is used as it is (it morphs itself); anything else gets a tile. */}
      {React.isValidElement(marker) && marker.type === CheckboxMark ? marker : (
        <span aria-hidden className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md border bg-background px-1 font-mono text-[11px] text-muted-foreground group-data-[state=right]/option:border-ok group-data-[state=right]/option:text-ok group-data-[state=wrong]/option:border-bad group-data-[state=wrong]/option:text-bad">{marker}</span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

// ---------- ChoiceList ----------

export type ChoiceOption = { id: string; label: React.ReactNode; correct?: boolean; feedback?: React.ReactNode };

export interface ChoiceListProps {
  options: ChoiceOption[];
  multiple?: boolean;
  selected: string[];
  /** Checked: the chosen options show right or wrong (unless `quiet`). */
  checked?: boolean;
  /** Exam-style: nothing is marked; answers can change until submitted. */
  quiet?: boolean;
  onPick(id: string): void;
  /** After checking, the marked option the person points at (to say why), or null. */
  onPeek?(id: string | null): void;
  labelledBy?: string;
}

/** Options as full-width rows, lettered. One pick (radio) or several (checkbox); the letter sits in the
 *  base checkbox's mark, which morphs into a tick when the option is picked, and once checked into a
 *  green tick or a red cross; the others dim. */
export function ChoiceList({ options, multiple, selected, checked, quiet, onPick, onPeek, labelledBy }: ChoiceListProps) {
  const locked = !!checked && !quiet;
  return (
    <div className="grid gap-1.5" role={multiple ? 'group' : 'radiogroup'} aria-labelledby={labelledBy} onPointerLeave={() => onPeek?.(null)}>
      {options.map((option, index) => {
        const on = selected.includes(option.id);
        const marked = locked && on;
        const state = marked ? (option.correct ? 'right' : 'wrong') : on ? 'chosen' : undefined;
        return (
          <OptionRow
            key={option.id}
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            aria-disabled={(locked && !multiple) || undefined}
            data-dim={locked && !on ? '' : undefined}
            className="data-dim:opacity-55"
            state={state}
            marker={<CheckboxMark checked={multiple ? on : on && (locked || !!quiet)} morph={letterOf(index)}
              tone={state === 'right' ? 'ok' : state === 'wrong' ? 'bad' : undefined}
              className="size-6 rounded-md bg-background font-mono text-[11px] text-muted-foreground shadow-none" />}
            onClick={() => onPick(option.id)}
            onPointerEnter={() => marked && onPeek?.(option.id)}
            onFocus={() => marked && onPeek?.(option.id)}
          >
            {option.label}
          </OptionRow>
        );
      })}
    </div>
  );
}

/** How a set of picks compares with the right options. */
export function gradePicks(selected: Iterable<string>, options: { id: string; correct?: boolean }[]) {
  const picked = new Set(selected);
  let correctPicked = 0, wrongPicked = 0, missed = 0;
  for (const o of options) {
    if (picked.has(o.id)) { if (o.correct) correctPicked += 1; else wrongPicked += 1; } else if (o.correct) missed += 1;
  }
  return { exact: wrongPicked === 0 && missed === 0 && correctPicked > 0, correctPicked, wrongPicked, missed };
}

export interface ChoiceQuestionViewProps extends Omit<QuestionLayoutProps, 'children' | 'feedback' | 'tone' | 'actions' | 'height' | 'kind'> {
  options: ChoiceOption[];
  multiple?: boolean;
  kind?: string;
  height?: number;
  /** The first check (and, quiet, every save): whether the picks were exactly right. */
  onResult?(correct: boolean): void;
}

/** A whole multiple-choice question: the layout, a ChoiceList and its feedback. One pick is checked at
 *  once; several are checked with the Check button, then each marked option says why when pointed at.
 *  Without a solution of its own, the drawer lists the right options and why. */
export function ChoiceQuestionView({ options, multiple = false, kind, height, onResult, solution, frame, uid, ...rest }: ChoiceQuestionViewProps) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [checked, setChecked] = React.useState(false);
  const [peek, setPeek] = React.useState<string | null>(null);
  const quiet = !!frame?.quiet;
  const locked = checked && !quiet;

  const pick = (optionId: string) => {
    if (locked) { if (multiple) setPeek(optionId); return; }
    if (!multiple) {
      setSelected([optionId]);
      setChecked(true);
      onResult?.(!!options.find((o) => o.id === optionId)?.correct);
      return;
    }
    setSelected((now) => (now.includes(optionId) ? now.filter((x) => x !== optionId) : [...now, optionId]));
    if (quiet) setChecked(false);
  };
  const check = () => {
    if (!selected.length) return;
    setChecked(true);
    onResult?.(gradePicks(selected, options).exact);
  };
  const reset = () => { setSelected([]); setChecked(false); setPeek(null); };

  const grade = gradePicks(selected, options);
  const chosen = options.filter((o) => selected.includes(o.id));
  const right = options.filter((o) => o.correct);
  const peeked = peek ? options.find((o) => o.id === peek) : undefined;

  let feedback: React.ReactNode = multiple ? 'Pick every option that applies, then check.' : 'Pick one answer.';
  if (quiet) feedback = checked ? 'Answer saved. You can change it until you submit.' : multiple ? 'Pick every option that applies, then save.' : 'Pick one; you can change it until you submit.';
  else if (checked && !multiple && chosen[0]) feedback = <Verdict ok={!!chosen[0].correct}>{chosen[0].feedback}</Verdict>;
  else if (checked && multiple) {
    feedback = peeked ? (
      <><strong className={cn('mr-1', peeked.correct ? 'text-ok' : 'text-bad')}>{letterOf(options.indexOf(peeked))} {peeked.correct ? 'belongs.' : 'does not belong.'}</strong>{peeked.feedback}</>
    ) : (
      <Verdict ok={grade.exact}>
        {grade.exact
          ? 'That is exactly the right set.'
          : `You picked ${grade.correctPicked} of ${right.length} right option${right.length === 1 ? '' : 's'}${grade.wrongPicked ? ` and ${grade.wrongPicked} that ${grade.wrongPicked === 1 ? 'is' : 'are'} not right` : ''}.`}
        {' '}<span className="text-muted-foreground">Point at a marked option to read why.</span>
      </Verdict>
    );
  }
  const tone: Tone = quiet ? 'idle' : checked && !multiple && chosen[0] ? (chosen[0].correct ? 'ok' : 'bad') : checked && multiple ? (peeked ? (peeked.correct ? 'ok' : 'bad') : grade.exact ? 'ok' : 'bad') : 'idle';

  return (
    <QuestionLayout uid={uid} frame={frame} kind={kind ?? (multiple ? 'Select all that apply' : 'Pick one')} {...rest}
      height={height ?? clampHeight(90 + options.length * 46 + 24 + 68)}
      feedback={feedback} tone={tone}
      solution={solution ?? (() => (
        <ul className="grid gap-2">
          {right.map((option) => (
            <li key={option.id} className="flex gap-2">
              <span className="font-mono text-xs text-ok">{letterOf(options.indexOf(option))}</span>
              <span>{option.label}{option.feedback ? <> — {option.feedback}</> : null}</span>
            </li>
          ))}
        </ul>
      ))}
      actions={<>
        {checked && !quiet && !(multiple ? grade.exact : chosen[0]?.correct) && <AgainButton onClick={reset} />}
        {multiple && !checked && <CheckButton quiet={quiet} onClick={check} disabled={!selected.length} />}
      </>}
    >
      <ChoiceList options={options} multiple={multiple} selected={selected} checked={checked} quiet={quiet} onPick={pick} onPeek={setPeek} labelledBy={`${uid}-q`} />
    </QuestionLayout>
  );
}

// ---------- OrderList ----------

export interface OrderListProps {
  uid: string;
  /** Every item that can be placed, in the order the pool shows them (shuffle before passing). */
  items: { id: string; label: React.ReactNode; /** Plain words, for button labels ("Add “…”"). */ plain: string }[];
  /** The ids placed so far, in order. */
  answer: string[];
  onChange(answer: string[]): void;
  /** Placed items to mark as a problem (after checking). */
  problems?: Set<string>;
  poolLabel?: React.ReactNode;
  answerLabel?: React.ReactNode;
  /** What the empty pool and the empty answer say. */
  poolEmpty?: React.ReactNode;
  answerEmpty?: React.ReactNode;
}

const ROW = 'flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13.5px] leading-snug';
const moved = (list: string[], index: number, delta: number) => {
  const next = [...list]; const to = index + delta;
  if (to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

/** Build an order: a pool on the left, the answer on the right, two columns of one height (same frame,
 *  same heading line) that each scroll. A pool card is one button: press anywhere on it to add it. In
 *  the answer, drag a card by its grip to move it (the others make room as it passes), or use ↑ ↓; −
 *  takes it back. Focus follows the item (or its neighbour), so it can all be done from the keyboard. */
export function OrderList({ uid, items, answer, onChange, problems, poolLabel = 'To choose from', answerLabel = 'Your order', poolEmpty = 'Everything is placed.', answerEmpty = 'Nothing yet. Use + to add one.' }: OrderListProps) {
  const container = React.useRef<HTMLDivElement>(null);
  const focusNext = React.useRef<string | null>(null);
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const pool = items.map((i) => i.id).filter((id) => !answer.includes(id));
  const plain = (id: string) => byId.get(id)?.plain ?? id;

  React.useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (!target || !container.current) return;
    const el = container.current.querySelector<HTMLElement>(`[data-focus="${target}"]:not(:disabled)`)
      ?? container.current.querySelector<HTMLElement>(`[data-focus^="${target.split(':')[0]}:"]:not(:disabled)`);
    el?.focus();
  }, [answer]);

  const update = (next: string[], focus: string | null) => { focusNext.current = focus; onChange(next); };
  const add = (id: string) => {
    const index = pool.indexOf(id); const rest = pool.filter((x) => x !== id); const after = rest[Math.min(index, rest.length - 1)];
    update([...answer, id], after ? `${after}:add` : `${id}:remove`);
  };
  const remove = (id: string) => {
    const index = answer.indexOf(id); const rest = answer.filter((x) => x !== id); const after = rest[Math.min(index, rest.length - 1)];
    update(rest, after ? `${after}:remove` : `${id}:add`);
  };
  const shift = (index: number, delta: number) => update(moved(answer, index, delta), `${answer[index]}:${delta < 0 ? 'up' : 'down'}`);

  // Dragging a placed card by its grip: it follows the pointer; the order updates as it crosses the
  // middle of a neighbour, so the list shows where it will land.
  const list = React.useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = React.useState<{ id: string; dy: number } | null>(null);
  const startDrag = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch { /* gone */ }
    let order = answer, origin = e.clientY;
    setDragging({ id, dy: 0 });
    const move = (ev: PointerEvent) => {
      const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-order-row]') ?? [])];
      const at = order.indexOf(id), row = rows[at];
      if (!row) return;
      const dy = ev.clientY - origin, box = row.getBoundingClientRect();
      const mid = box.top + dy + box.height / 2;
      const next = rows[at + 1]?.getBoundingClientRect(), prev = rows[at - 1]?.getBoundingClientRect();
      if (next && mid > next.top + next.height / 2) { order = moved(order, at, 1); origin += next.height + 6; onChange(order); }
      else if (prev && mid < prev.top + prev.height / 2) { order = moved(order, at, -1); origin -= prev.height + 6; onChange(order); }
      setDragging({ id, dy: ev.clientY - origin });
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); setDragging(null); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return (
    <div data-slot="order-list" className="grid min-h-0 flex-1 grid-cols-2 gap-3 max-[560px]:grid-cols-1" ref={container}>
      <section className="flex min-h-0 flex-col rounded-lg border border-transparent bg-muted/50" aria-labelledby={`${uid}-pool`}>
        <h4 id={`${uid}-pool`} className="ui-caption flex shrink-0 items-center justify-between px-2.5 pt-2 pb-1.5">{poolLabel} <span className="font-mono">{pool.length}</span></h4>
        <ul className="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto px-2 pb-2">
          {pool.map((id) => (
            <li key={id}>
              {/* The whole card is the button: press anywhere on it to add it. */}
              <button type="button" data-focus={`${id}:add`} aria-label={`Add “${plain(id)}” to your answer`} onClick={() => add(id)}
                className={cn(ROW, 'w-full bg-background text-left outline-none transition-colors duration-(--dur-quick) hover:border-foreground/35 hover:bg-muted/40 ui-focus')}>
                <span className="min-w-0 flex-1">{byId.get(id)?.label}</span>
                <Plus aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
          {!pool.length && <li className="px-1 py-2 text-[12.5px] text-muted-foreground">{poolEmpty}</li>}
        </ul>
      </section>
      <section className="flex min-h-0 flex-col rounded-lg border border-dashed" aria-labelledby={`${uid}-answer`}>
        <h4 id={`${uid}-answer`} className="ui-caption flex shrink-0 items-center justify-between px-2.5 pt-2 pb-1.5">{answerLabel} <span className="font-mono">{answer.length}</span></h4>
        <ol ref={list} className="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto px-2 pb-2">
          {answer.map((id, index) => (
            <li key={id} data-order-row="" data-problem={problems?.has(id) || undefined} data-dragging={dragging?.id === id || undefined}
              style={dragging?.id === id ? { translate: `0 ${dragging.dy}px` } : undefined}
              className={cn(ROW, 'relative bg-background pl-1 data-problem:border-bad data-problem:bg-bad-soft/60 data-dragging:z-10 data-dragging:shadow-md')}>
              <span aria-hidden data-no-scrub="" onPointerDown={(e) => startDrag(e, id)} title="Drag to move"
                className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"><GripVertical className="size-3.5" /></span>
              <span aria-hidden className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1">{byId.get(id)?.label}</span>
              <span className="flex shrink-0">
                <Button variant="ghost" size="icon-xs" data-focus={`${id}:up`} disabled={index === 0} aria-label={`Move “${plain(id)}” up`} onClick={() => shift(index, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" data-focus={`${id}:down`} disabled={index === answer.length - 1} aria-label={`Move “${plain(id)}” down`} onClick={() => shift(index, 1)}><ArrowDown /></Button>
                <Button variant="ghost" size="icon-xs" data-focus={`${id}:remove`} aria-label={`Remove “${plain(id)}” from your answer`} onClick={() => remove(id)}><Minus /></Button>
              </span>
            </li>
          ))}
          {!answer.length && <li className="px-1 py-2 text-[12.5px] text-muted-foreground">{answerEmpty}</li>}
        </ol>
      </section>
    </div>
  );
}

// ---------- Answer inputs ----------

export type AnswerPreview = { kind: 'ok'; text: React.ReactNode } | { kind: 'error'; message: React.ReactNode } | { kind: 'none' };

export interface AnswerInputProps {
  id: string; value: string; onChange(value: string): void; onSubmit(): void;
  /** What the typed value reads as (or what is wrong with it), on a line of its own. */
  preview?: AnswerPreview;
  labelledBy?: string; label?: string; describedBy?: string;
  /** In running text (a fill-in-the-blank): narrow, and the preview floats under it while focused. */
  compact?: boolean;
  mark?: 'correct' | 'incorrect';
  mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** Shown in the empty field (a blank's number), gone once something is typed. */
  placeholder?: string;
}

/** A text field with a reserved preview line: typing, previewing and marking never move anything. */
export function AnswerInput({ id, value, onChange, onSubmit, preview = { kind: 'none' }, labelledBy, label, describedBy, compact, mark, mono = true, inputMode, placeholder }: AnswerInputProps) {
  const previewId = `${id}-preview`;
  return (
    <span className={cn('answer-field', compact && 'compact', mark)} data-mark={mark}>
      <Input
        id={id}
        className={cn('answer-input', mono && 'font-mono', compact ? 'h-7 px-2 text-[13px]' : 'h-9 text-[15px]')}
        type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode={inputMode} placeholder={placeholder}
        value={value}
        aria-labelledby={labelledBy}
        aria-label={label}
        aria-describedby={[previewId, describedBy].filter(Boolean).join(' ')}
        aria-invalid={preview.kind === 'error' || mark === 'incorrect' || undefined}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onSubmit(); } }}
      />
      <span id={previewId} className={cn('answer-preview', preview.kind === 'error' && 'is-error')}>
        {preview.kind === 'ok' && preview.text}
        {preview.kind === 'error' && <><CircleAlert size={13} aria-hidden /> {preview.message}</>}
      </span>
    </span>
  );
}

/** Reads a typed number: a point or a comma as the decimal mark, spaces or underscores between thousands. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(/[\s  _]/g, '');
  if (!/\d/.test(t) || !/^[-+]?\d*(?:[.,]\d*)?(?:e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

/** A number: the preview says how it was read (with its unit), or that it is not a number yet. */
export function NumberAnswer({ unit, ...props }: Omit<AnswerInputProps, 'preview' | 'inputMode'> & { unit?: string }) {
  const n = parseNumber(props.value);
  const preview: AnswerPreview = !props.value.trim() ? { kind: 'none' }
    : Number.isNaN(n) ? { kind: 'error', message: 'Not a number yet' }
    : { kind: 'ok', text: <>Reads as <code>{n.toLocaleString('en', { maximumFractionDigits: 6 })}{unit ? ` ${unit}` : ''}</code></> };
  return <AnswerInput {...props} preview={preview} inputMode="decimal" />;
}

/** Free text in one line (a word, a name): no preview, but its line is still reserved. */
export function TextAnswer(props: Omit<AnswerInputProps, 'preview' | 'mono'>) {
  return <AnswerInput {...props} mono={false} />;
}
