import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSetProposalStatus } from '../lib/conversation';
import { mockApi, renderWithQuery, signedIn, sseResponse } from '../test/render';
import { ChatPane } from './chat-pane';

const SLUG = 'shop-k3xa9q2m7p';
const API = `/api/projects/${SLUG}`;
const at = '2026-09-30T00:00:00Z';
const welcome = {
  role: 'assistant',
  body: "Hi! I'm your AI architect.\n\nWhat are you building, and who is it for?",
  createdAt: at,
};

const echoUser = ({ json }: { json?: unknown }) => ({
  status: 201,
  body: { role: 'user', body: (json as { body: string }).body.trim(), createdAt: at },
});
const aiSays = (text: string) => () =>
  sseResponse(
    ['delta', { text: text.slice(0, 5) }],
    ['delta', { text: text.slice(5) }],
    ['done', { role: 'assistant', body: text, createdAt: at }],
  );

function setup(routes: Parameters<typeof mockApi>[0] = {}, history: unknown[] = [welcome]) {
  const post = vi.fn(echoUser);
  const reply = vi.fn(aiSays('How many users will it have?'));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        [`GET ${API}/messages`]: history,
        [`POST ${API}/messages`]: post,
        [`POST ${API}/reply`]: reply,
        ...routes,
      }),
    ),
  );
  renderWithQuery(<ChatPane slug={SLUG} />, { auth: signedIn() });
  return { post, reply };
}

const messages = () => screen.getByRole('list', { name: 'Messages' });
const box = () => screen.getByLabelText('Message');

async function send(text: string) {
  await screen.findByText(/who is it for/);
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('ChatPane', () => {
  it('opens with the welcome message from the AI', async () => {
    setup();

    expect(
      await screen.findByText(/What are you building, and who is it for\?/),
    ).toBeInTheDocument();
    expect(within(messages()).getByText('AI architect')).toBeInTheDocument();
  });

  it('sends a message and streams the AI reply after it', async () => {
    const { post, reply } = setup();

    await send('A URL shortener');

    expect(await within(messages()).findByText('A URL shortener')).toBeInTheDocument();
    expect(await within(messages()).findByText('How many users will it have?')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ json: { body: 'A URL shortener' } }),
    );
    expect(reply).toHaveBeenCalledTimes(1);
    expect(box()).toHaveValue('');
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('sends on Enter and adds a line on Shift+Enter', async () => {
    const { post } = setup();
    await screen.findByText(/who is it for/);
    fireEvent.change(box(), { target: { value: 'Line one' } });

    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(post).not.toHaveBeenCalled();

    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it('does not send blank messages', async () => {
    setup();
    await screen.findByText(/who is it for/);

    fireEvent.change(box(), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the draft and says so when sending fails', async () => {
    setup({ [`POST ${API}/messages`]: { status: 500, body: { error: 'internal' } } });

    await send('Important context');

    expect(await screen.findByText(/couldn't send/i)).toBeInTheDocument();
    expect(box()).toHaveValue('Important context');
  });

  it('explains the daily limit', async () => {
    setup({ [`POST ${API}/messages`]: { status: 429, body: { error: 'daily_limit' } } });

    await send('One more');

    expect(await screen.findByText(/today's message limit/i)).toBeInTheDocument();
  });

  it('offers a retry when the AI fails, and saves nothing partial', async () => {
    let fail = true;
    setup({
      [`POST ${API}/reply`]: () =>
        fail
          ? sseResponse(['delta', { text: 'Half an ans' }], ['error', { error: 'ai_failed' }])
          : aiSays('A full answer.')(),
    });

    await send('A URL shortener');

    expect(await screen.findByText(/couldn't reply/i)).toBeInTheDocument();
    expect(screen.queryByText('Half an ans')).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await within(messages()).findByText('A full answer.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reply/i)).not.toBeInTheDocument();
  });

  it('says when the AI is not configured', async () => {
    setup({ [`POST ${API}/reply`]: { status: 503, body: { error: 'ai_unavailable' } } });

    await send('Hello');

    expect(await screen.findByText(/isn't set up/i)).toBeInTheDocument();
  });

  it('offers to get a reply for a message left unanswered', async () => {
    const { reply } = setup({}, [welcome, { role: 'user', body: 'Still waiting', createdAt: at }]);

    fireEvent.click(await screen.findByRole('button', { name: 'Get a reply' }));

    expect(await within(messages()).findByText('How many users will it have?')).toBeInTheDocument();
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it('shows a proposal with its changes and lets the user accept it from the chat', async () => {
    const proposal = {
      seq: 1,
      summary: 'Add a cache',
      status: 'pending',
      baseVersion: 0,
      changes: [
        { op: 'add_component', ref: 'cache', type: 'cache', name: 'Order Cache' },
        { op: 'add_connection', source: 'api', target: 'cache', kind: 'sync' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          [`GET ${API}/messages`]: [
            welcome,
            { role: 'assistant', body: 'Here is a cache.', createdAt: at, proposal },
          ],
        }),
      ),
    );
    const review = {
      seq: 1,
      stale: null,
      busy: false,
      error: null,
      names: { api: 'Orders API' },
      accept: vi.fn(),
      reject: vi.fn(),
    };
    renderWithQuery(<ChatPane slug={SLUG} review={review} />, { auth: signedIn() });

    expect(await screen.findByText('Add Cache “Order Cache”')).toBeInTheDocument();
    expect(screen.getByText('Connect Orders API → Order Cache (sync)')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(review.accept).toHaveBeenCalled();
  });

  it('marks an older pending proposal as replaced when a new one arrives', async () => {
    const old = { seq: 1, summary: 'Old idea', status: 'pending', baseVersion: 0, changes: [] };
    const fresh = { seq: 2, summary: 'New idea', status: 'pending', baseVersion: 0, changes: [] };
    setup(
      {
        [`POST ${API}/reply`]: () =>
          sseResponse([
            'done',
            { role: 'assistant', body: 'A better idea.', createdAt: at, proposal: fresh },
          ]),
      },
      [welcome, { role: 'assistant', body: 'Idea one.', createdAt: at, proposal: old }],
    );

    await send('Something better?');

    expect(await screen.findByText('A better idea.')).toBeInTheDocument();
    expect(screen.getByText('Replaced')).toBeInTheDocument();
  });

  describe('after the user reviews a proposal', () => {
    const proposed = (status: string) => ({
      role: 'assistant',
      body: 'Here is a cache.',
      createdAt: at,
      proposal: { seq: 1, summary: 'Add a cache', status, baseVersion: 0, changes: [] },
    });

    /** Resolves Proposal 1 the way the canvas does. */
    function Resolve({ status }: { status: 'accepted' | 'rejected' }) {
      const setStatus = useSetProposalStatus(SLUG);
      return (
        <button type="button" onClick={() => setStatus(1, status)}>
          resolve
        </button>
      );
    }

    it.each(['accepted', 'rejected'] as const)(
      'continues the conversation once %s',
      async (status) => {
        const reply = vi.fn(aiSays('Next, let us talk about availability.'));
        vi.stubGlobal(
          'fetch',
          vi.fn(
            mockApi({
              [`GET ${API}/messages`]: [welcome, proposed('pending')],
              [`POST ${API}/reply`]: reply,
            }),
          ),
        );
        renderWithQuery(
          <>
            <ChatPane slug={SLUG} />
            <Resolve status={status} />
          </>,
          { auth: signedIn() },
        );
        await screen.findByText('Here is a cache.');
        expect(reply).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'resolve' }));

        expect(
          await within(messages()).findByText('Next, let us talk about availability.'),
        ).toBeInTheDocument();
        expect(reply).toHaveBeenCalledTimes(1);
      },
    );

    it('offers the reply instead of fetching it when the review happened earlier', async () => {
      const { reply } = setup({}, [welcome, proposed('accepted')]);

      fireEvent.click(await screen.findByRole('button', { name: 'Get a reply' }));

      expect(
        await within(messages()).findByText('How many users will it have?'),
      ).toBeInTheDocument();
      expect(reply).toHaveBeenCalledTimes(1);
    });
  });
});
