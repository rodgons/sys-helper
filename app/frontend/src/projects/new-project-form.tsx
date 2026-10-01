import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { space } from '../design/tokens.stylex';
import { isLimit } from '../lib/api';
import { useCreateProject } from '../lib/projects';
import { Button } from '../ui/button';
import { TextField } from '../ui/text-field';
import { Text } from '../ui/typography';

/**
 * Creates a Project from a name and opens it. With `onCancel` it is a dialog's body: Cancel joins
 * the actions, which sit bottom-right with the primary one last, as in Dialog.
 */
export function NewProjectForm({ onCancel }: { onCancel?: () => void }) {
  const [name, setName] = useState('');
  const create = useCreateProject();
  const navigate = useNavigate();

  return (
    <form
      {...stylex.props(styles.form)}
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(name, {
          onSuccess: (project) => {
            onCancel?.();
            navigate(`/p/${project.slug}`);
          },
        });
      }}
    >
      <TextField
        label="Project name"
        placeholder="e.g. URL shortener"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        required
        autoFocus
      />
      {create.isError && (
        <Text size="sm" tone="accent">
          {isLimit(create.error)
            ? "You've reached the maximum number of projects. Delete one to create another."
            : "Couldn't create the project. Try again."}
        </Text>
      )}
      <div {...stylex.props(styles.actions, onCancel && styles.dialogActions)}>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={create.isPending || name.trim() === ''}>
          Create project
        </Button>
      </div>
    </form>
  );
}

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: space['--space-3'] },
  actions: { display: 'flex', gap: space['--space-2'] },
  dialogActions: { justifyContent: 'flex-end', marginTop: space['--space-2'] },
});
