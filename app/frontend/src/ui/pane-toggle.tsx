import * as stylex from '@stylexjs/stylex';
import { color, font, radius } from '../design/tokens.stylex';

/**
 * Collapses or expands a workspace pane. `side` is the window edge the pane sits on, so the arrow
 * points the way the pane moves; `name` completes the accessible label ("Hide projects").
 */
export function PaneToggle({
  side,
  name,
  open,
  onToggle,
}: {
  side: 'left' | 'right';
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  const label = `${open ? 'Hide' : 'Show'} ${name}`;
  const pointsLeft = open === (side === 'left');
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      title={label}
      {...stylex.props(styles.toggle)}
    >
      <span aria-hidden="true">{pointsLeft ? '«' : '»'}</span>
      <span {...stylex.props(styles.srOnly)}>{label}</span>
    </button>
  );
}

const styles = stylex.create({
  toggle: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-sm'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    color: color['--color-fg'],
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
});
