// The playground: every base component and every derived one, live. "Components" lays them out to
// try one by one (hover, focus, keyboard, menus, dialogs, toasts). The sidebar and the panes together are a
// fixture (src/derived/screen.fixture.tsx, src/derived/panes/Workspace.fixture.tsx). The bar at
// the top switches theme and frame size, and opens the Debug dialog (Debug.tsx). The theme is in the
// URL (route.ts) as well as saved, so a link opens on what it was copied from.
import * as React from 'react';
import { notify, setNotificationRoutes } from '../src/base/notify';
import { applyTheme } from '../src/base/theme';
import { ThemeIcon } from '../src/base/theme-icon';
import {
  ArrowRight, Bell, BookOpen, Bot, Check, CircleAlert, CircleCheck, Clock, Columns2, Eye, Hourglass, Info, Layers, Lightbulb,
  Inbox, Loader2, NotebookPen, Pause, Pencil, RefreshCw, Search, Sparkles, Tag, Trash2, TriangleAlert, Upload, X,
  Maximize, Monitor, Smartphone, Tablet,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../src/base/accordion';
import { Alert, AlertDescription, AlertTitle } from '../src/derived/alert';
import { Avatar, AvatarFallback } from '../src/base/avatar';
import { Button } from '../src/base/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../src/derived/card';
import { Checkbox } from '../src/base/checkbox';
import { Chip, type ChipTone } from '../src/base/chip';
import { CopyField } from '../src/base/copy-field';
import { Empty } from '../src/base/empty';
import { Field, FieldCheck, FieldGroup } from '../src/base/field';
import { FilterChip, FilterChips } from '../src/base/filter-chips';
import { SearchInput } from '../src/base/search-input';
import { Combobox } from '../src/base/combobox';
import { Segmented, SegmentedItem } from '../src/base/segmented';
import { Stat, StatGroup } from '../src/base/stat';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../src/base/table';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../src/base/dialog';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '../src/base/dropdown-menu';
import { Input } from '../src/base/input';
import { Kbd } from '../src/base/kbd';
import { Label } from '../src/base/label';
import { Mark, type MarkTone } from '../src/base/mark';
import { Popover, PopoverContent, PopoverTrigger } from '../src/base/popover';
import { Progress } from '../src/base/progress';
import { RadioGroup, RadioGroupItem } from '../src/base/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../src/base/select';
import { Separator } from '../src/base/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../src/base/sheet';
import { Skeleton } from '../src/base/skeleton';
import { Notifications } from '../src/base/notifications';
import { Switch } from '../src/base/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/base/tabs';
import { Textarea } from '../src/base/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../src/base/tooltip';
import { landing, project, useDrag, useSpring } from '../src/lib/motion';
import { Callout } from '../src/derived/widgets/callout';
import { CodeBlock, DataTable, Figure, KeyPoints, MathCard, Solution } from '../src/derived/widgets/blocks';
import { Question } from '../src/derived/widgets/question';
import { DebugButton, LayoutShifts } from './Debug';
import { useDebugSettings } from './debug-settings';
import { navigate, parseRoute, routeSearch, savedTheme, SIZE_HEIGHT, SIZE_WIDTH, SIZES, store, useRoute, type Size, type Theme } from './route';

export function App() {
  const route = useRoute();
  // the URL's theme wins; without it, what was saved (then the system's)
  const [chosenTheme, setChosenTheme] = React.useState<Theme>(savedTheme);
  const theme = route.theme ?? chosenTheme;
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    // The page changes at once, no transition (base/theme.ts); React draws the button after.
    applyTheme(next);
    React.startTransition(() => setChosenTheme(next));
    store('pg/theme', next);
    if (route.theme) navigate({ ...route, theme: next }, 'replace');
  };
  const debug = useDebugSettings();
  React.useEffect(() => { applyTheme(theme); }, [theme]);
  // Where clicking a notification goes, by its type (in the app: the job, the lesson, the inbox).
  React.useEffect(() => {
    setNotificationRoutes({
      error: () => { requestAnimationFrame(() => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' })); },
    });
  }, []);
  const content = <Components />;
  // A window no wider than the chosen size (a real phone) draws the page itself: a frame would not fit.
  const roomy = useWider(route.size ? SIZE_WIDTH[route.size] + 32 : 0);
  // Inside the size frame: the page alone, at the frame's width (its own media queries apply).
  if (route.embed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex h-dvh flex-col"><div className="min-h-0 flex-1">{content}</div><Notifications /></div>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-dvh flex-col">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-1.5 sm:flex-nowrap sm:px-4">
          <span aria-hidden className="size-6 rounded-md bg-foreground" />
          <strong className="hidden text-sm sm:block">Portable UI</strong>
          <Version />
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <SizeSwitch size={route.size} />
            <DebugButton />
            <Button variant="ghost" size="icon-sm" aria-label={theme === 'light' ? 'Dark theme' : 'Light theme'} onClick={toggleTheme}>
              <ThemeIcon />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          {route.size && roomy ? <SizeFrame size={route.size} theme={theme} /> : content}
        </div>
        <Notifications />
        {debug.layoutShifts && <LayoutShifts />}
      </div>
    </TooltipProvider>
  );
}

/** Whether the window is wider than `px` (always, for 0). */
function useWider(px: number) {
  const query = `(min-width: ${px}px)`;
  const [wider, setWider] = React.useState(() => !px || !!window.matchMedia?.(query).matches);
  React.useEffect(() => {
    const list = px ? window.matchMedia?.(query) : undefined;
    if (!list) { setWider(true); return; }
    const change = () => setWider(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [px, query]);
  return wider;
}

const SIZE_LABEL: Record<Size, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' };

/** Fit (the whole window) or a device width: the playground is then drawn in a frame that wide. */
function SizeSwitch({ size }: { size: Size | null }) {
  return (
    <div role="group" aria-label="Width" className="hidden items-center rounded-lg border bg-muted p-0.5 sm:flex">
      {([null, ...SIZES] as (Size | null)[]).map((s) => (
        <button key={s ?? 'fit'} type="button" aria-pressed={size === s} title={s ? `${SIZE_LABEL[s]} · ${SIZE_WIDTH[s]}px wide` : 'The whole window'}
          onClick={() => navigate({ ...parseRoute(location.search), size: s }, 'replace')}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs ui-focus [&_svg]:size-3.5">
          {s === 'phone' ? <Smartphone aria-hidden /> : s === 'tablet' ? <Tablet aria-hidden /> : s === 'desktop' ? <Monitor aria-hidden /> : <Maximize aria-hidden />}
          <span className="hidden lg:inline">{s ? SIZE_LABEL[s] : 'Fit'}</span>
        </button>
      ))}
    </div>
  );
}

/** The playground at a device's size: itself, in a frame that wide (and, for a phone or a tablet, that
 *  tall), so the components' own phone and tablet layouts (their media queries) apply, as they would
 *  on that device. A phone or a tablet is a touch screen: a mouse in the frame is a finger (touch.ts). */
function SizeFrame({ size, theme }: { size: Size; theme: Theme }) {
  const here = parseRoute(location.search);
  const touch = size !== 'desktop';
  const src = `${location.pathname}${routeSearch({ ...here, theme, size: null, embed: touch ? 'touch' : '1' })}`;
  const tall = SIZE_HEIGHT[size];
  return (
    <div className="flex h-full justify-center overflow-auto bg-muted/50 p-4">
      <div className="flex h-full shrink-0 flex-col gap-1.5" style={{ width: SIZE_WIDTH[size], maxHeight: tall ? tall + 24 : undefined }}>
        <span className="text-center font-mono text-[11px] text-muted-foreground">
          {SIZE_LABEL[size]} · {tall ? `${SIZE_WIDTH[size]} × ${tall}` : `${SIZE_WIDTH[size]}px`}{touch && ' · touch: the mouse is a finger'}
        </span>
        <iframe key={theme} title={`The playground at ${SIZE_WIDTH[size]}px`} src={src} className="min-h-0 flex-1 rounded-xl border bg-background shadow-sm" />
      </div>
    </div>
  );
}

/** Which build this is: the package version, and the commit and time it was built from. */
function Version() {
  const built = new Date(__PG_BUILT__);
  const when = built.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="version" className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35">
          v{__PG_VERSION__}{__PG_COMMIT__ ? <span className="hidden sm:inline"> · {__PG_COMMIT__}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">portable-ui {__PG_VERSION__}{__PG_COMMIT__ ? ` · commit ${__PG_COMMIT__}` : ''} · built {when}</TooltipContent>
    </Tooltip>
  );
}

// ------------------------------------------------------------------ components

// The grids in the sections are grid-cols-1 at their narrowest: a grid's own column is otherwise as
// wide as its widest content (a formula, a row of controls), and on a phone it pushed the page
// sideways (17 Nov).
function Section({ id, title, layer, children, wide = false }: { id?: string; title: string; layer: 'base' | 'derived'; children: React.ReactNode; wide?: boolean }) {
  return (
    <section id={id} className={`min-w-0 rounded-xl border bg-card p-4 sm:p-5 ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}<span className="rounded border px-1.5 py-px font-mono text-[10px] tracking-normal normal-case">{layer}</span>
      </h2>
      {children}
    </section>
  );
}

/** The spring core (lib/motion) on its own: drag the puck and flick it. Where it lands is where the
 *  flick would carry it, and it gets there at the speed it was let go with. Grab it mid-flight. */
function MotionDemo() {
  const track = React.useRef<HTMLDivElement>(null);
  const puck = React.useRef<HTMLDivElement>(null);
  const [said, setSaid] = React.useState('Drag the puck, or flick it.');
  const x = useSpring(0, (v) => puck.current?.style.setProperty('translate', `${v}px 0`));
  const base = React.useRef(0);
  const snaps = () => { const w = (track.current?.clientWidth ?? 300) - (puck.current?.offsetWidth ?? 40) - 8; return [0, w / 2, w]; };
  const drag = useDrag({
    axis: 'x',
    threshold: 2,
    onStart: () => { base.current = x.value; },
    onMove: (d) => x.set(base.current + d),
    onEnd: (d, velocity) => {
      const at = base.current + d;
      const end = landing(at, velocity, snaps());
      setSaid(`Let go at ${Math.round(velocity)} px/s: it would carry to ${Math.round(project(at, velocity))} px, so it lands on stop ${snaps().indexOf(end) + 1}.`);
      x.to(end, { velocity });
    },
  });
  return (
    <div className="grid grid-cols-1 gap-3">
      <div ref={track} className="relative h-12 rounded-full bg-muted">
        {[0, 1, 2].map((i) => <span key={i} aria-hidden className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-muted-foreground/40" style={{ left: ['21px', 'calc(50% - 3px)', 'calc(100% - 27px)'][i] }} />)}
        <div ref={puck} {...drag} role="presentation" className="absolute top-1 left-1 size-10 cursor-grab touch-none rounded-full bg-foreground shadow-md active:cursor-grabbing" />
      </div>
      <p className="text-xs text-muted-foreground">{said} Sheets, the dialog's top edge, the switch, the tab pill, notifications and the phone's page bar all move this way.</p>
    </div>
  );
}

const Row = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div className="mb-3.5 flex flex-wrap items-center gap-3 last:mb-0">
    {label && <span className="w-full text-xs text-muted-foreground sm:w-24">{label}</span>}
    {children}
  </div>
);

const LESSONS = ['Continuity', 'Epsilon–delta', 'One-sided limits', 'What a limit is', 'Rate of change'];
let published = 0;

const MARKS: { tone: MarkTone; icon: React.ReactElement; label: string; detail?: string; count?: number; solid?: boolean }[] = [
  { tone: 'ok', icon: <Check />, label: 'Done', detail: 'Finished in 2 min' },
  { tone: 'info', icon: <RefreshCw />, label: 'Running', detail: 'Started 40 s ago' },
  { tone: 'neutral', icon: <Clock />, label: 'Queued', detail: '2 jobs ahead' },
  { tone: 'warn', icon: <Pause />, label: 'Paused', detail: 'Waiting for a worker' },
  { tone: 'bad', icon: <X />, label: 'Failed', detail: 'Worker lost connection', solid: true },
  { tone: 'info', icon: <Sparkles />, label: 'New', detail: 'Added today', solid: true },
  { tone: 'warn', icon: <Pencil />, label: 'Draft', detail: 'Not published yet' },
  { tone: 'thm', icon: <Bot />, label: 'Agent-assisted', detail: 'Drafted with an AI agent, reviewed by staff' },
  { tone: 'info', icon: <Eye />, label: 'In review' },
  { tone: 'ok', icon: <Upload />, label: 'Published', detail: 'Students can read it' },
  { tone: 'neutral', icon: <Tag />, label: 'Version 0.6.3' },
  { tone: 'ok', icon: <BookOpen />, label: 'Read' },
  { tone: 'info', icon: <BookOpen />, label: 'Reading · 60%', detail: 'Stopped at “Choosing δ”' },
  { tone: 'warn', icon: <Layers />, label: 'Review cards due', detail: 'Oldest from Tuesday', count: 8 },
  { tone: 'info', icon: <NotebookPen />, label: 'Questions left', count: 12 },
  { tone: 'neutral', icon: <Hourglass />, label: 'Coming soon' },
  { tone: 'ok', icon: <Check />, label: 'Correct' },
  { tone: 'bad', icon: <CircleAlert />, label: 'Not quite', solid: true },
  { tone: 'warn', icon: <Lightbulb />, label: 'Hint available' },
  { tone: 'ok', icon: <RefreshCw />, label: 'Synced', detail: 'Progress saved to your account' },
];

const TAGS_IN_USE = ['Backend', 'Database', 'Design', 'Frontend', 'Testing'];

/** Field, FieldGroup, FieldCheck, SearchInput, Combobox and CopyField: a label, hint and error wired
 *  to each control with no ids written by hand. */
function FieldsDemo() {
  const [code, setCode] = React.useState('AB-41X');
  const [query, setQuery] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [tags, setTags] = React.useState<string[]>(['Frontend']);
  const found = LESSONS.filter((l) => l.toLowerCase().includes(query.trim().toLowerCase()));
  const codeError = !code.trim() ? 'Enter the code your teacher gave you.' : code.trim().toUpperCase() === 'AB-41X' ? 'That code has expired.' : null;
  return (
    <div className="grid grid-cols-1 gap-5">
      <FieldGroup>
        <Field label="Email" hint="We send the sign-in link here."><Input type="email" placeholder="you@example.com" /></Field>
        <Field label="Password" hint="Click in: the outline grows."><Input type="password" defaultValue="correct horse" /></Field>
      </FieldGroup>
      <FieldGroup>
        <Field label="Invite code" hint="Type another code to clear the error." error={codeError}><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Class">
          <Select defaultValue="demo"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="demo">DEMO 100 · Fall 2026</SelectItem><SelectItem value="math">MATH 232 · Fall 2026</SelectItem><SelectItem value="old" disabled>DEMO 100 · Spring 2026 (ended)</SelectItem></SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Field label="Note to the reviewer" optional><Textarea placeholder="What changed since the last draft" /></Field>
      <div className="grid grid-cols-1 gap-2.5">
        <FieldCheck label="Email me when a lesson is added" hint="At most one email a day, with every new lesson in it."><Switch defaultChecked /></FieldCheck>
        <FieldCheck label="Show worked solutions"><Checkbox /></FieldCheck>
      </div>
      <Field label="Search lessons" hint={query ? `${found.length} of ${LESSONS.length}: ${found.join(', ') || 'none'}` : 'Type to narrow the list; Escape clears.'}>
        <SearchInput placeholder="Continuity, limits…" value={query} onValueChange={setQuery} />
      </Field>
      <Field label="Add a tag" hint={`Tags: ${tags.join(', ')}. Type to narrow the suggestions, ↑ ↓ and Enter, or a new one and Enter.`}>
        <Combobox value={tag} onValueChange={setTag} allowCreate placeholder="Backend, Design…"
          options={TAGS_IN_USE.filter((t) => !tags.includes(t))} onChoose={(t) => { setTags((x) => [...x, t]); setTag(''); }} />
      </Field>
      <Field label="Invite link" hint="Anyone with the link can join DEMO 100 · Fall 2026.">
        <CopyField value="https://app.example/join/DEMO100-F26"
          onCopied={(ok) => notify(ok ? { tone: 'success', title: 'Invite link copied' } : { tone: 'warning', title: 'Copy it by hand', description: 'The browser did not let the page use the clipboard; the link is selected.' })} />
      </Field>
    </div>
  );
}

const KIND_FILTERS = [
  { value: 'all', label: 'All', count: 27 },
  { value: 'lesson', label: 'Lessons', count: 18 },
  { value: 'practice', label: 'Practice', count: 9 },
];

/** Segmented (one view of a few, cannot be emptied, its pill slides on springs) and FilterChips. */
function SegmentsDemo() {
  const [view, setView] = React.useState('lesson');
  const [kind, setKind] = React.useState('all');
  const [news, setNews] = React.useState<string[]>(['lesson', 'fix']);
  return (
    <div className="grid grid-cols-1 gap-1">
      <Row label="Segmented">
        <Segmented aria-label="View" value={view} onValueChange={setView}>
          <SegmentedItem value="lesson">As readers see it</SegmentedItem>
          <SegmentedItem value="text">Text and comments</SegmentedItem>
          <SegmentedItem value="changes" count={3}>What changed</SegmentedItem>
        </Segmented>
      </Row>
      <Row label="Small">
        <Segmented size="sm" aria-label="Period" defaultValue="week">
          <SegmentedItem value="week">Week</SegmentedItem><SegmentedItem value="term">Term</SegmentedItem><SegmentedItem value="all">All time</SegmentedItem>
        </Segmented>
      </Row>
      <Row label="Filter: one">
        <FilterChips aria-label="Lesson kinds" value={kind} onValueChange={setKind}>
          {KIND_FILTERS.map((k) => <FilterChip key={k.value} value={k.value} count={k.count}>{k.label}</FilterChip>)}
        </FilterChips>
      </Row>
      <Row label="Filter: any">
        <FilterChips type="multiple" aria-label="What's new kinds" value={news} onValueChange={setNews}>
          <FilterChip value="lesson" count={6}>New lessons</FilterChip>
          <FilterChip value="fix" count={2}>Fixes</FilterChip>
          <FilterChip value="practice" count={4}>Practice</FilterChip>
        </FilterChips>
      </Row>
      <p className="text-xs text-muted-foreground">Showing {view === 'lesson' ? 'the lesson' : view === 'text' ? 'its source' : 'the changes'}; {kind === 'all' ? 'every kind' : KIND_FILTERS.find((k) => k.value === kind)?.label.toLowerCase()}; What's new: {news.length ? news.join(', ') : 'nothing picked'}.</p>
    </div>
  );
}

type LectureRow = { id: string; title: string; offering: string; lessons: number; state: 'published' | 'review' | 'draft'; updated: string };
const LECTURE_ROWS: LectureRow[] = [
  { id: 'limits', title: 'Limits and continuity', offering: 'DEMO 100 · Fall 2026', lessons: 6, state: 'published', updated: '12 Nov' },
  { id: 'derivative', title: 'The derivative', offering: 'DEMO 100 · Fall 2026', lessons: 4, state: 'review', updated: '14 Nov' },
  { id: 'plane', title: 'Complex numbers and the plane', offering: 'MATH 232 · Fall 2026', lessons: 5, state: 'draft', updated: '15 Nov' },
  { id: 'contours', title: 'Contour integrals', offering: 'MATH 232 · Fall 2026', lessons: 0, state: 'draft', updated: '' },
];
const STATE_CHIP: Record<LectureRow['state'], { tone: ChipTone; label: string }> = {
  published: { tone: 'ok', label: 'Published' },
  review: { tone: 'info', label: 'In review' },
  draft: { tone: 'warn', label: 'Draft' },
};

/** Stat tiles, a Table (stacked into cards at phone width; try the size picker) and Empty. */
function TablesDemo() {
  const [rows, setRows] = React.useState(LECTURE_ROWS);
  const [stack, setStack] = React.useState(true);
  const published = rows.filter((r) => r.state === 'published').length;
  return (
    <div className="grid grid-cols-1 gap-5">
      <StatGroup aria-label="This term at a glance">
        <Stat label="Lectures" value={rows.length} hint="in 2 offerings" />
        <Stat label="Published" value={published} tone="ok" />
        <Stat label="In review" value={rows.filter((r) => r.state === 'review').length} tone="info" />
        <Stat label="Drafts" value={rows.filter((r) => r.state === 'draft').length} tone="warn" />
        <Stat label="Failed jobs" value={1} tone="bad" hint="since Monday" />
      </StatGroup>
      <FieldCheck label="Stack rows into cards on a phone" hint="Below the md breakpoint; off, the table scrolls sideways."><Switch checked={stack} onCheckedChange={setStack} /></FieldCheck>
      {rows.length ? (
        <Table stack={stack}>
          <TableCaption>Lectures in your offerings. Remove one to see the rows close up.</TableCaption>
          <TableHeader>
            <TableRow><TableHead>Lecture</TableHead><TableHead>Offering</TableHead><TableHead className="text-right">Lessons</TableHead><TableHead>State</TableHead><TableHead>Updated</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell label="Offering" className="text-muted-foreground">{r.offering}</TableCell>
                <TableCell label="Lessons" className="text-right tabular-nums max-md:text-left">{r.lessons || ''}</TableCell>
                <TableCell><Chip tone={STATE_CHIP[r.state].tone}>{STATE_CHIP[r.state].label}</Chip></TableCell>
                <TableCell label="Updated" className="whitespace-nowrap text-muted-foreground">{r.updated}</TableCell>
                <TableCell className="text-right max-md:text-left">
                  <Button variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}><Trash2 />Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty icon={<BookOpen />} title="No lectures yet" className="rounded-xl border border-dashed"
          action={<Button size="sm" variant="outline" onClick={() => setRows(LECTURE_ROWS)}>Put them back</Button>}>
          Lectures you add appear here, in the order students read them.
        </Empty>
      )}
      <Empty icon={<Inbox />} title="No requests waiting" className="rounded-xl border">
        When a student asks to contribute a lesson to DEMO 100, it waits here for you.
      </Empty>
    </div>
  );
}

function Components() {
  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState(58);
  // Keep absolutely positioned screen-reader labels inside the scroll area.
  return (
    <main className="relative h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-2">
        <p className="text-sm text-muted-foreground lg:col-span-2">
          <b className="text-foreground">base</b>: shadcn/ui components, copied in with their Radix behaviour and restyled (Geist, black and white, semantic colour, focus grows the outline).{' '}
          <b className="text-foreground">derived</b>: built from base: marks' uses, the sidebar, panes and the widgets that render lessons. Tab through everything; hover a mark for its tooltip.
        </p>

        <Section title="Motion" layer="base">
          <MotionDemo />
        </Section>

        <Section title="Buttons" layer="base">
          <Row label="Variants"><Button>Start reading</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="link">Link</Button></Row>
          <Row label="Meaning"><Button variant="destructive" onClick={() => notify({ tone: 'error', title: 'Lecture deleted', action: { label: 'Undo', onClick: () => notify({ tone: 'success', title: 'Restored' }) } })}><Trash2 />Delete lecture</Button><Button variant="success" onClick={() => notify({ tone: 'success', title: 'Lesson approved' })}><Check />Approve</Button></Row>
          <Row label="Sizes"><Button size="xs">Extra small</Button><Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button><Button size="icon" variant="outline" aria-label="Search"><Search /></Button></Row>
          <Row label="States">
            <Button disabled={saving} onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500); }}>{saving ? <><Loader2 className="animate-spin" />Saving…</> : 'Click to save'}</Button>
            <Button disabled>Disabled</Button><Button variant="outline">Next lesson <ArrowRight /></Button>
          </Row>
        </Section>

        <Section title="Fields" layer="base">
          <FieldsDemo />
        </Section>

        <Section title="Choices" layer="base">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-3">
              <Label className="font-normal"><Checkbox defaultChecked />Show worked solutions</Label>
              <Label className="font-normal"><Checkbox />Email me when a lesson is added</Label>
              <RadioGroup defaultValue="a" className="mt-1">
                <Label className="font-normal"><RadioGroupItem value="a" />Every lesson</Label>
                <Label className="font-normal"><RadioGroupItem value="b" />Only practice</Label>
              </RadioGroup>
            </div>
            <div className="grid grid-cols-1 content-start gap-3">
              <Label className="font-normal"><Switch defaultChecked />Show progress</Label>
              <Label className="font-normal"><Switch />Reduce motion</Label>
              <div className="grid grid-cols-1 gap-1.5"><div className="flex justify-between text-sm">Chapter progress <span className="font-mono text-xs">{Math.round(progress / 100 * 12)} / 12</span></div>
                <Progress value={progress} className="[&>[data-slot=progress-indicator]]:bg-ok" />
                <div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 10))}>−</Button><Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 10))}>+</Button></div></div>
            </div>
          </div>
          <Separator className="my-5" />
          <SegmentsDemo />
        </Section>

        <Section title="Tabs, accordion" layer="base">
          <Tabs defaultValue="questions">
            <TabsList><TabsTrigger value="questions">Questions</TabsTrigger><TabsTrigger value="practice">Practice</TabsTrigger><TabsTrigger value="assignments">Assignments</TabsTrigger></TabsList>
            <TabsContent value="questions" className="pt-2 text-sm text-muted-foreground">Every question in the course. Arrow keys move between tabs.</TabsContent>
            <TabsContent value="practice" className="pt-2 text-sm text-muted-foreground">Chapter practice sets.</TabsContent>
            <TabsContent value="assignments" className="pt-2 text-sm text-muted-foreground">Graded work, with due dates.</TabsContent>
          </Tabs>
          <Tabs defaultValue="overview" className="mt-5">
            <TabsList variant="line"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="lessons">Lessons</TabsTrigger><TabsTrigger value="members">Members</TabsTrigger></TabsList>
          </Tabs>
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="a"><AccordionTrigger>How is progress saved?</AccordionTrigger><AccordionContent>On your account, as you read.</AccordionContent></AccordionItem>
            <AccordionItem value="b"><AccordionTrigger>Can I read offline?</AccordionTrigger><AccordionContent>Lessons you opened stay in the browser.</AccordionContent></AccordionItem>
          </Accordion>
        </Section>

        <Section title="Overlays: menu, dialog, sheet, popover, tooltip, toast" layer="base">
          <Row>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline">Lesson menu</Button></DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Continuity</DropdownMenuLabel>
                <DropdownMenuItem><Columns2 />Open beside<DropdownMenuShortcut>⇧ Click</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem><Layers />New tab here<DropdownMenuShortcut>Alt Click</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuSub><DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent><DropdownMenuItem>Left pane</DropdownMenuItem><DropdownMenuItem>Right pane</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked>Show solutions</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive"><X />Close<DropdownMenuShortcut>Del</DropdownMenuShortcut></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline">Dialog</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Delete “Lecture 04”?</DialogTitle><DialogDescription>Its 3 lessons stay published; their citations to it stop working.</DialogDescription></DialogHeader>
                <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><DialogClose asChild><Button variant="destructive" onClick={() => notify({ tone: 'error', title: 'Lecture 04 deleted' })}>Delete</Button></DialogClose></DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild><Button variant="outline">Sheet</Button></SheetTrigger>
              <SheetContent><SheetHeader><SheetTitle>Sources</SheetTitle><SheetDescription>Slides 12–18 of Lecture 04. Drag it back toward the edge, or flick it.</SheetDescription></SheetHeader></SheetContent>
            </Sheet>
            <Sheet edgeSwipe="left">
              <SheetTrigger asChild><Button variant="outline">Left sheet</Button></SheetTrigger>
              <SheetContent side="left"><SheetHeader><SheetTitle>Chapters</SheetTitle><SheetDescription>On a phone, drag in from the left edge of the window to pull this out.</SheetDescription></SheetHeader></SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild><Button variant="outline">Bottom sheet</Button></SheetTrigger>
              <SheetContent side="bottom"><SheetHeader><SheetTitle>Open pages</SheetTitle><SheetDescription>Drag it down to close it; let go early and it springs back.</SheetDescription></SheetHeader></SheetContent>
            </Sheet>
            <Popover>
              <PopoverTrigger asChild><Button variant="outline">Popover</Button></PopoverTrigger>
              <PopoverContent className="text-sm">Cited from slide 14.</PopoverContent>
            </Popover>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Notifications"><Bell /></Button></TooltipTrigger><TooltipContent>Notifications · instant</TooltipContent></Tooltip>
          </Row>
          <Row label="Toasts">
            <Button size="sm" variant="outline" onClick={() => notify({ title: 'Closed “Limits”', action: { label: 'Undo', onClick: () => undefined } })}>Neutral</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'success', title: 'Lesson published', description: 'Continuity' })}>Success</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'info', title: 'Generating 3 lessons' })}>Info</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'warning', title: 'Slides 14–16 unreadable' })}>Warning</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'error', title: 'Upload failed', description: 'The file is over 50 MB.' })}>Error</Button>
          </Row>
          <Row label="Stacks">
            <Button size="sm" variant="outline" onClick={() => {
              // a new lesson each time (the same one again is the warning beside it), so only that one piles
              const i = published++, round = Math.floor(i / LESSONS.length);
              notify({ tone: 'success', title: 'Lesson published', description: `${LESSONS[i % LESSONS.length]}${round ? ` ${round + 1}` : ''}` });
            }}>Publish a lesson (repeat me)</Button>
            <Button size="sm" variant="outline" onClick={() => ['Lecture 03', 'Lecture 04', 'Lecture 05', 'Lecture 06', 'Lecture 07'].forEach((l, i) => setTimeout(() => notify({ tone: 'error', title: 'Upload failed', description: `${l}: the file is over 50 MB.` }), i * 300))}>Five failures</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'warning', title: 'Slides 14–16 unreadable', description: 'Lessons from them cite nothing.' })}>Same one again (repeat me)</Button>
            <Button size="sm" variant="outline" onClick={() => notify({ tone: 'error', title: 'Upload failed', description: 'Click to see it (errors route to the Alerts section).' })}>Clickable</Button>
          </Row>
          <p className="text-xs text-muted-foreground">Each type stacks on its own, errors first. Only the front one counts down; hover a stack to open it and stop its time (on a touch screen, tap it; a tap outside or Show less closes it), and its header says how many there are. The same one again piles its icon; press the pile to see each. Clicking a notification opens what its type leads to; swipe one sideways to dismiss it.</p>
          <Row label="Keys, avatar"><Kbd>Ctrl K</Kbd><Kbd>Alt ⇧ →</Kbd><Avatar><AvatarFallback>MA</AvatarFallback></Avatar><Skeleton className="h-4 w-32" /></Row>
        </Section>

        <Section id="alerts" title="Alerts" layer="base">
          <div className="grid grid-cols-1 gap-3">
            <Alert variant="ok"><CircleCheck /><AlertTitle>Lesson published</AlertTitle><AlertDescription>Students in DEMO 100 can read it now.</AlertDescription></Alert>
            <Alert variant="info"><Info /><AlertTitle>Generating 3 lessons</AlertTitle><AlertDescription>About 4 minutes left.</AlertDescription></Alert>
            <Alert variant="warn"><TriangleAlert /><AlertTitle>Slides 14–16 unreadable</AlertTitle><AlertDescription>Lessons from them cite nothing.</AlertDescription></Alert>
            <Alert variant="bad"><CircleAlert /><AlertTitle>Upload failed</AlertTitle><AlertDescription>The file is over 50 MB.</AlertDescription></Alert>
          </div>
        </Section>

        <Section title="Marks: badges with instant tooltips" layer="base" wide>
          <div className="flex flex-wrap gap-x-7 gap-y-5">
            {MARKS.map((m) => (
              <div key={m.label} className="grid w-20 justify-items-center gap-2 text-center text-[11px] text-muted-foreground">
                <Mark tone={m.tone} icon={m.icon} label={m.label} detail={m.detail} count={m.count} solid={m.solid} />{m.label}
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <Card className="gap-0 py-0">
            {[['01', 'What a limit is', <Mark key="m" tone="ok" icon={<BookOpen />} label="Read" />],
              ['02', 'Epsilon–delta', <span key="m" className="flex gap-2"><Mark tone="thm" icon={<Bot />} label="Agent-assisted" /><Mark tone="info" icon={<BookOpen />} label="Reading · 60%" detail="Stopped at “Choosing δ”" /></span>],
              ['03', 'Continuity', <Mark key="m" tone="info" solid icon={<Sparkles />} label="New" detail="Added today" />]].map(([n, t, m]) => (
              <div key={n as string} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
                <span className="font-mono text-xs text-muted-foreground">{n}</span><span className="flex-1 text-sm font-semibold">{t}</span>{m}
              </div>
            ))}
          </Card>
        </Section>

        <Section title="Card" layer="base">
          <Card>
            <CardHeader><CardTitle>DEMO 100 · Calculus</CardTitle><CardDescription>Fall 2026 · 18 lessons</CardDescription></CardHeader>
            <CardContent className="text-sm">7 of 18 lessons read.</CardContent>
            <CardFooter className="gap-2"><Button size="sm">Continue</Button><Button size="sm" variant="ghost">Formula sheet</Button></CardFooter>
          </Card>
        </Section>

        <Section title="Tables, stats, empty states" layer="base" wide>
          <TablesDemo />
        </Section>

        <Section title="Widgets: callouts" layer="derived">
          <div className="grid grid-cols-1 gap-3">
            <Callout purpose="note">Polynomials are continuous everywhere.</Callout>
            <Callout purpose="intuition">Draw it without lifting your pen.</Callout>
            <Callout purpose="warning">A limit existing does not make f continuous.</Callout>
            <Callout purpose="takeaway">The limit equals the value.</Callout>
          </div>
        </Section>

        <Section title="Widgets: math, solution, key points" layer="derived" wide>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MathCard kind="definition" name="Continuity" latex="\lim_{x\to a} f(x) = f(a)">f is continuous at a when the limit equals the value.</MathCard>
            <MathCard kind="theorem" name="Squeeze" latex="g \le f \le h,\ g, h \to L \implies f \to L" />
            <Solution><p>Factor and cancel: the limit is 4.</p></Solution>
            <KeyPoints items={['f(a) exists', 'the limit exists', 'they agree']} />
          </div>
        </Section>

        <Section title="Widgets: code, table, figure" layer="derived" wide>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CodeBlock language="python" code={'def f(x):\n    return (x**2 - 4) / (x - 2)'} />
            <DataTable columns={['x', 'f(x)']} rows={[['1.99', '3.99'], ['2.01', '4.01']]} />
            <Figure caption="A removable gap."><svg viewBox="0 0 120 40" className="h-16 w-full" aria-hidden><path d="M5 35 C 30 30, 45 15, 58 18" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M62 10 C 80 8, 100 20, 115 9" stroke="currentColor" strokeWidth="2" fill="none" /><circle cx="60" cy="18" r="3" fill="var(--background)" stroke="currentColor" strokeWidth="1.5" /></svg></Figure>
          </div>
        </Section>

        <Section title="Widgets: practice question" layer="derived" wide>
          <Question number={1} prompt="Which of these is continuous everywhere?" hint="Think about where each one jumps or blows up."
            options={[{ id: 'a', text: '1/x' }, { id: 'b', text: '|x|' }, { id: 'c', text: 'floor(x)' }]} answer="b" explanation="1/x is undefined at 0; floor jumps at every integer." />
        </Section>
      </div>
    </main>
  );
}
