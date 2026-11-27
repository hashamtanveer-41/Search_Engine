// Empty: what a list shows when there is nothing in it (no lectures yet, no requests waiting, no
// search results), centred: an optional icon in a soft circle, a short title, a line saying why or
// what to do, and an optional action (a Button) under it.
//
//   <Empty icon={<BookOpen />} title="No lectures yet" action={<Button size="sm">Add a lecture</Button>}>
//     Lectures you add appear here, in the order students read them.
//   </Empty>
import * as React from 'react';
import { cn } from '../lib/utils';

export interface EmptyProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
}

function Empty({ icon, title, action, className, children, ...props }: EmptyProps) {
  return (
    <div data-slot="empty" className={cn('flex flex-col items-center gap-1.5 px-6 py-10 text-center', className)} {...props}>
      {icon && (
        <span data-slot="empty-icon" aria-hidden className="mb-1.5 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5">
          {icon}
        </span>
      )}
      <p data-slot="empty-title" className="text-sm font-medium text-foreground">{title}</p>
      {children !== undefined && children !== null && children !== false && (
        <div data-slot="empty-description" className="max-w-sm text-[13px] leading-relaxed text-pretty text-muted-foreground">{children}</div>
      )}
      {action && <div data-slot="empty-action" className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export { Empty };
