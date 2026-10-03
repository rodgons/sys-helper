import * as stylex from '@stylexjs/stylex';
import { Monitor, Moon, Sun } from 'lucide-react';
import { color, motion } from '../design/tokens.stylex';
import type { ThemeChoice } from '../lib/theme';
import { Menu, MenuItem } from './menu';

const CHOICES = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const;

/** Icon button choosing System, Light or Dark. Its icon shows the current choice. */
export function ThemeMenu({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  const Current = CHOICES.find((c) => c.value === choice)?.icon ?? Monitor;
  return (
    <Menu
      label="Theme"
      trigger={<Current size={18} strokeWidth={1.75} aria-hidden="true" />}
      xstyle={styles.trigger}
    >
      {CHOICES.map(({ value, label, icon }) => (
        <MenuItem
          key={value}
          icon={icon}
          checked={value === choice}
          onSelect={() => onChange(value)}
        >
          {label}
        </MenuItem>
      ))}
    </Menu>
  );
}

const styles = stylex.create({
  // The size of the Avatar beside it in the header.
  trigger: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    color: { default: color['--color-fg-muted'], ':hover': color['--color-fg'] },
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
  },
});
