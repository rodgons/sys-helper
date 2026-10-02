import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyValue } from './copy-value';

afterEach(() => vi.unstubAllGlobals());

describe('CopyValue', () => {
  it('copies the value and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyValue label="Google id" value="108" />);

    expect(screen.getByText('108')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Google id' }));

    expect(writeText).toHaveBeenCalledWith('108');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('asks for a manual copy when the clipboard rejects', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyValue label="Google id" value="108" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Google id' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Copy failed. Select the Google id and copy it manually.',
    );
    expect(screen.getByText('108')).toBeInTheDocument();
  });

  it('asks for a manual copy when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {});
    render(<CopyValue label="Google id" value="108" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Google id' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Copy failed. Select the Google id and copy it manually.',
    );
  });
});
