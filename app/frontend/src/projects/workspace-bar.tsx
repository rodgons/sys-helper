import * as stylex from '@stylexjs/stylex';
import { Ellipsis, Menu as MenuIcon, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AccountMenu } from '../account/account-menu';
import { color, radius, space } from '../design/tokens.stylex';
import type { Project } from '../lib/projects';
import { Dialog } from '../ui/dialog';
import { Menu, MenuItem } from '../ui/menu';
import { Heading } from '../ui/typography';
import { NewProjectForm } from './new-project-form';
import { ProjectDrawer } from './project-drawer';
import { DeleteProjectDialog, RenameProjectDialog } from './project-title';

/**
 * The compact workspace's only header, in place of the site header: ☰ opens the Project drawer,
 * then the Project's name (the page's heading, on one line), a ⋯ menu to rename or delete the
 * Project in dialogs, and the account menu.
 */
export function WorkspaceBar({ project }: { project: Project }) {
  const [open, setOpen] = useState<'drawer' | 'new' | 'rename' | 'delete' | null>(null);
  const close = () => setOpen(null);

  return (
    <header {...stylex.props(styles.bar)}>
      <button
        type="button"
        aria-label="Projects"
        aria-haspopup="dialog"
        onClick={() => setOpen('drawer')}
        {...stylex.props(styles.iconButton)}
      >
        <MenuIcon size={20} aria-hidden="true" />
      </button>
      <Heading as="h1" size="sm" xstyle={styles.name}>
        {project.name}
      </Heading>
      <Menu
        label="Project actions"
        trigger={<Ellipsis size={20} aria-hidden="true" />}
        xstyle={styles.iconButton}
      >
        <MenuItem icon={Pencil} onSelect={() => setOpen('rename')}>
          Rename
        </MenuItem>
        <MenuItem icon={Trash2} onSelect={() => setOpen('delete')}>
          Delete
        </MenuItem>
      </Menu>
      <AccountMenu />
      {open === 'drawer' && (
        <ProjectDrawer
          currentSlug={project.slug}
          onClose={close}
          onNewProject={() => setOpen('new')}
        />
      )}
      {open === 'new' && (
        <Dialog open onClose={close} title="New project">
          <NewProjectForm onCancel={close} />
        </Dialog>
      )}
      {open === 'rename' && <RenameProjectDialog project={project} open onClose={close} />}
      <DeleteProjectDialog project={project} open={open === 'delete'} onClose={close} />
    </header>
  );
}

const styles = stylex.create({
  bar: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-1'],
    flexShrink: 0,
    height: 56,
    paddingInline: space['--space-2'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
    backgroundColor: color['--color-canvas'],
  },
  iconButton: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 44,
    height: 44,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius['--radius-full'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    color: color['--color-fg'],
    cursor: 'pointer',
  },
  name: {
    flexGrow: 1,
    minWidth: 0,
    paddingInline: space['--space-1'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});
