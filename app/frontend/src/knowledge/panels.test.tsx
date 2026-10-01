import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { DecisionsPanel } from './decisions';
import { RequirementsPanel } from './requirements-panel';

const SLUG = 'shop-k3xa9q2m7p';
const API = `/api/projects/${SLUG}`;
const knowledge = {
  experienceLevel: '',
  requirements: [
    { id: 'R1', category: 'scale', statement: '10k orders per minute' },
    { id: 'R2', category: 'cost', statement: 'Under $500 a month' },
  ],
  decisions: [
    {
      id: 'D1',
      title: 'Postgres for orders',
      rationale: 'Orders need transactions.',
      pattern: 'Single primary',
      alternative: 'DynamoDB: no multi-item transactions',
      requirements: ['R1'],
      targets: ['db'],
      author: 'ai',
      needsReview: false,
    },
    {
      id: 'D2',
      title: 'Cache sessions',
      rationale: 'Cheap reads.',
      pattern: '',
      alternative: '',
      requirements: ['R2'],
      targets: ['cache'],
      author: 'user',
      needsReview: true,
    },
  ],
};

function stub(extra: Parameters<typeof mockApi>[0] = {}) {
  const fetch = vi.fn(mockApi({ [`GET ${API}/knowledge`]: knowledge, ...extra }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('RequirementsPanel', () => {
  it('groups requirements by category', async () => {
    stub();
    renderWithQuery(<RequirementsPanel slug={SLUG} />, { auth: signedIn() });

    expect(
      await within(await screen.findByRole('region', { name: 'Scale' })).findByText(
        '10k orders per minute',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Cost' })).getByText('Under $500 a month'),
    ).toBeInTheDocument();
  });

  it('adds, edits and deletes requirements', async () => {
    const add = vi.fn(() => ({ status: 201, body: {} }));
    const edit = vi.fn(() => ({}));
    const remove = vi.fn(() => ({ status: 204 }));
    stub({
      [`POST ${API}/requirements`]: add,
      [`PATCH ${API}/requirements/R1`]: edit,
      [`DELETE ${API}/requirements/R2`]: remove,
    });
    renderWithQuery(<RequirementsPanel slug={SLUG} />, { auth: signedIn() });
    await screen.findByText('10k orders per minute');

    const form = screen.getByRole('form', { name: 'Add requirement' });
    fireEvent.change(within(form).getByLabelText('Category'), {
      target: { value: 'availability' },
    });
    fireEvent.change(within(form).getByLabelText('Requirement'), {
      target: { value: '99.9% uptime' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add requirement' }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ json: { category: 'availability', statement: '99.9% uptime' } }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit R1' }));
    fireEvent.change(screen.getByLabelText('Edit R1'), {
      target: { value: '20k orders per minute' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith(
        expect.objectContaining({ json: { statement: '20k orders per minute' } }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete R2' }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
  });

  it('explains when the project has no room for another requirement', async () => {
    stub({
      [`POST ${API}/requirements`]: {
        status: 409,
        body: { error: 'limit_reached', detail: 'limit reached' },
      },
    });
    renderWithQuery(<RequirementsPanel slug={SLUG} />, { auth: signedIn() });

    const form = await screen.findByRole('form', { name: 'Add requirement' });
    fireEvent.change(within(form).getByLabelText('Requirement'), { target: { value: 'SSO' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add requirement' }));

    expect(await within(form).findByText(/most requirements it can hold/i)).toBeInTheDocument();
    expect(within(form).getByLabelText('Requirement')).toHaveValue('SSO');
  });

  it('sets the experience level', async () => {
    const put = vi.fn(() => ({ experienceLevel: 'expert' }));
    stub({ [`PUT ${API}/experience-level`]: put });
    renderWithQuery(<RequirementsPanel slug={SLUG} />, { auth: signedIn() });

    fireEvent.change(await screen.findByLabelText('Your experience'), {
      target: { value: 'expert' },
    });

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(expect.objectContaining({ json: { level: 'expert' } })),
    );
  });
});

describe('DecisionsPanel', () => {
  it('lists decisions with their reasoning, flagged ones first', async () => {
    stub();
    renderWithQuery(
      <DecisionsPanel slug={SLUG} names={{ db: 'Orders DB', cache: 'Session Cache' }} />,
      { auth: signedIn() },
    );

    const cards = await screen.findAllByRole('article');
    expect(cards[0]).toHaveAccessibleName('D2 Cache sessions');
    const postgres = screen.getByRole('article', { name: 'D1 Postgres for orders' });
    expect(postgres).toHaveTextContent('Single primary');
    expect(postgres).toHaveTextContent('DynamoDB: no multi-item transactions');
    expect(postgres).toHaveTextContent('Orders DB');
    expect(postgres).toHaveTextContent('R1 (Scale) 10k orders per minute');
  });

  it('confirms a flagged decision still holds', async () => {
    const patch = vi.fn(() => ({}));
    stub({ [`PATCH ${API}/decisions/D2`]: patch });
    renderWithQuery(<DecisionsPanel slug={SLUG} names={{}} />, { auth: signedIn() });

    fireEvent.click(await screen.findByRole('button', { name: 'Still valid' }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.objectContaining({ json: {} })));
  });
});
