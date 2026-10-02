import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { type Me, useMe } from '../lib/me';
import { Button } from '../ui/button';
import { Section, Stack } from '../ui/layout';
import { Display, Text } from '../ui/typography';

/**
 * Renders `children` for a signed-in User the API accepts. Signed-out visitors go to the home page;
 * Users the API refuses (not on the allowlist, no supported identity) get an explanation and a sign-out.
 */
export function RequireUser({ children }: { children: (me: Me) => ReactNode }) {
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
                : code === 'identity_required'
                  ? 'Sign in with GitHub or Google to continue'
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
  return children(me.data);
}
