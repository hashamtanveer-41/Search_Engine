import { useState } from 'react';
import { CalendarRange, Files, Flag, FolderKanban, ListChecks, NotebookText } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Sidebar, SidebarInside, SidebarInsideGroup, SidebarInsideRow, type SidebarChapter, type SidebarCourse, type SidebarLink, type SidebarProps } from './sidebar';

const props = (use: <T>(c: string, k: string) => T, collapsed: boolean, course?: SidebarCourse): SidebarProps => ({
  course: course ?? use<SidebarCourse>('data/course', 'course'), courses: use<SidebarCourse[]>('data/course', 'courses'),
  links: use<SidebarLink[]>('data/course', 'links'), chapters: use<SidebarChapter[]>('data/course', 'chapters'),
  current: 'continuity', collapsed, onCollapsedChange: () => undefined, onOpen: () => undefined, user: { name: 'Sam', role: 'Admin · 3 classes' },
});

/** Collapses and expands for real: the icons go from their places to their new ones. */
function Toggling({ base }: { base: SidebarProps }) {
  const [collapsed, setCollapsed] = useState(false);
  return <div className="h-[640px]"><Sidebar {...base} collapsed={collapsed} onCollapsedChange={setCollapsed} /></div>;
}

/** The class's Projects link, which can be gone inside, and the projects view it opens:
 *  my projects in the class, each opening to its pages that make panes and its milestones. */
const PROJECTS: SidebarLink = { id: 'projects', label: 'Projects', icon: FolderKanban, inside: 'Show this class’s projects in the sidebar' };
const MINE = [
  { id: 'p1', title: 'Library management system', detail: 'BSSE-5A · 2 of 4 members', milestones: ['Requirements', 'Design', 'Build'] },
  { id: 'p2', title: 'Campus map app', detail: 'BSSE-5A · 3 members', milestones: [] },
];
function ProjectsView({ course, onBack }: { course: string; onBack(): void }) {
  return (
    <SidebarInside back={{ label: course, onBack }} title="Your projects">
      {MINE.map((p, i) => (
        <SidebarInsideGroup key={p.id} title={p.title} detail={p.detail} defaultOpen={i === 0}
          icon={<span className="grid size-6 place-items-center rounded-md bg-info-soft text-[11px] font-semibold text-info">{p.title.charAt(0)}</span>}>
          {[['Tasks', ListChecks], ['Timeline', CalendarRange], ['Journal', NotebookText], ['Files', Files]].map(([label, icon]) => (
            <SidebarInsideRow key={label as string} label={label as string} icon={icon as typeof ListChecks} onOpen={() => undefined} />
          ))}
          {p.milestones.map((m) => <SidebarInsideRow key={m} label={m} icon={Flag} onOpen={() => undefined} />)}
        </SidebarInsideGroup>
      ))}
    </SidebarInside>
  );
}
/** The course's sidebar, with the projects view a press of the Projects link's way inside away. */
function GoingInside({ base, inside: start = false }: { base: SidebarProps; inside?: boolean }) {
  const [inside, setInside] = useState(start);
  return (
    <div className="h-[640px]">
      <Sidebar {...base} links={[...base.links, PROJECTS]} onInside={() => setInside(true)}
        view={inside ? <ProjectsView course={base.course.title} onBack={() => setInside(false)} /> : undefined} />
    </div>
  );
}

const LONG: SidebarCourse = { code: 'DEMO 340', term: 'Fall 26', title: 'Discrete structures for computing, with proofs and puzzles' };

export default defineFixtures({
  component: 'derived/sidebar',
  deps: ['data/course'],
  cases: {
    full: ({ use }) => <div className="h-[640px]"><Sidebar {...props(use, false)} /></div>,
    'class menu': ({ use }) => <div className="h-[640px]"><Sidebar {...props(use, false)} /></div>,
    'long title': ({ use }) => <div className="h-[640px]"><Sidebar {...props(use, false, LONG)} /></div>,
    'one class': ({ use }) => <div className="h-[640px]"><Sidebar {...props(use, false)} courses={undefined} /></div>,
    compact: ({ use }) => <div className="h-[640px]"><Sidebar {...props(use, true)} /></div>,
    'collapse and expand': ({ use }) => <Toggling base={props(use, false)} />,
    // The Projects link pointed at: its icon is the way inside (the case hovers it).
    'projects, going inside': ({ use }) => <GoingInside base={props(use, false)} />,
    'projects view': ({ use }) => <GoingInside base={props(use, false)} inside />,
  },
  play: {
    'projects, going inside': [{ wait: 300 }, { hover: '[data-inside=projects]' }, { wait: 500 }],
    'class menu': [{ wait: 300 }, { click: '[data-slot=sidebar] [aria-haspopup=menu]' }, { wait: 600 }],
  },
});
