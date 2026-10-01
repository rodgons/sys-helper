import * as stylex from '@stylexjs/stylex';
import { color, motion, radius, space } from '../design/tokens.stylex';
import { COMPONENT_TYPES } from './model';
import { lookOf } from './shapes';

/** The drag data type carrying a Component type from the dock to the canvas. */
export const DRAG_TYPE = 'application/x-sys-helper-component';

/**
 * The Component catalog as a row of icons along the bottom of the canvas. Click one to add it, or
 * drag it onto the canvas to place it.
 */
export function ComponentDock({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <div role="toolbar" aria-label="Add component" {...stylex.props(styles.dock)}>
      {COMPONENT_TYPES.map((t) => {
        const Icon = lookOf(t.type).icon;
        return (
          <button
            key={t.type}
            type="button"
            aria-label={`Add ${t.label}`}
            title={t.label}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, t.type);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(t.type)}
            {...stylex.props(styles.button)}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

const styles = stylex.create({
  dock: {
    display: 'flex',
    gap: 2,
    padding: space['--space-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
  },
  button: {
    display: 'grid',
    placeItems: 'center',
    width: 36,
    height: 36,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius['--radius-sm'],
    backgroundColor: {
      default: 'transparent',
      ':hover': color['--color-accent-soft'],
    },
    color: {
      default: color['--color-fg-muted'],
      ':hover': color['--color-accent-strong'],
    },
    cursor: 'grab',
    outline: 'none',
    boxShadow: { default: 'none', ':focus-visible': `0 0 0 2px ${color['--color-accent']}` },
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
  },
});
