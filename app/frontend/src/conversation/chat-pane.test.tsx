import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { ChatPane } from './chat-pane';

const SLUG = 'shop-k3xa9q2m7p';
const welcome = {
  role: 'assistant',
  body: "Hi! I'm your AI architect.\n\nWhat are you building, and who is it for?",
  createdAt: '2026-09-30T00:00:00Z',
};

function setup(
  send: Parameters<typeof mockApi>[0][string] = ({ json }: { json?: unknown }) => ({
    status: 201,
    body: {
      role: 'user',
      body: (json as { body: string }).body.trim(),
      createdAt: '2026-09-30T00:01:00Z',
    },
  }),
) {
  const post = vi.fn(send as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        [`GET /api/projects/${SLUG}/messages`]: [welcome],
        [`POST /api/projects/${SLUG}/messages`]: post,
      }),
    ),
  );
  renderWithQuery(<ChatPane slug={SLUG} />, { auth: signedIn() });
  return post;
}

const messages = () => screen.getByRole('list', { name: 'Messages' });

describe('ChatPane', () => {
  it('opens with the welcome message from the AI', async () => {
    setup();

    expect(
      await screen.findByText(/What are you building, and who is it for\?/),
    ).toBeInTheDocument();
    expect(within(messages()).getByText('AI architect')).toBeInTheDocument();
  });

  it('sends a message and shows it in the conversation', async () => {
    const post = setup();
    await screen.findByText(/who is it for/);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A URL shortener' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await within(messages()).findByText('A URL shortener')).toBeInTheDocument();
    expect(within(messages()).getByText('You')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ json: { body: 'A URL shortener' } }),
    );
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('sends on Enter and adds a line on Shift+Enter', async () => {
    const post = setup();
    await screen.findByText(/who is it for/);
    const box = screen.getByLabelText('Message');
    fireEvent.change(box, { target: { value: 'Line one' } });

    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(post).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it('does not send blank messages', async () => {
    setup();
    await screen.findByText(/who is it for/);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the draft and says so when sending fails', async () => {
    setup(() => ({ status: 500, body: { error: 'internal' } }));
    await screen.findByText(/who is it for/);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Important context' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/couldn't send/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('Important context');
  });
});
