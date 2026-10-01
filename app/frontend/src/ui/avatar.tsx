import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { color, font, radius, text } from '../design/tokens.stylex';

/** Round profile photo. Without one, or if it fails to load, shows the name's first letter. */
export function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const [failed, setFailed] = useState<string>();
  const dims = { width: size, height: size };

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(src)}
        {...dims}
        {...stylex.props(styles.base)}
      />
    );
  }
  return (
    <span role="img" aria-label={name} {...stylex.props(styles.base, styles.letter, sized(size))}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const styles = stylex.create({
  base: {
    display: 'inline-block',
    flexShrink: 0,
    borderRadius: radius['--radius-full'],
    objectFit: 'cover',
    backgroundColor: color['--color-subtle'],
  },
  letter: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color['--color-accent-soft'],
    color: color['--color-accent-strong'],
    fontFamily: font['--font-display'],
    fontSize: text['--text-sm'],
    fontWeight: 700,
    lineHeight: 1,
    userSelect: 'none',
  },
});

const sized = stylex.create({
  sized: (size: number) => ({ width: size, height: size }),
}).sized;
