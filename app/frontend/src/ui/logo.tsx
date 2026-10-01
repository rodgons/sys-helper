import * as stylex from '@stylexjs/stylex';
import { useId } from 'react';
import { color } from '../design/tokens.stylex';

/**
 * The sys-helper mark: a speech bubble holding an architecture diagram, with the AI's robot head
 * on its corner. Decorative (`aria-hidden`), so pair it with visible text or a label. The brand
 * purples are fixed, like any logo; only the ring that separates the head from the bubble follows
 * the canvas. `public/favicon.svg` draws the same shapes on a dark tile.
 */
export function Logo({ size = 24 }: { size?: number }) {
  // Several logos can share a page, so each needs its own gradient ids.
  const id = useId().replace(/[^\w-]/g, '');
  const bubble = `${id}-bubble`;
  const head = `${id}-head`;

  return (
    <svg
      aria-hidden="true"
      viewBox="1.5 1 61.2 61.2"
      width={size}
      height={size}
      {...stylex.props(styles.logo)}
    >
      <defs>
        <linearGradient id={bubble} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c58cff" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={head} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c58cff" />
          <stop offset="1" stopColor="#8b4cf6" />
        </linearGradient>
      </defs>
      <path
        d="M31.5 16.2H15A11 11 0 0 0 3.95 27.2V44Q3.95 49 7.5 52V58.5L19 54.2H40A10.8 10.8 0 0 0 50.8 43.4V32"
        fill="none"
        stroke={`url(#${bubble})`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="19.5" y="25.5" width="14" height="7.5" rx="1.6" fill="#dcb8ff" />
      <path
        d="M26.5 33V40.5M15.3 40.5V39.5A2 2 0 0 1 17.3 37.5H36.1A2 2 0 0 1 38.1 39.5V40.5"
        fill="none"
        stroke="#b98aff"
        strokeWidth="1.6"
      />
      <g fill="#b98aff">
        <rect x="10.8" y="40.5" width="9" height="6.5" rx="1.4" />
        <rect x="22.2" y="40.5" width="9" height="6.5" rx="1.4" />
        <rect x="33.6" y="40.5" width="9" height="6.5" rx="1.4" />
      </g>
      <path d="M47.6 4V10" stroke="#a873ff" strokeWidth="1.8" />
      <circle cx="47.6" cy="3.6" r="2.4" fill="#d6a8ff" />
      <rect x="32.8" y="14.5" width="6" height="11.5" rx="2.4" fill="#a066fb" />
      <rect x="56.4" y="14.5" width="6" height="11.5" rx="2.4" fill="#a066fb" />
      <rect
        x="35.5"
        y="9.2"
        width="24.4"
        height="21.3"
        rx="9.5"
        fill={`url(#${head})`}
        strokeWidth="1.6"
        {...stylex.props(styles.ring)}
      />
      <rect x="38.2" y="14" width="19" height="12.6" rx="6.3" fill="#1a0b3d" />
      <g fill="none" stroke="#f3e8ff" strokeWidth="1.2" strokeLinecap="round">
        <path d="M40.8 21.4A2 2 0 0 1 44.8 21.4" />
        <path d="M50.6 21.4A2 2 0 0 1 54.6 21.4" />
      </g>
    </svg>
  );
}

const styles = stylex.create({
  logo: {
    flexShrink: 0,
    display: 'block',
  },
  ring: {
    stroke: color['--color-canvas'],
  },
});
