import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from './button';

describe('Button', () => {
  it('is a type="button" by default so it never submits a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('gives each variant its own styling', () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="outline">B</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'A' }).className).not.toBe(
      screen.getByRole('button', { name: 'B' }).className,
    );
  });
});

describe('ButtonLink', () => {
  it('renders a link styled as a button', () => {
    render(<ButtonLink href="/docs">Read the docs</ButtonLink>);

    expect(screen.getByRole('link', { name: 'Read the docs' })).toHaveAttribute('href', '/docs');
  });
});
