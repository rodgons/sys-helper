import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { space } from '../design/tokens.stylex';
import { type Project, useDeleteProject, useRenameProject } from '../lib/projects';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { TextField } from '../ui/text-field';
import { toast } from '../ui/toaster';
import { Heading, Text } from '../ui/typography';

/** The Project's name with rename and (confirmed) delete actions. */
export function ProjectTitle({ project }: { project: Project }) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(project.name);
  const rename = useRenameProject(project.slug);
  const remove = useDeleteProject(project.slug);
  const navigate = useNavigate();

  if (mode === 'rename') {
    return (
      <form
        {...stylex.props(styles.row)}
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(name, {
            onSuccess: (renamed) => {
              setMode('view');
              navigate(`/p/${renamed.slug}`, { replace: true });
            },
          });
        }}
      >
        <TextField
          label="Project name"
          hideLabel
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          autoFocus
          xstyle={styles.grow}
        />
        <Button type="submit" size="sm" disabled={rename.isPending || name.trim() === ''}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div {...stylex.props(styles.column)}>
      <div {...stylex.props(styles.row)}>
        <Heading as="h1" size="md" xstyle={styles.grow}>
          {project.name}
        </Heading>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setName(project.name);
            setMode('rename');
          }}
        >
          Rename
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode('delete')}>
          Delete
        </Button>
      </div>
      <Dialog
        open={mode === 'delete'}
        onClose={() => setMode('view')}
        title={`Delete “${project.name}”?`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(`“${project.name}” was deleted.`);
                    navigate('/projects', { replace: true });
                  },
                })
              }
            >
              Delete project
            </Button>
          </>
        }
      >
        <Text size="sm" tone="muted">
          Its architecture and conversation are deleted too. This can’t be undone.
        </Text>
      </Dialog>
    </div>
  );
}

const styles = stylex.create({
  column: { display: 'flex', flexDirection: 'column', gap: space['--space-3'] },
  row: { display: 'flex', alignItems: 'center', gap: space['--space-2'] },
  grow: { flexGrow: 1, minWidth: 0 },
});
