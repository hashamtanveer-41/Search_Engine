// A made-up course (the DEMO course): data the sidebar's and the panes' fixtures borrow.
import { ClipboardList, Copy, Home, Layers, NotebookPen } from 'lucide-react';
import { defineFixtures } from '../fixture';
import type { SidebarChapter, SidebarLink } from './sidebar';

const course = { code: 'DEMO 100', term: 'Fall 26', title: 'Calculus, illustrated' };
const courses = [course, { code: 'DEMO 210', term: 'Fall 26', title: 'Linear algebra, step by step' }, { code: 'DEMO 150', term: 'Spring 26', title: 'Probability' }];
const links: SidebarLink[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'workbook', label: 'Workbook', icon: NotebookPen, mark: { tone: 'info', icon: NotebookPen, label: 'Questions left', count: 12 } },
  { id: 'cards', label: 'Review cards', icon: Copy, mark: { tone: 'warn', icon: Layers, label: 'Review cards due', count: 8 } },
  { id: 'sheet', label: 'Formula sheet', icon: ClipboardList },
];
const chapters: SidebarChapter[] = [
  { id: 'c1', number: '01', title: 'Foundations', topics: [{ id: 'numbers', title: 'Numbers and sets', status: 'read' }, { id: 'functions', title: 'Functions', status: 'read' }] },
  { id: 'c2', number: '02', title: 'Limits', topics: [{ id: 'limit', title: 'What a limit is', status: 'read' }, { id: 'eps', title: 'Epsilon–delta', status: 'read' }, { id: 'continuity', title: 'Continuity', status: 'reading' }, { id: 'one-sided', title: 'One-sided limits', status: 'todo' }, { id: 'practice', title: 'Chapter practice', status: 'todo' }] },
  { id: 'c3', number: '03', title: 'Derivatives', topics: [{ id: 'rate', title: 'Rate of change', status: 'todo' }] },
];

export default defineFixtures({
  component: 'data/course',
  title: 'Demo course (data only)',
  data: { course, courses, links, chapters },
  cases: { data: () => <pre className="text-xs">{JSON.stringify({ course, chapters: chapters.map((c) => c.title) }, null, 2)}</pre> },
});
