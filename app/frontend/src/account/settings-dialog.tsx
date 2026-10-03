import * as stylex from '@stylexjs/stylex';
import { useId, useState } from 'react';
import { color, radius, space } from '../design/tokens.stylex';
import { useAuth } from '../lib/auth';
import { LEVELS } from '../lib/knowledge';
import { useDeleteAccount } from '../lib/me';
import { useSaveSettings, useSettings } from '../lib/settings';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { SelectField } from '../ui/select-field';
import { toast } from '../ui/toaster';
import { Text } from '../ui/typography';

/** The User's settings, in a dialog opened from the account menu. Mount it only while open. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const formId = useId();
  // null until the User picks a level: the select shows the saved one until then.
  const [draft, setDraft] = useState<string | null>(null);
  const level = draft ?? settings.data?.experienceLevel ?? '';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Settings"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            size="sm"
            disabled={!settings.isSuccess || save.isPending}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { experienceLevel: level },
            {
              onSuccess: () => {
                toast.success('Settings saved.');
                onClose();
              },
              onError: () => toast.error("Couldn't save your settings. Try again."),
            },
          );
        }}
        {...stylex.props(styles.form)}
      >
        <SelectField
          label="Default experience level"
          value={level}
          disabled={!settings.isSuccess}
          onChange={(e) => setDraft(e.target.value)}
          options={[{ value: '', label: 'Ask in each project' }, ...LEVELS]}
        />
        <Text size="sm" tone="muted">
          {settings.isError
            ? "Couldn't load your settings. Try again later."
            : 'Sets how deeply the AI explains its decisions. Every project uses it, unless you pick a different level in its Requirements tab.'}
        </Text>
      </form>
      <DeleteAccount />
    </Dialog>
  );
}

/** Deletes the User's account, after a second, explicit confirmation. */
function DeleteAccount() {
  const auth = useAuth();
  const remove = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div {...stylex.props(styles.danger)}>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          Delete account…
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" {...stylex.props(styles.danger, styles.confirm)}>
      <Text size="sm">
        This permanently deletes your account and every project in it: architectures, conversations,
        requirements and decisions. It can't be undone.
      </Text>
      {remove.isError && (
        <Text size="sm" tone="accent">
          Couldn't delete your account. Try again.
        </Text>
      )}
      <div {...stylex.props(styles.row)}>
        <Button
          size="sm"
          disabled={remove.isPending}
          xstyle={styles.destructive}
          onClick={() => remove.mutate(undefined, { onSuccess: () => auth.signOut() })}
        >
          Delete my account
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep my account
        </Button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: space['--space-3'] },
  danger: {
    marginTop: space['--space-4'],
    paddingTop: space['--space-3'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  confirm: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-danger'],
    borderRadius: radius['--radius-md'],
  },
  row: { display: 'flex', gap: space['--space-2'] },
  destructive: { backgroundColor: color['--color-danger'] },
});
