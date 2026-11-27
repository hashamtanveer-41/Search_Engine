import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Callout } from './callout';

afterEach(cleanup);

describe('Callout', () => {
  it('is labelled by its purpose', () => {
    render(<Callout purpose="warning">Not the same thing.</Callout>);
    expect(screen.getByRole('complementary', { name: 'Watch out' })).toBeTruthy();
    expect(screen.getByText('Not the same thing.')).toBeTruthy();
  });

  it('a takeaway asks first, then reveals', () => {
    render(<Callout purpose="takeaway">The limit equals the value.</Callout>);
    expect(screen.queryByText('The limit equals the value.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the takeaway' }));
    expect(screen.getByText('The limit equals the value.')).toBeTruthy();
  });
});
