import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSetProposalStatus } from '../lib/conversation';
import { EXPLANATIONS } from '../test/explanations';
import { mockApi, renderWithQuery, signedIn, sseResponse } from '../test/render';
import { Toaster } from '../ui/toaster';
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

  it('reminds the user not to share secrets with the third-party models', async () => {
    setup();

    expect(await screen.findByText(/third-party AI models/i)).toBeInTheDocument();
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

  it('recalls earlier messages with the arrow keys', async () => {
    setup({}, [
      welcome,
      { role: 'user', body: 'A URL shortener', createdAt: at },
      { role: 'assistant', body: 'How many users?', createdAt: at },
      { role: 'user', body: 'About 1M a day', createdAt: at },
      { role: 'assistant', body: 'Got it.', createdAt: at },
    ]);
    await screen.findByText('Got it.');

    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box()).toHaveValue('About 1M a day');
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box()).toHaveValue('A URL shortener');
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box()).toHaveValue('A URL shortener');

    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(box()).toHaveValue('About 1M a day');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(box()).toHaveValue('');
  });

  it('leaves the arrow keys alone once the draft is edited', async () => {
    setup({}, [welcome, { role: 'user', body: 'A URL shortener', createdAt: at }]);
    await screen.findByText('A URL shortener');

    fireEvent.change(box(), { target: { value: 'Something new' } });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box()).toHaveValue('Something new');

    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.change(box(), { target: { value: 'A URL shortener, with analytics' } });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box()).toHaveValue('A URL shortener, with analytics');
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

  it('says when the conversation is full', async () => {
    setup({
      [`POST ${API}/messages`]: { status: 409, body: { error: 'limit_reached', detail: 'full' } },
    });

    await send('One too many');

    expect(await screen.findByText(/conversation is full/i)).toBeInTheDocument();
    expect(box()).toHaveValue('One too many');
  });

  it('explains the daily AI limit and keeps the message for a later reply', async () => {
    setup({ [`POST ${API}/reply`]: { status: 429, body: { error: 'daily_limit' } } });

    await send('One more');

    expect(await screen.findByText(/today's AI limit/i)).toBeInTheDocument();
    expect(within(messages()).getByText('One more')).toBeInTheDocument();
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

  it('reloads the conversation when the stream drops, since the server may have saved the reply', async () => {
    const user = { role: 'user', body: 'A URL shortener', createdAt: at };
    const saved = { role: 'assistant', body: 'The saved answer.', createdAt: at };
    let history: unknown[] = [welcome];
    setup({
      [`GET ${API}/messages`]: () => history,
      [`POST ${API}/reply`]: () => {
        history = [welcome, user, saved];
        // The connection ends mid-reply: no `done`, no `error`.
        return sseResponse(['delta', { text: 'The saved' }]);
      },
    });

    await send('A URL shortener');

    expect(await within(messages()).findByText('The saved answer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('reloads the conversation when there turns out to be nothing to reply to', async () => {
    const user = { role: 'user', body: 'Hello', createdAt: at };
    const saved = { role: 'assistant', body: 'Already answered.', createdAt: at };
    let history: unknown[] = [welcome, user];
    setup({
      [`GET ${API}/messages`]: () => history,
      [`POST ${API}/reply`]: () => {
        history = [welcome, user, saved];
        return { status: 409, body: { error: 'nothing_to_reply' } };
      },
    });

    await screen.findByText('This message has no reply yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Get a reply' }));

    expect(await within(messages()).findByText('Already answered.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reply/i)).not.toBeInTheDocument();
  });

  it('says when the AI is unavailable, and to try again shortly', async () => {
    setup({ [`POST ${API}/reply`]: { status: 503, body: { error: 'ai_unavailable' } } });

    await send('Hello');

    expect(await screen.findByText(/isn't available right now.*try again/i)).toBeInTheDocument();
  });

  it("renders the AI's markdown but keeps the user's text as written", async () => {
    setup({}, [
      welcome,
      { role: 'user', body: 'Use **stars** literally', createdAt: at },
      {
        role: 'assistant',
        body: 'Use a **cache**:\n\n- Redis\n- `TTL` of 60s\n\n<b>raw</b>',
        createdAt: at,
      },
    ]);

    const strong = await screen.findByText('cache');
    expect(strong.tagName).toBe('STRONG');
    expect(
      within(messages())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toContain('Redis');
    expect(screen.getByText('TTL').tagName).toBe('CODE');
    expect(screen.getByText('Use **stars** literally')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it("never loads images from the AI's markdown, showing them as links", async () => {
    setup({}, [
      welcome,
      { role: 'user', body: 'Show me', createdAt: at },
      { role: 'assistant', body: 'Here: ![diagram](https://evil.test/track.png)', createdAt: at },
    ]);

    const link = await screen.findByRole('link', { name: 'diagram' });
    expect(link).toHaveAttribute('href', 'https://evil.test/track.png');
    expect(document.querySelector('img')).toBeNull();
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

  it("shows each recorded decision's pattern, with its explanation when the catalog has it", async () => {
    const proposal = {
      seq: 1,
      summary: 'Add a cache',
      status: 'accepted',
      baseVersion: 0,
      changes: [
        { op: 'add_component', ref: 'cache', type: 'cache', name: 'Order Cache' },
        {
          op: 'add_decision',
          title: 'Cache reads',
          rationale: 'Reads dominate.',
          pattern: 'Cache-aside',
          patternId: 'cache-aside',
          targets: ['cache'],
        },
        {
          op: 'add_decision',
          title: 'Redis',
          rationale: 'Known.',
          pattern: 'Redis cluster',
          targets: ['cache'],
        },
      ],
    };
    setup(
      {
        [`GET ${API}/knowledge`]: { experienceLevel: 'expert', requirements: [], decisions: [] },
        'GET /api/explanations': EXPLANATIONS,
      },
      [welcome, { role: 'assistant', body: 'Here is a cache.', createdAt: at, proposal }],
    );

    const line = (await screen.findByText(/Record decision “Cache reads”/)).closest(
      'li',
    ) as HTMLElement;
    expect(line).toHaveTextContent('Record decision “Cache reads” on Order Cache · Cache-aside');
    fireEvent.click(await within(line).findByText('What is Cache-Aside?'));
    expect(await within(line).findByRole('tab', { name: 'Expert · yours' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const plain = screen.getByText(/Record decision “Redis”/).closest('li') as HTMLElement;
    expect(plain).toHaveTextContent('· Redis cluster');
    expect(within(plain).queryByText(/What is/)).not.toBeInTheDocument();
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

    it('scrolls to the AI thinking about its follow-up', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          mockApi({
            [`GET ${API}/messages`]: [welcome, proposed('pending')],
            [`POST ${API}/reply`]: () => new Promise<never>(() => {}),
          }),
        ),
      );
      renderWithQuery(
        <>
          <ChatPane slug={SLUG} />
          <Resolve status="accepted" />
        </>,
        { auth: signedIn() },
      );
      await screen.findByText('Here is a cache.');
      // happy-dom doesn't lay out, so give the list a height and scroll it back to the top.
      Object.defineProperty(messages(), 'scrollHeight', { configurable: true, value: 900 });
      messages().scrollTop = 0;

      fireEvent.click(screen.getByRole('button', { name: 'resolve' }));

      expect(await within(messages()).findByText('Thinking…')).toBeInTheDocument();
      await waitFor(() => expect(messages().scrollTop).toBe(900));
    });

    it('offers the reply instead of fetching it when the review happened earlier', async () => {
      const { reply } = setup({}, [welcome, proposed('accepted')]);

      fireEvent.click(await screen.findByRole('button', { name: 'Get a reply' }));

      expect(
        await within(messages()).findByText('How many users will it have?'),
      ).toBeInTheDocument();
      expect(reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('new conversation', () => {
    const fresh = { role: 'assistant', body: 'Fresh welcome. What next?', createdAt: at };
    const talk = [
      welcome,
      { role: 'user', body: 'A URL shortener', createdAt: at },
      { role: 'assistant', body: 'How many users?', createdAt: at },
    ];
    const pending = {
      role: 'assistant',
      body: 'Here is a cache.',
      createdAt: at,
      proposal: { seq: 1, summary: 'Add a cache', status: 'pending', baseVersion: 0, changes: [] },
    };
    const newButton = () => screen.getByRole('button', { name: 'New conversation' });
    const dialog = () => screen.getByRole('dialog', { name: 'Start a new conversation?' });
    const never = () => new Promise<never>(() => {});

    it('is not offered while the conversation is only the welcome message', async () => {
      setup();
      await screen.findByText(/who is it for/);

      expect(newButton()).toBeDisabled();
      expect(newButton()).toHaveAttribute('title', 'New conversation');
    });

    it('asks first, then replaces the messages with the new ones without reloading', async () => {
      const start = vi.fn(() => [fresh]);
      setup({ [`POST ${API}/conversation`]: start }, talk);
      await screen.findByText('How many users?');

      fireEvent.click(newButton());
      expect(dialog()).toHaveTextContent(
        'The current messages will be deleted. Your architecture, requirements and decisions stay, and the AI still sees them.',
      );
      expect(dialog()).not.toHaveTextContent(/pending proposal/i);
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(start).not.toHaveBeenCalled();

      fireEvent.click(newButton());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Start new conversation' }));

      expect(await within(messages()).findByText('Fresh welcome. What next?')).toBeInTheDocument();
      expect(within(messages()).queryByText('How many users?')).not.toBeInTheDocument();
      expect(within(messages()).queryByText(/who is it for/)).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(start).toHaveBeenCalledTimes(1);
      const loads = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url, init]) => String(url).endsWith('/messages') && (init?.method ?? 'GET') === 'GET',
        );
      expect(loads).toHaveLength(1);
      expect(newButton()).toBeDisabled();
    });

    it('warns that a pending proposal will be discarded', async () => {
      setup({}, [welcome, pending]);
      await screen.findByText('Here is a cache.');

      fireEvent.click(newButton());

      expect(dialog()).toHaveTextContent('The pending proposal will be discarded.');
    });

    it('keeps the draft, drops a failed reply and forgets the old messages for recall', async () => {
      setup(
        {
          [`POST ${API}/reply`]: { status: 503, body: { error: 'ai_unavailable' } },
          [`POST ${API}/conversation`]: [fresh],
        },
        [welcome, { role: 'user', body: 'A URL shortener', createdAt: at }],
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Get a reply' }));
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
      fireEvent.change(box(), { target: { value: 'Next idea' } });

      fireEvent.click(newButton());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Start new conversation' }));

      expect(await within(messages()).findByText('Fresh welcome. What next?')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.queryByText(/isn't available/)).not.toBeInTheDocument();
      expect(box()).toHaveValue('Next idea');
      fireEvent.change(box(), { target: { value: '' } });
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(box()).toHaveValue('');
    });

    it('is disabled while a message is sending', async () => {
      setup({ [`POST ${API}/messages`]: never }, talk);
      await screen.findByText('How many users?');

      fireEvent.change(box(), { target: { value: 'More' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(newButton()).toBeDisabled());
    });

    it('is disabled while the AI replies', async () => {
      setup({ [`POST ${API}/reply`]: never }, talk);
      await screen.findByText('How many users?');

      fireEvent.change(box(), { target: { value: 'More' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(await screen.findByText('Thinking…')).toBeInTheDocument();
      expect(newButton()).toBeDisabled();
    });

    it('is disabled while a proposal review is in flight', async () => {
      vi.stubGlobal('fetch', vi.fn(mockApi({ [`GET ${API}/messages`]: [welcome, pending] })));
      const review = {
        seq: 1,
        stale: null,
        busy: true,
        error: null,
        names: {},
        accept: vi.fn(),
        reject: vi.fn(),
      };
      renderWithQuery(<ChatPane slug={SLUG} review={review} />, { auth: signedIn() });
      await screen.findByText('Here is a cache.');

      expect(newButton()).toBeDisabled();
    });

    it('shows that it is working while the reset runs', async () => {
      setup({ [`POST ${API}/conversation`]: never }, talk);
      await screen.findByText('How many users?');

      fireEvent.click(newButton());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Start new conversation' }));

      const working = await within(dialog()).findByRole('button', { name: 'Starting…' });
      expect(working).toBeDisabled();
      expect(working).toHaveAttribute('aria-busy', 'true');
      expect(newButton()).toBeDisabled();
    });

    it('says when the AI is still replying, and changes nothing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          mockApi({
            [`GET ${API}/messages`]: talk,
            [`POST ${API}/conversation`]: { status: 409, body: { error: 'busy' } },
          }),
        ),
      );
      renderWithQuery(
        <>
          <ChatPane slug={SLUG} />
          <Toaster />
        </>,
        { auth: signedIn() },
      );
      await screen.findByText('How many users?');

      fireEvent.click(newButton());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Start new conversation' }));

      expect(
        await screen.findByText('The AI is still replying. Try again when it finishes.'),
      ).toBeInTheDocument();
      expect(within(messages()).getByText('How many users?')).toBeInTheDocument();
    });
  });
});
