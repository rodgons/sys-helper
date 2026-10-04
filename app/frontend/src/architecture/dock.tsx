import * as stylex from '@stylexjs/stylex';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { color, motion, radius, space, text } from '../design/tokens.stylex';
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

/**
 * The compact canvas's dock: one "+ Add" button opening a grid of every Component Type (icon and
 * label, three columns) above it. A pick adds that Component; a pick, a tap on the backdrop or Esc
 * closes the grid. No hover tooltips or dragging, which touch screens lack.
 */
export function ComponentPicker({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // The grid opens above the button and scrolls within the canvas above it, however short the
  // canvas is with the sheet raised.
  const [room, setRoom] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = root.current?.closest('.react-flow')?.getBoundingClientRect();
    const top = root.current?.getBoundingClientRect().top;
    if (canvas && top !== undefined && top > canvas.top) setRoom(top - canvas.top - 16);
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div ref={root} {...stylex.props(styles.picker)}>
      {open && (
        <>
          {/* A tap outside the grid closes it; keyboards use Esc, so it is out of the tab order. */}
          <button
            type="button"
            aria-label="Close the component grid"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            {...stylex.props(styles.backdrop)}
          />
          <div
            role="dialog"
            aria-label="Add component"
            {...stylex.props(styles.grid, room !== null && styles.room(`${room}px`))}
          >
            {COMPONENT_TYPES.map((t) => {
              const Icon = lookOf(t.type).icon;
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAdd(t.type);
                  }}
                  {...stylex.props(styles.choice)}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  <span {...stylex.props(styles.choiceLabel)}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        {...stylex.props(styles.dock, styles.add)}
      >
        <Plus size={18} aria-hidden="true" />
        Add
      </button>
    </div>
  );
}

const styles = stylex.create({
  picker: { position: 'relative', display: 'flex', justifyContent: 'center' },
  add: {
    alignItems: 'center',
    gap: space['--space-1'],
    minHeight: 44,
    paddingInline: space['--space-4'],
    color: color['--color-fg'],
    fontSize: text['--text-sm'],
    fontWeight: 600,
    cursor: 'pointer',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'default',
  },
  grid: {
    position: 'absolute',
    bottom: `calc(100% + ${space['--space-2']})`,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: space['--space-1'],
    width: 'min(22rem, calc(100vw - 2rem))',
    maxHeight: '60dvh',
    overflowY: 'auto',
    padding: space['--space-2'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-lg'],
    backgroundColor: color['--color-raised'],
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.16)',
  },
  room: (maxHeight: string) => ({ maxHeight }),
  choice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['--space-1'],
    minHeight: 64,
    padding: space['--space-2'],
    borderWidth: 0,
    borderRadius: radius['--radius-md'],
    backgroundColor: { default: 'transparent', ':active': color['--color-accent-soft'] },
    color: color['--color-fg'],
    cursor: 'pointer',
  },
  choiceLabel: { fontSize: text['--text-xs'], textAlign: 'center', lineHeight: 1.2 },
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
