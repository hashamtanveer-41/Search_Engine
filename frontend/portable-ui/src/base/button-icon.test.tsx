// Anything in a button's icon place ("extend the button ui component and allow any jsx
// in the place of icon and that jsx is enlarged when clicked"): it sits in the button's content, the
// box pressing grows, and a click on it can do something of its own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './button';
import { installPressFeedback } from './press';

afterEach(cleanup);

describe('a button’s icon place', () => {
  it('holds any JSX first in its content, which grows with the press', () => {
    installPressFeedback();
    render(<Button icon={<span data-testid="arrow">→</span>}>Projects</Button>);
    const button = screen.getByRole('button', { name: /Projects/ });
    const content = button.querySelector('[data-slot=button-content]')!;
    expect(content.firstElementChild!.getAttribute('data-slot')).toBe('button-icon');
    expect(content.contains(screen.getByTestId('arrow'))).toBe(true);
    // Pressed on the icon, the button is held (and its content, the icon in it, grows).
    screen.getByTestId('arrow').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(button.dataset.pressed).toBe('');
    screen.getByTestId('arrow').dispatchEvent(new MouseEvent('pointerup', { button: 0, bubbles: true }));
    expect(button.dataset.pressed).toBeUndefined();
  });

  it('a click on the icon does its own thing; anywhere else, the button’s', () => {
    const onClick = vi.fn();
    const onIconClick = vi.fn();
    render(<Button icon={<span data-testid="arrow">→</span>} iconLabel="Go inside" onIconClick={onIconClick} onClick={onClick}>Projects</Button>);
    fireEvent.click(screen.getByTestId('arrow'));
    expect([onIconClick.mock.calls.length, onClick.mock.calls.length]).toEqual([1, 0]);
    fireEvent.click(screen.getByText('Projects'));
    expect([onIconClick.mock.calls.length, onClick.mock.calls.length]).toEqual([1, 1]);
    expect(screen.getByTitle('Go inside').dataset.slot).toBe('button-icon');
  });

  it('works on a link drawn as a button, and without an icon nothing is added', () => {
    render(<><Button asChild icon={<span data-testid="chev">‹</span>}><a href="/back">Back</a></Button><Button>Plain</Button></>);
    const link = screen.getByRole('link', { name: /Back/ });
    expect(link.querySelector('[data-slot=button-content] [data-testid=chev]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Plain' }).querySelector('[data-slot=button-icon]')).toBeNull();
  });
});

describe('a badge inside a button (a project’s count jumped onto its icon when pressed)', () => {
  it('the content box fills the button’s height, so pressed (scaled, and so what the badge is placed against) the badge keeps its corner', () => {
    render(<Button variant="ghost" className="p-0" aria-label="Projects"><svg /><span className="absolute top-0.5 right-0.5">1</span></Button>);
    const content = screen.getByRole('button', { name: 'Projects' }).querySelector('[data-slot=button-content]')!;
    expect(content.className).toContain('self-stretch');
    expect(content.className).toContain('flex-auto');
  });
});
