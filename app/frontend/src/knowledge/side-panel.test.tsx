import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { type PanelTab, PanelTabs, SidePanel } from './side-panel';

const SLUG = 'shop-k3xa9q2m7p';
const knowledge = {
  experienceLevel: '',
  requirements: [{ id: 'R1', category: 'scale', statement: '10k orders per minute' }],
  decisions: [],
};

function stubApi() {
  vi.stubGlobal('fetch', vi.fn(mockApi({ [`GET /api/projects/${SLUG}/knowledge`]: knowledge })));
}

/** A parent drawing its own tab row, as the compact bottom sheet does. */
function OwnTabs({ open = true }: { open?: boolean }) {
  const [tab, setTab] = useState<PanelTab>('conversation');
  return (
    <>
      <PanelTabs slug={SLUG} tab={tab} onSelect={setTab} pending />
      <SidePanel
        slug={SLUG}
        names={{}}
        conversation={<input aria-label="Message" />}
        open={open}
        tab={tab}
        bare
      />
    </>
  );
}

describe('SidePanel', () => {
  it('can be driven by a tab row its parent draws, keeping every tab mounted', async () => {
    stubApi();
    renderWithQuery(<OwnTabs />, { auth: signedIn() });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Half-typed' } });

    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /chat/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Proposal to review' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: /Requirements 1/ }));

    expect(await screen.findByText('10k orders per minute')).toBeVisible();
    expect(screen.getByLabelText('Message')).not.toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation Proposal to review' }));
    expect(screen.getByLabelText('Message')).toHaveValue('Half-typed');
  });

  it('keeps its own tab row and collapse toggle when uncontrolled', () => {
    stubApi();
    renderWithQuery(
      <SidePanel slug={SLUG} names={{}} conversation={null} open onToggle={() => {}} />,
      { auth: signedIn() },
    );

    expect(screen.getByRole('tab', { name: 'Conversation', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide chat' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Decisions/ }));
    expect(screen.getByRole('tab', { name: /Decisions/, selected: true })).toBeInTheDocument();
  });
});
