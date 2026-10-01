import * as stylex from '@stylexjs/stylex';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { color, motion, radius, space, text } from '../design/tokens.stylex';
import { slugSuffix, useProjects } from '../lib/projects';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { PaneToggle } from '../ui/pane-toggle';
import { Label } from '../ui/typography';
import { NewProjectForm } from './new-project-form';

/**
 * Left pane of the workspace: the User's Projects, a button that adds one in a dialog, and a
 * collapse toggle. Collapsed, it is a rail of the Projects' initials.
 */
export function ProjectSidebar({
  currentSlug,
  open,
  onToggle,
}: {
  currentSlug: string;
  open: boolean;
  onToggle: () => void;
}) {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);

  const toggle = <PaneToggle side="left" name="projects" open={open} onToggle={onToggle} />;

  const dialog = creating && (
    <Dialog open onClose={() => setCreating(false)} title="New project">
      <NewProjectForm onCancel={() => setCreating(false)} />
    </Dialog>
  );

  const isCurrent = (slug: string) =>
    slugSuffix(slug) === slugSuffix(currentSlug) ? 'page' : undefined;

  if (!open) {
    return (
      <div {...stylex.props(styles.rail)}>
        {toggle}
        <nav aria-label="Projects" {...stylex.props(styles.railList)}>
          {projects.data?.map((p) => (
            <Link
              key={p.slug}
              to={`/p/${p.slug}`}
              title={p.name}
              aria-current={isCurrent(p.slug)}
              {...stylex.props(styles.railItem)}
            >
              <Avatar name={p.name} size={28} />
            </Link>
          ))}
        </nav>
        <button
          type="button"
          aria-label="New project"
          title="New project"
          onClick={() => setCreating(true)}
          {...stylex.props(styles.railAdd)}
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        {dialog}
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.head)}>
        <Label>Projects</Label>
        {toggle}
      </div>
      <nav aria-label="Projects" {...stylex.props(styles.list)}>
        {projects.data?.map((p) => (
          <Link
            key={p.slug}
            to={`/p/${p.slug}`}
            aria-current={isCurrent(p.slug)}
            {...stylex.props(styles.item)}
          >
            {p.name}
          </Link>
        ))}
      </nav>
      <div {...stylex.props(styles.create)}>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          New project
        </Button>
      </div>
      {dialog}
    </div>
  );
}

const styles = stylex.create({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-4'],
    minHeight: 0,
    padding: space['--space-4'],
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space['--space-3'],
    minHeight: 0,
    paddingBlock: space['--space-4'],
  },
  railList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space['--space-2'],
    minHeight: 0,
    overflowY: 'auto',
    // Room for the current Project's ring, which the scroll box would otherwise clip.
    padding: 3,
  },
  railItem: {
    display: 'inline-flex',
    borderRadius: radius['--radius-full'],
    outlineWidth: 2,
    outlineOffset: 1,
    outlineStyle: {
      default: 'none',
      ':hover': 'solid',
      ':focus-visible': 'solid',
      '[aria-current="page"]': 'solid',
    },
    outlineColor: {
      default: color['--color-line-strong'],
      ':focus-visible': color['--color-accent'],
      '[aria-current="page"]': color['--color-accent'],
    },
  },
  railAdd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 28,
    height: 28,
    padding: 0,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color['--color-line-strong'],
    borderRadius: radius['--radius-full'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    color: color['--color-fg-muted'],
    cursor: 'pointer',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    overflowY: 'auto',
    flexGrow: 1,
    minHeight: 0,
  },
  item: {
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    borderRadius: radius['--radius-sm'],
    fontSize: text['--text-sm'],
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: {
      default: color['--color-fg-muted'],
      ':hover': color['--color-fg'],
      '[aria-current="page"]': color['--color-fg'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': color['--color-subtle'],
      '[aria-current="page"]': color['--color-accent-soft'],
    },
    fontWeight: { default: 400, '[aria-current="page"]': 600 },
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
  },
  create: { paddingTop: space['--space-2'] },
});
