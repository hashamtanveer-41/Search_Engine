// The workspace's keyboard commands, after the tabbed layout reference (§5).
//
// In a browser, Ctrl/⌘ + W, T and N belong to the browser, so every workspace command is on Alt
// (Option on a Mac). Bindings match the physical key (`code`), because Option+key types a
// different character on a Mac ("Option+W" is "∑").
import type { Direction, Side } from './model';

import { isMac, type Combo } from '../../keys/combo';

export interface PaneKeyCommands {
  splitActive(side: Side): void;
  closeActive(): void;
  reopen(): void;
  focusCycle(step: 1 | -1): void;
  focusDirection(dir: Direction): void;
  zoomActive(): void;
  collapseActive(): void;
  expandAll(): void;
  undo(): void;
  redo(): void;
}

export interface KeyPress {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  code: string;
}

export interface Binding {
  /** Names it for a shortcuts dialog's preview (shortcuts/: each is acted out). */
  id: string;
  /** For display (keys/: drawn per platform); several entries are alternatives. */
  combo: Combo | Combo[];
  what: string;
  /** A few words, for a list that fits without scrolling; `what` says it in full. */
  short: string;
  group: 'Panes' | 'Focus' | 'History';
  run(c: PaneKeyCommands): void;
  match(e: KeyPress): boolean;
  /** Held down, it repeats (moving focus); a command that changes the layout acts once per press. */
  repeats?: boolean;
}

const alt = (code: string, shift = false) => (e: KeyPress) => e.altKey && !e.ctrlKey && !e.metaKey && e.shiftKey === shift && e.code === code;
const mod = (code: string, shift = false) => (e: KeyPress) => (e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey === shift && e.code === code;


export const BINDINGS: Binding[] = [
  // Split: "\" leans right and "/" left; with Shift, "\" goes down and "/" up.
  { id: 'split-right', group: 'Panes', combo: 'Alt+\\', what: 'Split right (the same page again, beside it)', short: 'Split right', match: alt('Backslash'), run: (c) => c.splitActive('right') },
  { id: 'split-down', group: 'Panes', combo: 'Alt+Shift+\\', what: 'Split down', short: 'Split down', match: alt('Backslash', true), run: (c) => c.splitActive('bottom') },
  { id: 'split-left', group: 'Panes', combo: 'Alt+/', what: 'Split left', short: 'Split left', match: alt('Slash'), run: (c) => c.splitActive('left') },
  { id: 'split-up', group: 'Panes', combo: 'Alt+Shift+/', what: 'Split up', short: 'Split up', match: alt('Slash', true), run: (c) => c.splitActive('top') },
  { id: 'close', group: 'Panes', combo: 'Alt+W', what: 'Close the active pane', short: 'Close the pane', match: alt('KeyW'), run: (c) => c.closeActive() },
  { id: 'reopen', group: 'Panes', combo: 'Alt+Shift+T', what: 'Reopen the last closed pane where it was', short: 'Reopen a closed pane', match: alt('KeyT', true), run: (c) => c.reopen() },
  { id: 'zoom', group: 'Panes', combo: 'Alt+Enter', what: 'Zoom the active pane / restore', short: 'Zoom / restore', match: alt('Enter'), run: (c) => c.zoomActive() },
  { id: 'collapse', group: 'Panes', combo: 'Alt+-', what: 'Collapse the active group into a strip', short: 'Collapse to a strip', match: alt('Minus'), run: (c) => c.collapseActive() },
  { id: 'expand', group: 'Panes', combo: 'Alt+=', what: 'Expand every strip', short: 'Expand every strip', match: alt('Equal'), run: (c) => c.expandAll() },
  // The arrows go where they point (← went to the pane before in reading order,
  // which can be below and to the left); [ and ] step through the panes in reading order.
  { id: 'focus-left', group: 'Focus', combo: 'Alt+Left', what: 'Focus the pane to the left', short: 'Pane to the left', match: alt('ArrowLeft'), run: (c) => c.focusDirection('left'), repeats: true },
  { id: 'focus-right', group: 'Focus', combo: 'Alt+Right', what: 'Focus the pane to the right', short: 'Pane to the right', match: alt('ArrowRight'), run: (c) => c.focusDirection('right'), repeats: true },
  { id: 'focus-up', group: 'Focus', combo: 'Alt+Up', what: 'Focus the pane above', short: 'Pane above', match: alt('ArrowUp'), run: (c) => c.focusDirection('up'), repeats: true },
  { id: 'focus-down', group: 'Focus', combo: 'Alt+Down', what: 'Focus the pane below', short: 'Pane below', match: alt('ArrowDown'), run: (c) => c.focusDirection('down'), repeats: true },
  { id: 'next', group: 'Focus', combo: 'Alt+]', what: 'Next pane (reading order; stops at the last)', short: 'Next pane', match: alt('BracketRight'), run: (c) => c.focusCycle(1), repeats: true },
  { id: 'previous', group: 'Focus', combo: 'Alt+[', what: 'Previous pane (stops at the first)', short: 'Previous pane', match: alt('BracketLeft'), run: (c) => c.focusCycle(-1), repeats: true },
  { id: 'undo', group: 'History', combo: 'Mod+Z', what: 'Undo a layout change', short: 'Undo a layout change', match: mod('KeyZ'), run: (c) => c.undo() },
  { id: 'redo', group: 'History', combo: ['Mod+Shift+Z', 'Mod+Y'], what: 'Redo', short: 'Redo', match: (e) => mod('KeyZ', true)(e) || mod('KeyY')(e), run: (c) => c.redo() },
];

/** Keys an app's shortcuts dialog lists beside the workspace commands (keys on a focused tab or
 *  divider). */
export const OTHER_KEYS: { id: string; combo: Combo | Combo[]; what: string; short: string }[] = [
  { id: 'unzoom', combo: 'Esc', what: 'Leave a text field, then restore a zoomed pane', short: 'Restore a zoomed pane' },
  { id: 'tab-move', combo: ['Left', 'Right', 'Home', 'End'], what: 'On a tab: move along its group', short: 'Tab: move along' },
  { id: 'tab-close', combo: 'Delete', what: 'On a tab: close it', short: 'Tab: close it' },
  { id: 'tab-menu', combo: 'Shift+F10', what: 'On a tab: its menu', short: 'Tab: its menu' },
  { id: 'divider-move', combo: ['Left', 'Right', 'Shift+Left', 'Shift+Right'], what: 'On a divider: move it 16px, or 80px with Shift', short: 'Divider: move it' },
  { id: 'divider-even', combo: 'Enter', what: 'On a divider: share the space evenly', short: 'Divider: even shares' },
];

// ------------------------------------------------------------- standing aside

export interface KeyContext {
  /** The keyboard is somewhere it types (input, textarea, select, contenteditable, role=textbox). */
  typing: boolean;
  /** An input method is composing (Japanese, Chinese, Korean…). Every key belongs to it. */
  composing: boolean;
  /** The page already handled this key (its own Escape, its own undo). */
  handled: boolean;
  /** A modal dialog is open: its keys are its own. */
  underDialog: boolean;
  /** The key is held down and repeating. */
  repeat: boolean;
}

/**
 * Whether the workspace leaves this key alone: where the keyboard types (Option+arrows move by
 * word there, Option+a letter types a character on a Mac, Ctrl/⌘+Z is the field's own undo), while
 * an input method composes, for a key the page handled, under a dialog; and a command that changes
 * the layout does not repeat while its key is held (one Alt+W closes one pane), while moving
 * between panes does.
 */
export function standsAside(ctx: KeyContext, binding: Binding): boolean {
  if (ctx.composing || ctx.handled || ctx.underDialog || ctx.typing) return true;
  return ctx.repeat && !binding.repeats;
}

export function bindingFor(e: KeyPress, ctx: KeyContext): Binding | null {
  const b = BINDINGS.find((x) => x.match(e)) ?? null;
  return b && !standsAside(ctx, b) ? b : null;
}

const NOT_TYPED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);

/** Where the keyboard types: a text field, editable text, or a role=textbox. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT') return !NOT_TYPED.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.getAttribute('role') === 'textbox';
}

/** Every pane key, for an app's shortcuts dialog (drawn with keys/ Keys, per platform). Search and the
 *  dialog itself are the app's (Mod+K, Mod+/), not the workspace's. */
export function paneShortcuts(): { id: string; group: string; combo: Combo[]; what: string; short: string }[] {
  return [...BINDINGS, ...OTHER_KEYS.map((k) => ({ ...k, group: 'On a tab or a divider' }))]
    .map((r) => ({ id: r.id, group: r.group, combo: Array.isArray(r.combo) ? r.combo : [r.combo], what: r.what, short: r.short }));
}

export { isMac };
