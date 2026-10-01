import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { Link } from 'react-router';
import { color, font, motion, radius, space, text } from '../design/tokens.stylex';
import { slugSuffix, useProjects } from '../lib/projects';
import { Button } from '../ui/button';
import { Label, Text } from '../ui/typography';
import { NewProjectForm } from './new-project-form';

/** Left pane of the workspace: the User's Projects, a way to add one, and a collapse toggle. */
export function ProjectSidebar({
  currentSlug,
  username,
  open,
  onToggle,
}: {
  currentSlug: string;
  username: string;
  open: boolean;
  onToggle: () => void;
}) {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);

  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      title={open ? 'Hide projects' : 'Show projects'}
      {...stylex.props(styles.toggle)}
    >
      <span aria-hidden="true">{open ? '«' : '»'}</span>
      <span {...stylex.props(styles.srOnly)}>{open ? 'Hide projects' : 'Show projects'}</span>
    </button>
  );

  if (!open) return <div {...stylex.props(styles.rail)}>{toggle}</div>;

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
            aria-current={slugSuffix(p.slug) === slugSuffix(currentSlug) ? 'page' : undefined}
            {...stylex.props(styles.item)}
          >
            {p.name}
          </Link>
        ))}
      </nav>
      <div {...stylex.props(styles.create)}>
        {creating ? (
          <NewProjectForm onCancel={() => setCreating(false)} />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            New project
          </Button>
        )}
      </div>
      <Text size="sm" tone="faint" xstyle={styles.footer}>
        {username}
      </Text>
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
  rail: { display: 'flex', justifyContent: 'center', paddingBlock: space['--space-4'] },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toggle: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-sm'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    fontFamily: font['--font-mono'],
    cursor: 'pointer',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
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
  footer: {
    paddingTop: space['--space-3'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
    fontFamily: font['--font-mono'],
  },
});
