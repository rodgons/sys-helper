import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from './site-header';

const links = [
  { href: '/', label: 'Home' },
  { href: '/ui-kit', label: 'UI kit' },
];

describe('SiteHeader', () => {
  it('marks the current page link', () => {
    render(
      <MemoryRouter>
        <SiteHeader links={links} currentPath="/ui-kit" />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('UI kit');
  });

  it('toggles the mobile menu', () => {
    render(
      <MemoryRouter>
        <SiteHeader links={links} currentPath="/" />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument();
  });

  it('leaves out the nav and the menu button when there are no links', () => {
    render(
      <MemoryRouter>
        <SiteHeader links={[]} currentPath="/" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });
});
