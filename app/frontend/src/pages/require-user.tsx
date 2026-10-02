import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { type Identity, type Me, refusedIdentities, useMe } from '../lib/me';
import { Button } from '../ui/button';
import { CopyValue } from '../ui/copy-value';
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
            {code === 'not_allowed' ? (
              <AskForAccess identities={refusedIdentities(me.error)} />
            ) : (
              <Text tone="muted">Sign out and try again.</Text>
            )}
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

/**
 * Tells a User off the allowlist what to send: their GitHub username, or their Google id (the
 * allowlist holds immutable ids, and nobody knows their Google id offhand). A linked User sees both.
 */
function AskForAccess({ identities }: { identities: Identity[] }) {
  const github = identities.find((i) => i.provider === 'github');
  const google = identities.find((i) => i.provider === 'google');
  return (
    <Stack gap={3}>
      <Text tone="muted">
        sys-helper is in a private beta.{' '}
        {github && google
          ? 'Ask for access with your GitHub username or your Google id.'
          : github
            ? 'Ask for access with your GitHub username.'
            : google
              ? 'Ask for access with your Google id.'
              : 'Ask for access.'}
      </Text>
      {github && <CopyValue label="GitHub username" value={github.name} />}
      {google && <CopyValue label="Google id" value={google.id} />}
    </Stack>
  );
}
