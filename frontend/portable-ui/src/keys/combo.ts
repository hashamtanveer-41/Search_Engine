// Keyboard shortcuts, written once and drawn and matched per platform (a Mac showed
// "Ctrl" where it means ⌘). A shortcut is a typed string, "Mod+K", "Ctrl+Alt+Left", "Esc": `Mod` is
// ⌘ on a Mac and Ctrl elsewhere, the others are what they say. From it come the key caps to draw
// (⌘ K, or Ctrl K, in the platform's order), the words for a tooltip ("⌘K", "Ctrl+K"), what
// aria-keyshortcuts wants, what a screen reader says, and whether a key press is it, so what a
// shortcut shows and what it does cannot drift apart.

export type Modifier = 'Mod' | 'Ctrl' | 'Alt' | 'Shift' | 'Meta';
type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type FKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12';
type Named = 'Enter' | 'Esc' | 'Tab' | 'Space' | 'Backspace' | 'Delete' | 'Up' | 'Down' | 'Left' | 'Right' | 'Home' | 'End' | 'PageUp' | 'PageDown';
type Sign = '/' | '\\' | '[' | ']' | '-' | '=' | ',' | '.' | ';' | "'" | '`' | '?';
export type Key = Letter | Digit | FKey | Named | Sign;
type Mods = '' | `${Modifier}+` | `${Modifier}+${Modifier}+`;
/** A shortcut: up to two modifiers and a key ("Mod+Shift+Z"). A typo does not compile. */
export type Combo = `${Mods}${Key}`;

/** A Mac (or an iPad or iPhone with a keyboard): ⌘ and the symbols. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /Mac|iPhone|iPad|iPod/i.test(data?.platform || navigator.platform || navigator.userAgent);
}

/** Apple's order of modifiers, and everyone else's. */
const ORDER: Record<'mac' | 'pc', Modifier[]> = { mac: ['Ctrl', 'Alt', 'Shift', 'Mod', 'Meta'], pc: ['Mod', 'Ctrl', 'Alt', 'Shift', 'Meta'] };

/** Each modifier and key as drawn, as spoken, for aria-keyshortcuts, and its KeyboardEvent.code. */
const MOD: Record<Modifier, { mac: string; pc: string; macSaid: string; pcSaid: string; macAria: string; pcAria: string }> = {
  Mod: { mac: '⌘', pc: 'Ctrl', macSaid: 'Command', pcSaid: 'Control', macAria: 'Meta', pcAria: 'Control' },
  Ctrl: { mac: '⌃', pc: 'Ctrl', macSaid: 'Control', pcSaid: 'Control', macAria: 'Control', pcAria: 'Control' },
  Alt: { mac: '⌥', pc: 'Alt', macSaid: 'Option', pcSaid: 'Alt', macAria: 'Alt', pcAria: 'Alt' },
  Shift: { mac: '⇧', pc: 'Shift', macSaid: 'Shift', pcSaid: 'Shift', macAria: 'Shift', pcAria: 'Shift' },
  Meta: { mac: '⌘', pc: 'Win', macSaid: 'Command', pcSaid: 'Windows', macAria: 'Meta', pcAria: 'Meta' },
};
const KEY: Partial<Record<Key, { mac?: string; pc?: string; said?: string; aria: string; code: string }>> = {
  Enter: { mac: '↩', pc: 'Enter', said: 'Enter', aria: 'Enter', code: 'Enter' },
  Esc: { said: 'Escape', aria: 'Escape', code: 'Escape' },
  Tab: { mac: '⇥', said: 'Tab', aria: 'Tab', code: 'Tab' },
  Space: { said: 'Space', aria: 'Space', code: 'Space' },
  Backspace: { mac: '⌫', said: 'Backspace', aria: 'Backspace', code: 'Backspace' },
  Delete: { mac: '⌦', pc: 'Del', said: 'Delete', aria: 'Delete', code: 'Delete' },
  Up: { mac: '↑', pc: '↑', said: 'Up arrow', aria: 'ArrowUp', code: 'ArrowUp' },
  Down: { mac: '↓', pc: '↓', said: 'Down arrow', aria: 'ArrowDown', code: 'ArrowDown' },
  Left: { mac: '←', pc: '←', said: 'Left arrow', aria: 'ArrowLeft', code: 'ArrowLeft' },
  Right: { mac: '→', pc: '→', said: 'Right arrow', aria: 'ArrowRight', code: 'ArrowRight' },
  PageUp: { pc: 'PgUp', said: 'Page up', aria: 'PageUp', code: 'PageUp' },
  PageDown: { pc: 'PgDn', said: 'Page down', aria: 'PageDown', code: 'PageDown' },
  '/': { said: 'Slash', aria: '/', code: 'Slash' },
  '\\': { said: 'Backslash', aria: '\\', code: 'Backslash' },
  '[': { said: 'Left bracket', aria: '[', code: 'BracketLeft' },
  ']': { said: 'Right bracket', aria: ']', code: 'BracketRight' },
  '-': { said: 'Minus', aria: '-', code: 'Minus' },
  '=': { said: 'Equals', aria: '=', code: 'Equal' },
  ',': { said: 'Comma', aria: ',', code: 'Comma' },
  '.': { said: 'Period', aria: '.', code: 'Period' },
  ';': { said: 'Semicolon', aria: ';', code: 'Semicolon' },
  "'": { said: 'Quote', aria: "'", code: 'Quote' },
  '`': { said: 'Backquote', aria: '`', code: 'Backquote' },
  '?': { said: 'Question mark', aria: '?', code: 'Slash' },
};

/** A shortcut's modifiers (in the platform's order) and its key. */
export function parseCombo(combo: Combo, mac = isMac()): { mods: Modifier[]; key: Key } {
  const parts = combo.split('+');
  const key = parts.pop() as Key;
  const given = new Set(parts as Modifier[]);
  return { mods: ORDER[mac ? 'mac' : 'pc'].filter((m) => given.has(m)), key };
}

const capOf = (key: Key, mac: boolean) => (mac ? KEY[key]?.mac : KEY[key]?.pc) ?? key;

/** A modifier alone, as drawn: ⌥ on a Mac, Alt elsewhere (for words like "⌥-drag"). */
export function modifierCap(mod: Modifier, mac = isMac()): string {
  return MOD[mod][mac ? 'mac' : 'pc'];
}

/** The key caps to draw: "Mod+Shift+Z" is ⇧ ⌘ Z on a Mac, Ctrl Shift Z elsewhere. */
export function keyCaps(combo: Combo, mac = isMac()): string[] {
  const { mods, key } = parseCombo(combo, mac);
  return [...mods.map((m) => MOD[m][mac ? 'mac' : 'pc']), capOf(key, mac)];
}

/** The shortcut in words, for a tooltip or a title: "⇧⌘Z" on a Mac, "Ctrl+Shift+Z" elsewhere. */
export function keyName(combo: Combo, mac = isMac()): string {
  return keyCaps(combo, mac).join(mac ? '' : '+');
}

/** What a screen reader says: "Command Shift Z", "Control Shift Z". */
export function keySpoken(combo: Combo, mac = isMac()): string {
  const { mods, key } = parseCombo(combo, mac);
  return [...mods.map((m) => MOD[m][mac ? 'macSaid' : 'pcSaid']), KEY[key]?.said ?? key].join(' ');
}

/** For aria-keyshortcuts: "Meta+Shift+Z" on a Mac, "Control+Shift+Z" elsewhere. */
export function ariaKeys(combo: Combo, mac = isMac()): string {
  const { mods, key } = parseCombo(combo, mac);
  return [...mods.map((m) => MOD[m][mac ? 'macAria' : 'pcAria']), KEY[key]?.aria ?? key].join('+');
}

/** The key press a KeyboardEvent describes (or a test's stand-in for one). */
export interface KeyPress { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }

function codeOf(key: Key): string {
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^F[0-9]{1,2}$/.test(key)) return key;
  return KEY[key]?.code ?? key;
}

/** Whether a key press is this shortcut: its modifiers exactly (Mod is ⌘ on a Mac, Ctrl elsewhere),
 *  and its key by where it is on the keyboard (so Option and a letter, which types another letter on
 *  a Mac, still matches). "?" is the character, whatever brings it. */
export function matches(combo: Combo, e: KeyPress, mac = isMac()): boolean {
  const { mods, key } = parseCombo(combo, mac);
  const want = new Set(mods.flatMap((m) => (m === 'Mod' ? [mac ? 'Meta' : 'Ctrl'] : [m])));
  if (key === '?') return e.key === '?' && e.ctrlKey === want.has('Ctrl') && e.metaKey === want.has('Meta') && e.altKey === want.has('Alt');
  if (e.ctrlKey !== want.has('Ctrl') || e.metaKey !== want.has('Meta') || e.altKey !== want.has('Alt') || e.shiftKey !== want.has('Shift')) return false;
  return e.code ? e.code === codeOf(key) : e.key.toLowerCase() === (KEY[key]?.aria ?? key).toLowerCase();
}
