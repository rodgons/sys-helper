import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { SettingsDialog } from './settings-dialog';

afterEach(() => vi.unstubAllGlobals());

function setup(deleteReply: unknown = { status: 204 }) {
  const remove = vi.fn(() => deleteReply);
  vi.stubGlobal(
    'fetch',
    vi.fn(mockApi({ 'GET /api/settings': { experienceLevel: '' }, 'DELETE /api/me': remove })),
  );
  const auth = signedIn();
  renderWithQuery(<SettingsDialog onClose={() => {}} />, { auth });
  return { remove, auth, dialog: screen.getByRole('dialog', { name: 'Settings' }) };
}

describe('SettingsDialog', () => {
  it('deletes the account only after a second, explicit confirmation, then signs out', async () => {
    const { remove, auth, dialog } = setup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account…' }));
    expect(remove).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/permanently deletes/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  });

  it('lets the User back out of deleting', () => {
    const { remove, dialog } = setup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account…' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep my account' }));

    expect(within(dialog).queryByRole('button', { name: 'Delete my account' })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('says so, and stays signed in, when deleting fails', async () => {
    const { auth, dialog } = setup({ status: 500, body: { error: 'internal' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account…' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    expect(await within(dialog).findByText(/couldn't delete your account/i)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
