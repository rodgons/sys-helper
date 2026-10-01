import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeterList } from './meter';

describe('MeterList', () => {
  it('sizes each bar relative to the largest value', () => {
    const { container } = render(
      <MeterList
        label="Requests per second"
        unit="req/s"
        items={[
          { label: 'Ours', value: 200, highlight: true },
          { label: 'Other', value: 50 },
        ]}
      />,
    );

    expect(screen.getByText('200 req/s')).toBeInTheDocument();
    expect(screen.getByText('50 req/s')).toBeInTheDocument();
    const bars = [...container.querySelectorAll('[aria-hidden="true"] > div')];
    expect(bars.map((bar) => bar.getAttribute('style'))).toEqual([
      expect.stringContaining('100%'),
      expect.stringContaining('25%'),
    ]);
  });
});
