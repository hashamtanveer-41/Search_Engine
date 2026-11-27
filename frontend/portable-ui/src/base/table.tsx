// Table: rows of records (lectures, offerings, classes, workers), in a rounded box with a muted
// header and a hover on each row. With `stack` (the default), under the md breakpoint each row
// becomes a small card of its cells stacked one under another: the header is kept for screen
// readers but not shown, empty cells are hidden, and a cell's `label` appears beside its value as a
// small caption in a column of its own (only there: on a wide screen the column header says it). Without `stack`, a narrow
// screen scrolls the table sideways instead.
//
// Rows added or removed spring in and out (installListSprings, lib/motion): TableBody is a
// [data-spring-list].
import * as React from 'react';
import { cn } from '../lib/utils';

const TableContext = React.createContext<{ stack: boolean }>({ stack: true });

export interface TableProps extends React.ComponentProps<'table'> {
  /** Under md, each row a stacked card (default true). */
  stack?: boolean;
  /** Classes for the box around the table (its border, its scrolling). */
  containerClassName?: string;
}

function Table({ stack = true, className, containerClassName, ...props }: TableProps) {
  const value = React.useMemo(() => ({ stack }), [stack]);
  return (
    <TableContext.Provider value={value}>
      <div data-slot="table-container"
        className={cn('relative w-full min-w-0 overflow-x-auto rounded-xl border bg-card', stack && 'max-md:overflow-visible', containerClassName)}>
        <table data-slot="table" data-stack={stack ? 'true' : 'false'}
          className={cn('w-full border-separate border-spacing-0 text-[13.5px]', stack && 'max-md:block', className)}
          {...props} />
      </div>
    </TableContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  const { stack } = React.useContext(TableContext);
  return <thead data-slot="table-header" className={cn(stack && 'max-md:sr-only', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  const { stack } = React.useContext(TableContext);
  return <tbody data-slot="table-body" data-spring-list="" className={cn(stack && 'max-md:block', className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  const { stack } = React.useContext(TableContext);
  return (
    <tr data-slot="table-row"
      className={cn(
        'hover:[&>td]:bg-accent/40',
        stack && 'max-md:grid max-md:gap-1.5 max-md:border-b max-md:px-4 max-md:py-3 max-md:last:border-b-0 max-md:hover:[&>td]:bg-transparent',
        className,
      )}
      {...props} />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th data-slot="table-head"
      className={cn('border-b bg-muted/60 px-3 py-2 text-left align-bottom text-xs font-medium whitespace-nowrap text-muted-foreground', className)}
      {...props} />
  );
}

const blank = (node: React.ReactNode) => node === null || node === undefined || node === false || node === '';

export interface TableCellProps extends React.ComponentProps<'td'> {
  /** What the cell is (its column's header), shown above it only in the stacked phone layout. */
  label?: React.ReactNode;
}

function TableCell({ label, className, children, ...props }: TableCellProps) {
  const { stack } = React.useContext(TableContext);
  const labelled = stack && !blank(label) && !blank(children);
  return (
    <td data-slot="table-cell"
      className={cn(
        'border-b px-3 py-2.5 align-middle [tr:last-child>&]:border-b-0',
        stack && 'max-md:block max-md:min-w-0 max-md:border-b-0 max-md:p-0 max-md:break-words max-md:empty:hidden',
        // Stacked with a caption: one line each, the caption in a column on the left, the value beside it.
        labelled && 'max-md:grid max-md:grid-cols-[minmax(5.5rem,30%)_1fr] max-md:items-baseline max-md:gap-x-3',
        className,
      )}
      {...props}>
      {/* Nothing in the cell: no caption either, so the cell stays empty (and hidden when stacked). */}
      {labelled && (
        <span data-slot="table-cell-label" aria-hidden className="hidden text-[11.5px] font-medium text-muted-foreground max-md:block">{label}</span>
      )}
      {labelled ? <span data-slot="table-cell-value" className="min-w-0">{children}</span> : children}
    </td>
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  const { stack } = React.useContext(TableContext);
  return (
    <caption data-slot="table-caption"
      className={cn('caption-bottom border-t px-3 py-2 text-left text-xs text-muted-foreground',
        // Stacked, the table is a block and the caption stays where HTML puts it: first, so on top.
        stack && 'max-md:block max-md:border-t-0 max-md:border-b max-md:px-4', className)}
      {...props} />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
