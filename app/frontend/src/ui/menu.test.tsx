import { fireEvent, render, screen } from '@testing-library/react';
import { LogOut, Settings } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuItem, MenuSeparator } from './menu';

function renderMenu(onSelect = vi.fn()) {
  render(
    <>
      <Menu label="Account" trigger="Open">
        <MenuItem onSelect={onSelect}>Sign out</MenuItem>
      </Menu>
      <p>Outside</p>
    </>,
  );
  return onSelect;
}

describe('Menu', () => {
  it('opens from its button and runs the chosen item', () => {
    const onSelect = renderMenu();
    const button = screen.getByRole('button', { name: 'Account' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(item).toHaveFocus();

    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', () => {
    renderMenu();
    const button = screen.getByRole('button', { name: 'Account' });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('shows icons beside items and separates groups', () => {
    const { container } = render(
      <Menu label="Account" trigger="Open">
        <MenuItem icon={Settings} onSelect={vi.fn()}>
          Settings
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={LogOut} onSelect={vi.fn()}>
          Sign out
        </MenuItem>
      </Menu>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(container.querySelectorAll('[role="menuitem"] svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('closes on a click outside', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    fireEvent.pointerDown(screen.getByText('Outside'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
