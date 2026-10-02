import * as stylex from '@stylexjs/stylex';
import { Navigate } from 'react-router';
import { color, radius, space } from '../design/tokens.stylex';
import { useAuth } from '../lib/auth';
import { Button } from '../ui/button';
import { Section, Stack } from '../ui/layout';
import { Logo } from '../ui/logo';
import { Display, Text } from '../ui/typography';

/** Sign-in page: GitHub and Google with equal weight. Signed-in Users go straight to their projects. */
export function LoginPage() {
  const auth = useAuth();
  if (auth.status === 'signedIn') return <Navigate to="/projects" replace />;
  const loading = auth.status === 'loading';

  return (
    <main>
      <Section>
        <div {...stylex.props(styles.panel)}>
          <Stack gap={6}>
            <Logo size={56} />
            <Stack gap={3}>
              <Display as="h1" size="sm">
                Sign in to sys-helper
              </Display>
              <Text tone="muted">
                Use your GitHub or Google account. sys-helper is in a private beta, so you may need
                to ask for access after signing in.
              </Text>
            </Stack>
            <Stack gap={3}>
              <Button
                size="lg"
                variant="outline"
                onClick={() => auth.signIn('github')}
                disabled={loading}
                xstyle={styles.full}
              >
                Continue with GitHub
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => auth.signIn('google')}
                disabled={loading}
                xstyle={styles.full}
              >
                Continue with Google
              </Button>
            </Stack>
            <Text size="sm" tone="muted">
              Signing in with both under the same verified email keeps one account and the same
              projects.
            </Text>
          </Stack>
        </div>
      </Section>
    </main>
  );
}

const styles = stylex.create({
  panel: {
    maxWidth: '28rem',
    marginInline: 'auto',
    padding: space['--space-8'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-lg'],
    backgroundColor: color['--color-surface'],
  },
  full: { width: '100%' },
});
