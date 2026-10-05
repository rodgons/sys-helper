import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Decision } from '../lib/knowledge';
import { EXPLANATIONS } from '../test/explanations';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { DecisionsPanel } from './decisions';

const SLUG = 'shop-k3xa9q2m7p';
const API = `/api/projects/${SLUG}`;

const decision = (patch: Partial<Decision>): Decision => ({
  id: 'D1',
  title: 'Cache order reads',
  rationale: 'Reads dominate.',
  pattern: 'Cache-aside',
  patternId: 'cache-aside',
  alternative: '',
  requirements: [],
  targets: ['cache'],
  author: 'ai',
  needsReview: false,
  ...patch,
});

function setup({
  level = 'beginner',
  decisions = [decision({})],
  explanations = EXPLANATIONS as unknown,
}: {
  level?: string;
  decisions?: Decision[];
  explanations?: unknown;
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        [`GET ${API}/knowledge`]: { experienceLevel: level, requirements: [], decisions },
        'GET /api/explanations': explanations,
      }),
    ),
  );
  renderWithQuery(<DecisionsPanel slug={SLUG} names={{ cache: 'Order Cache' }} />, {
    auth: signedIn(),
  });
}

const card = () => screen.getByRole('article', { name: 'D1 Cache order reads' });

async function open(name: string) {
  const summary = await screen.findByText(`What is ${name}?`);
  fireEvent.click(summary);
  return summary.closest('details') as HTMLElement;
}

describe('Pattern explanations on a Decision card', () => {
  it("shows the pattern as written, and explains it at the Project's level", async () => {
    setup();

    const details = await open('Cache-Aside');

    expect(within(card()).getByText('Cache-aside')).toBeInTheDocument();
    expect(details).toHaveAttribute('open');
    expect(within(details).getByText('The app reads the cache first.')).toBeInTheDocument();
    const tabs = within(details).getByRole('tablist', { name: 'Explain for' });
    const beginner = within(tabs).getByRole('tab', { name: 'Beginner · yours' });
    expect(beginner).toHaveAttribute('aria-selected', 'true');
    expect(within(details).getByRole('tabpanel')).toHaveTextContent(
      'Like keeping books on your desk.',
    );
    expect(within(details).getByText('books').tagName).toBe('STRONG');
  });

  it('switches to another level', async () => {
    setup();
    const details = await open('Cache-Aside');

    fireEvent.click(within(details).getByRole('tab', { name: 'Expert' }));

    expect(within(details).getByRole('tab', { name: 'Expert' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(details).getByRole('tabpanel')).toHaveTextContent(
      'Hot keys stampede the database on expiry.',
    );
  });

  it('links to the reference in a new tab', async () => {
    setup();
    const details = await open('Cache-Aside');

    const link = within(details).getByRole('link', { name: /Read more/ });

    expect(link).toHaveAttribute(
      'href',
      'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens on Intermediate and marks nothing as yours when no level is recorded', async () => {
    setup({ level: '' });
    const details = await open('Cache-Aside');

    expect(within(details).getByRole('tab', { name: 'Intermediate' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(details).queryByText(/yours/)).not.toBeInTheDocument();
  });

  it('keeps a pattern the catalog lacks as plain text', async () => {
    setup({ decisions: [decision({ pattern: 'Single primary', patternId: undefined })] });

    expect(
      await within(await screen.findByRole('article')).findByText('Single primary'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/What is/)).not.toBeInTheDocument();
  });

  it('shows patterns plain when the explanations fail to load', async () => {
    setup({ explanations: { status: 500, body: { error: 'internal' } } });

    expect(await screen.findByText('Cache-aside')).toBeInTheDocument();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/What is/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
  });

  it("suggests the catalog's Pattern names in the Decision form", async () => {
    setup();
    await screen.findByText('What is Cache-Aside?');

    fireEvent.click(within(card()).getByRole('button', { name: 'Edit' }));

    const field = screen.getByLabelText('Pattern');
    const list = document.getElementById(field.getAttribute('list') ?? '');
    expect(list?.tagName).toBe('DATALIST');
    expect([...(list?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual([
      'Cache-Aside',
      'Sharding',
    ]);
    fireEvent.change(field, { target: { value: 'Anything at all' } });
    expect(field).toHaveValue('Anything at all');
  });
});
