import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandLine } from './command-line';

describe('CommandLine', () => {
  it('shows the command', () => {
    render(<CommandLine command="make dev" />);

    expect(screen.getByText('make dev')).toBeInTheDocument();
  });

  it('copies the command and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CommandLine command="make dev" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));

    expect(writeText).toHaveBeenCalledWith('make dev');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
