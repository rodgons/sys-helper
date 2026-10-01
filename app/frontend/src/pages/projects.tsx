import { Navigate } from 'react-router';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { Button } from '../ui/button';
import { Section, Stack } from '../ui/layout';
import { Display, Label, Text } from '../ui/typography';

/** Signed-in landing page. For now it only shows the empty state; Projects arrive in slice 3. */
export function ProjectsPage() {
  const auth = useAuth();
  const me = useMe();

  if (auth.status === 'loading') return null;
  if (auth.status === 'signedOut') return <Navigate to="/" replace />;

  if (me.isError) {
    const code = me.error instanceof ApiError ? me.error.code : undefined;
    return (
      <main>
        <Section>
          <Stack gap={4}>
            <Display as="h1" size="sm">
              {code === 'not_allowed'
                ? "You're not on the beta list yet"
                : code === 'github_required'
                  ? 'Sign in with GitHub to continue'
                  : "We couldn't load your account"}
            </Display>
            <Text tone="muted">
              {code === 'not_allowed'
                ? 'sys-helper is in a private beta. Ask for access with your GitHub username.'
                : 'Sign out and try again.'}
            </Text>
            <div>
              <Button variant="outline" onClick={auth.signOut}>
                Sign out
              </Button>
            </div>
          </Stack>
        </Section>
      </main>
    );
  }

  if (!me.isSuccess) return null;

  return (
    <main>
      <Section>
        <Stack gap={4}>
          <Label tone="accent">Signed in as {me.data.username}</Label>
          <Display as="h1" size="sm">
            No projects yet
          </Display>
          <Text tone="muted">
            A project is where you and the AI design an architecture together.
          </Text>
        </Stack>
      </Section>
    </main>
  );
}
