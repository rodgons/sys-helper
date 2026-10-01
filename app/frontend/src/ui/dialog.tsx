import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { color, radius, space } from '../design/tokens.stylex';
import { Heading } from './typography';

/**
 * Modal dialog on the native `<dialog>`: it traps focus, closes on Escape and on a backdrop
 * click, and renders only while `open`. `actions` sit bottom-right, primary action last.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  if (!open) return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard way out is Escape, via onCancel.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop, outside the panel.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      {...stylex.props(styles.dialog)}
    >
      <div {...stylex.props(styles.panel)}>
        <Heading as="h2" size="sm" id={titleId}>
          {title}
        </Heading>
        {children}
        {actions && <div {...stylex.props(styles.actions)}>{actions}</div>}
      </div>
    </dialog>
  );
}

const styles = stylex.create({
  dialog: {
    width: 'min(28rem, calc(100vw - 2rem))',
    padding: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-xl'],
    backgroundColor: color['--color-raised'],
    color: color['--color-fg'],
    '::backdrop': { backgroundColor: 'rgb(13 11 18 / 0.5)' },
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-4'],
    padding: space['--space-6'],
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: space['--space-2'],
    marginTop: space['--space-2'],
  },
});
