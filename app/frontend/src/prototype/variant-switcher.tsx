// PROTOTYPE: throwaway. Floating bar that cycles `?variant=` on the current route. Dev builds only.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

export function useVariant(keys: string[]) {
  const [params] = useSearchParams();
  const first = keys[0] ?? '';
  const v = params.get('variant') ?? first;
  return keys.includes(v) ? v : first;
}

export function VariantSwitcher({ variants }: { variants: [key: string, name: string][] }) {
  const [params, setParams] = useSearchParams();
  const keys = variants.map(([k]) => k);
  const current = useVariant(keys);
  const i = keys.indexOf(current);
  const go = (step: number) => {
    const next = new URLSearchParams(params);
    next.set('variant', keys[(i + step + keys.length) % keys.length] ?? current);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  const btn: React.CSSProperties = {
    all: 'unset',
    cursor: 'pointer',
    padding: '0 10px',
    fontSize: 18,
    lineHeight: '32px',
  };
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 150,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        background: '#111',
        color: '#fff',
        borderRadius: 999,
        boxShadow: '0 4px 16px rgba(0,0,0,.35)',
        font: '12px ui-monospace, monospace',
        border: '2px dashed #f5b43c',
      }}
    >
      <button type="button" style={btn} onClick={() => go(-1)} aria-label="Previous variant">
        ‹
      </button>
      <span>
        {current} ({variants[i]?.[1]})
      </span>
      <button type="button" style={btn} onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
