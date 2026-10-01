import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('shows the photo when there is one', () => {
    render(<Avatar name="octocat" src="https://example.test/octocat.png" />);

    expect(screen.getByRole('img', { name: 'octocat' })).toHaveAttribute(
      'src',
      'https://example.test/octocat.png',
    );
  });

  it("falls back to the name's first letter without a photo", () => {
    render(<Avatar name="octocat" />);

    expect(screen.getByRole('img', { name: 'octocat' })).toHaveTextContent('O');
  });

  it("falls back to the name's first letter when the photo fails to load", () => {
    render(<Avatar name="octocat" src="https://example.test/broken.png" />);

    fireEvent.error(screen.getByRole('img', { name: 'octocat' }));

    expect(screen.getByRole('img', { name: 'octocat' })).toHaveTextContent('O');
  });
});
