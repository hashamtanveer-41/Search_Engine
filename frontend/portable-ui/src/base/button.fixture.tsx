import { ArrowRight, Check, Search, Trash2 } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Button } from './button';

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

export default defineFixtures({
  component: 'base/button',
  frame: { width: 640, padding: 12 },
  cases: {
    variants: () => <Row><Button>Start reading</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="link">Link</Button><Button variant="success"><Check />Approve</Button><Button variant="destructive"><Trash2 />Delete</Button></Row>,
    sizes: () => <Row><Button size="xs">Extra small</Button><Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button><Button size="icon" variant="outline" aria-label="Search"><Search /></Button></Row>,
    states: () => <Row><Button disabled>Disabled</Button><Button variant="outline">Next <ArrowRight /></Button><Button data-pressed="" variant="outline">Pressed</Button><Button data-pressed="">Pressed</Button></Row>,
  },
});
