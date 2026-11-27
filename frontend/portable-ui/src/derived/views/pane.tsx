// Pane: a titled column of a widget's stage. Its title strip (and footer) stay put while its body
// scrolls on its own, so a table's header row can stick to the top of it. Panes side by side are
// divided by a rule.
import * as React from 'react';
import { cn } from '../../lib/utils';
import './pane.css';

export function Pane({ title, aside, footer, className, bodyClassName, children, ...rest }: {
  title?: React.ReactNode; aside?: React.ReactNode; footer?: React.ReactNode; className?: string; bodyClassName?: string; children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section data-slot="ui-pane" className={cn('ui-pane', className)} {...rest}>
      {title !== undefined && (
        <header className="ui-pane-head">
          <span className="ui-pane-title ui-caption">{title}</span>
          {aside && <span className="ui-pane-aside">{aside}</span>}
        </header>
      )}
      <div data-slot="ui-pane-body" className={cn('ui-pane-body', bodyClassName)}>{children}</div>
      {footer && <footer className="ui-pane-foot">{footer}</footer>}
    </section>
  );
}
