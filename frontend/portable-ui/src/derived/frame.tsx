// The app's frame, from the playground's screen: the sidebar on the left, a thin top bar (where you
// are, and the page's own controls on the right), and the page under it. On a phone the sidebar is a
// sheet the top bar's menu button opens; it closes again when `place` changes (a page was opened).
import * as React from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { Button } from '../base/button';
import { Sheet, SheetContent, SheetTitle } from '../base/sheet';
import { cn } from '../lib/utils';

/** `node` is drawn in place of the label: a field, say (the space's name, renamed where it shows,
 *  ). */
export interface Crumb { label: string; href?: string; node?: React.ReactNode }

export interface AppFrameProps {
  /** The sidebar, as it shows on a desktop. */
  sidebar: React.ReactNode;
  /** The sidebar in the phone's sheet (full, never the rail); the desktop one when not given. */
  phoneSidebar?: React.ReactNode;
  /** Where the page is: the last crumb is the page itself. */
  crumbs: Crumb[];
  /** What the phone's top bar shows in place of the page's name (the space's name, opening the
   *  spaces: ). */
  phoneTitle?: React.ReactNode;
  /** The phone's navigation sheet, held by the app (closed when a page is dragged out of it). */
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  /** The top bar's controls, on its right. */
  actions?: React.ReactNode;
  /** The controls on a phone, where the top bar has room for two or three icons (a menu with the
   *  rest, say); `actions` when not given. */
  phoneActions?: React.ReactNode;
  /** Something that changes when a page opens: the phone's sheet closes. */
  place?: string;
  /** The page scrolls itself (panes); otherwise the page area scrolls. */
  fixed?: boolean;
  children: React.ReactNode;
}

export function AppFrame({ sidebar, phoneSidebar, crumbs, phoneTitle, menuOpen, onMenuOpenChange, actions, phoneActions, place, fixed, children }: AppFrameProps) {
  const [ownMenu, setOwnMenu] = React.useState(false);
  const menu = menuOpen ?? ownMenu;
  const setMenu = React.useCallback((open: boolean) => { if (menuOpen === undefined) setOwnMenu(open); onMenuOpenChange?.(open); }, [menuOpen, onMenuOpenChange]);
  React.useEffect(() => setMenu(false), [place]);
  return (
    // Positioned, as its scroller is: a hidden (sr-only, absolute) element anywhere in a page is held
    // inside them, never placed against the document, where it made the window scroll on past the app
    // ("can scroll down outside").
    <div data-slot="app-frame" className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* What follows the sidebar's slot rides with its edge while it collapses or expands (spring-width.tsx). */}
      <div data-sidebar-slot className="hidden h-full roomy:block">{sidebar}</div>
      <Sheet open={menu} onOpenChange={setMenu} edgeSwipe="left">
        <SheetContent side="left" showCloseButton={false} className="w-[272px] max-w-[85vw] gap-0 p-0 sm:max-w-[272px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {phoneSidebar ?? sidebar}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-slot="app-top" className="flex h-11 shrink-0 items-center gap-2 border-b px-2 text-[13px] text-muted-foreground roomy:gap-3 roomy:px-3">
          <Button variant="ghost" size="icon-sm" className="roomy:hidden" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></Button>
          {phoneTitle && <div className="flex min-w-0 flex-1 items-center roomy:hidden">{phoneTitle}</div>}
          <nav aria-label="Where you are" className={cn('min-w-0 flex-1 items-center gap-1.5', phoneTitle ? 'hidden roomy:flex' : 'flex')}>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const label = c.node ? c.node : last ? <b className="truncate font-medium text-foreground" aria-current="page">{c.label}</b>
                : c.href ? <a className="truncate rounded-sm hover:text-foreground ui-focus" href={c.href}>{c.label}</a> : <span className="truncate">{c.label}</span>;
              // On a phone only the page itself shows: no trail, no chevrons before it.
              return (
                <span key={`${i}:${c.label}`} className={cn('min-w-0 items-center gap-1.5', last ? 'flex' : 'hidden shrink-[2] roomy:flex')}>
                  {i > 0 && <ChevronRight aria-hidden className="hidden size-3 shrink-0 opacity-60 roomy:block" />}
                  {label}
                </span>
              );
            })}
          </nav>
          {actions && <div className={cn('shrink-0 items-center gap-1', phoneActions ? 'hidden roomy:flex' : 'flex')}>{actions}</div>}
          {phoneActions && <div className="flex shrink-0 items-center gap-0.5 roomy:hidden">{phoneActions}</div>}
        </header>
        <main id="main-content" tabIndex={-1} className={cn('relative min-h-0 flex-1 outline-none', fixed ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto')}>{children}</main>
      </div>
    </div>
  );
}
