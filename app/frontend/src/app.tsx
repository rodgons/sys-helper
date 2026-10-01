import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@tanstack/preact-query';
import { apiFetch } from './lib/api';

type Readiness = { status: string; database: string };

export function App() {
  const ready = useQuery({
    queryKey: ['ready'],
    queryFn: () => apiFetch<Readiness>('/ready'),
  });

  return (
    <main {...stylex.props(styles.main)}>
      <h1>sys-helper</h1>
      <p role="status">
        {ready.isPending && 'API: checking…'}
        {ready.isError && 'API: unavailable'}
        {ready.isSuccess && `API: ${ready.data.status} · database: ${ready.data.database}`}
      </p>
    </main>
  );
}

const styles = stylex.create({
  main: {
    fontFamily: 'system-ui, sans-serif',
    marginInline: 'auto',
    maxWidth: 720,
    padding: 24,
  },
});
