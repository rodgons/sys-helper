import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './lib/api';
import { Badge, type BadgeTone } from './ui/badge';
import { Cluster, Section, Stack } from './ui/layout';
import { ArrowLink } from './ui/link';
import { Display, Label, Text } from './ui/typography';

type Readiness = { status: string; database: string };

export function App() {
  const ready = useQuery({
    queryKey: ['ready'],
    queryFn: () => apiFetch<Readiness>('/ready'),
  });

  const [tone, badge]: [BadgeTone, string] = ready.isSuccess
    ? ['success', 'Online']
    : ready.isError
      ? ['danger', 'Offline']
      : ['neutral', 'Checking'];

  return (
    <main>
      <Section>
        <Stack gap={6}>
          <Label tone="accent">Status</Label>
          <Display as="h1" size="lg">
            sys-helper
          </Display>
          <Cluster gap={3}>
            <Badge tone={tone}>{badge}</Badge>
            <Text as="span" tone="muted">
              <span role="status">
                {ready.isPending && 'API: checking…'}
                {ready.isError && 'API: unavailable'}
                {ready.isSuccess && `API: ${ready.data.status} · database: ${ready.data.database}`}
              </span>
            </Text>
          </Cluster>
          <ArrowLink href="/ui-kit">Explore the design system</ArrowLink>
        </Stack>
      </Section>
    </main>
  );
}
