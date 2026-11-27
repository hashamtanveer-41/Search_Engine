import { defineFixtures } from '../fixture';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

const COURSES = ['MATH 232 · Complex analysis', 'CS 220 · Databases', 'PHYS 101 · Mechanics', 'CHEM 110 · General chemistry', 'BIO 150 · Cells', 'ECON 101 · Micro', 'HIST 210 · Modern Europe', 'PSY 100 · Intro psychology', 'STAT 200 · Inference', 'ENG 120 · Writing', 'ART 105 · Drawing', 'MUS 140 · Harmony'];

export default defineFixtures({
  component: 'base/dropdown-menu',
  title: 'Dropdown menu',
  frame: { width: 420, padding: 16 },
  cases: {
    'long list (scrolls, fades)': () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline">Switch course</Button></DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-56 w-64">
          {COURSES.map((c) => <DropdownMenuItem key={c}>{c}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  play: { 'long list (scrolls, fades)': [{ wait: 300 }, { click: 'button:has-text("Switch course")' }, { wait: 700 }, { scroll: ['[data-slot=dropdown-menu-scroll]', 90] }, { wait: 700 }] },
});
