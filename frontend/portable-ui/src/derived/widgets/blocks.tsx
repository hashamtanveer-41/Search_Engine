// The pieces that render lesson content (the lesson IR's block types), restyled: math cards,
// display math, the solution spoiler, key points, code, figures and tables.
import * as React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { BookMarked, ChevronRight, Copy, Sigma, Check, type LucideIcon } from 'lucide-react';
import { Button } from '../../base/button';
import { cn } from '../../lib/utils';

/** Display math, typeset by KaTeX. A formula KaTeX cannot read shows as its source, not an error. */
function MathBlock({ latex, className }: { latex: string; className?: string }) {
  const html = React.useMemo(() => katex.renderToString(latex, { displayMode: true, throwOnError: false }), [latex]);
  return <div data-slot="math" className={cn('overflow-x-auto py-1 text-center', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Inline math inside prose. */
function InlineMath({ latex }: { latex: string }) {
  const html = React.useMemo(() => katex.renderToString(latex, { throwOnError: false }), [latex]);
  return <span data-slot="inline-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

export type MathCardKind = 'definition' | 'theorem' | 'lemma' | 'formula';

const MATH_KINDS: Record<MathCardKind, { label: string; icon: LucideIcon; className: string }> = {
  definition: { label: 'Definition', icon: BookMarked, className: 'border-def-line bg-def-soft [&_[data-slot=math-card-label]]:text-def' },
  theorem: { label: 'Theorem', icon: Sigma, className: 'border-thm-line bg-thm-soft [&_[data-slot=math-card-label]]:text-thm' },
  lemma: { label: 'Lemma', icon: Sigma, className: 'border-thm-line bg-thm-soft [&_[data-slot=math-card-label]]:text-thm' },
  formula: { label: 'Formula', icon: Sigma, className: 'border-border bg-muted [&_[data-slot=math-card-label]]:text-foreground' },
};

/** A definition, theorem, lemma or key formula: a name, its statement and the formula itself. */
function MathCard({ kind, name, latex, children, className }: { kind: MathCardKind; name?: string; latex?: string; children?: React.ReactNode; className?: string }) {
  const k = MATH_KINDS[kind];
  const Icon = k.icon;
  return (
    <section data-slot="math-card" data-kind={kind} aria-label={name ? `${k.label}: ${name}` : k.label} className={cn('rounded-xl border px-4 py-3.5', k.className, className)}>
      <div data-slot="math-card-label" className="ui-caption mb-1 flex items-center gap-1.5 font-semibold">
        <Icon aria-hidden className="size-3.5" />{k.label}{name ? ` · ${name}` : ''}
      </div>
      {children && <div className="text-[14.5px] leading-relaxed">{children}</div>}
      {latex && <MathBlock latex={latex} />}
    </section>
  );
}

/** A worked solution: closed until the reader asks for it (and always open in print). */
function Solution({ title = 'Solution', children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <details data-slot="solution" className={cn('group rounded-xl border border-dashed', className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold outline-none select-none ui-focus [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Try it first, then show</span>
      </summary>
      <div className="border-t border-dashed px-4 py-3 text-[14.5px] leading-relaxed">{children}</div>
    </details>
  );
}

/** Key points: the few things to keep, numbered. */
function KeyPoints({ title = 'Key points', items, className }: { title?: string; items: React.ReactNode[]; className?: string }) {
  return (
    <section data-slot="key-points" aria-label={title} className={cn('rounded-xl border bg-card px-4 py-3.5', className)}>
      <div className="ui-caption mb-2">{title}</div>
      <ol className="grid gap-2">
        {items.map((item, i) => (
          <li key={i} className="grid grid-cols-[22px_1fr] gap-2 text-[14.5px] leading-relaxed">
            <span className="mt-0.5 grid size-5 place-items-center rounded-md bg-primary font-mono text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A code listing with its language and a copy button (the copy says so for a moment). */
function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };
  return (
    <figure data-slot="code" className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <figcaption className="flex h-9 items-center border-b bg-muted px-3 font-mono text-xs text-muted-foreground">
        {language ?? 'code'}
        <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the code'}>
          {copied ? <Check className="text-ok" /> : <Copy />}
        </Button>
      </figcaption>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed"><code>{code}</code></pre>
    </figure>
  );
}

/** A figure: the picture (or any drawing) on a quiet ground, and its caption. */
function Figure({ caption, children, className }: { caption?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <figure data-slot="figure" className={cn('grid gap-2', className)}>
      <div className="grid place-items-center overflow-hidden rounded-xl bg-muted p-4">{children}</div>
      {caption && <figcaption className="text-[13px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

/** A table: a header row, hairlines between rows, numbers in mono. */
function DataTable({ columns, rows, caption, className }: { columns: string[]; rows: React.ReactNode[][]; caption?: string; className?: string }) {
  return (
    <div data-slot="table" className={cn('overflow-x-auto rounded-xl border', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="px-3 pt-2.5 text-left text-[13px] text-muted-foreground">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c} className="border-b bg-muted px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 tabular-nums">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { MathBlock, InlineMath, MathCard, Solution, KeyPoints, CodeBlock, Figure, DataTable };
