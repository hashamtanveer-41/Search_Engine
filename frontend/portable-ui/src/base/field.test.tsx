import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Field, FieldCheck, FieldError, FieldGroup, FieldHint } from './field';
import { Input } from './input';
import { Textarea } from './textarea';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

afterEach(cleanup);

const describedBy = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

describe('Field', () => {
  it('points its label at the ui Input inside it, with no ids written by hand', () => {
    render(<Field label="Lecture title"><Input /></Field>);
    const input = screen.getByRole('textbox', { name: 'Lecture title' });
    expect(input.id).toBeTruthy();
    expect(document.querySelector('label')!.htmlFor).toBe(input.id);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('describes the control by its hint and its error, marks it invalid and reads the error out', () => {
    render(<Field label="Invite code" hint="Your teacher gave you this." error="That code has expired."><Input /></Field>);
    const input = screen.getByRole('textbox', { name: 'Invite code' });
    const hint = screen.getByText('Your teacher gave you this.');
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('That code has expired.');
    expect(describedBy(input)).toEqual([hint.id, error.id]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox', { description: 'Your teacher gave you this. That code has expired.' })).toBe(input);
  });

  it('drops the error when it clears', () => {
    const { rerender } = render(<Field label="Email" error="Enter an email address."><Input /></Field>);
    rerender(<Field label="Email" error={null}><Input /></Field>);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('uses the child’s own id, and joins the child’s own aria-describedby with its hint', () => {
    render(<><p id="limit">Up to 80 characters.</p><Field label="Title" hint="Shown in the sidebar."><Input id="title" aria-describedby="limit" /></Field></>);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input.id).toBe('title');
    expect(describedBy(input)).toEqual(['limit', 'title-hint']);
  });

  it('wires a native control (a <select>) and a ui Textarea the same way', () => {
    render(<>
      <Field label="Term" hint="Pick the current term."><select><option>Fall 2026</option></select></Field>
      <Field label="Note to the reviewer"><Textarea /></Field>
    </>);
    const select = screen.getByRole('combobox', { name: 'Term' });
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByText('Pick the current term.').id).toBe(describedBy(select)[0]);
    expect(screen.getByRole('textbox', { name: 'Note to the reviewer' }).tagName).toBe('TEXTAREA');
  });

  it('labels a ui Select’s trigger even though the Select itself is the child', () => {
    render(
      <Field label="Class">
        <Select defaultValue="demo"><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="demo">DEMO 100</SelectItem></SelectContent></Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Class' }).dataset.slot).toBe('select-trigger');
  });

  it('describes the control by a FieldHint and FieldError placed by hand', () => {
    render(<Field label="Slug"><Input /><FieldHint>Lowercase, with dashes.</FieldHint><FieldError>Taken by another lesson.</FieldError></Field>);
    const input = screen.getByRole('textbox', { name: 'Slug' });
    expect(describedBy(input)).toEqual([screen.getByText('Lowercase, with dashes.').id, screen.getByRole('alert').id]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('gives each Field in a FieldGroup its own id', () => {
    render(<FieldGroup><Field label="First name"><Input /></Field><Field label="Last name"><Input /></Field></FieldGroup>);
    expect(screen.getByRole('textbox', { name: 'First name' }).id).not.toBe(screen.getByRole('textbox', { name: 'Last name' }).id);
  });
});

describe('FieldCheck', () => {
  it('labels a switch beside it; pressing the label flips it', () => {
    render(<FieldCheck label="Email me when a lesson is added" hint="At most one email a day."><Switch /></FieldCheck>);
    const sw = screen.getByRole('switch', { name: 'Email me when a lesson is added' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(describedBy(sw)).toEqual([screen.getByText('At most one email a day.').id]);
    fireEvent.click(screen.getByText('Email me when a lesson is added'));
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('labels a checkbox the same way', () => {
    render(<FieldCheck label="Show worked solutions"><Checkbox defaultChecked /></FieldCheck>);
    const box = screen.getByRole('checkbox', { name: 'Show worked solutions' });
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('Show worked solutions'));
    expect(box.getAttribute('aria-checked')).toBe('false');
  });
});
