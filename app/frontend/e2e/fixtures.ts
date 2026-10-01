import { test as base, type Page } from '@playwright/test';
import postgres from 'postgres';

// Real GitHub OAuth can't run in tests, and email sign-up is off (the product is GitHub-only).
// Instead: create a throwaway user with the Auth admin API, sign it in through an admin-generated
// magic link, link a GitHub identity row directly in the database, and hand the session to
// supabase-js through localStorage. The API still verifies the token and reads the identity for
// real. Make exports these from the root .env.
const supabaseUrl = required('VITE_SUPABASE_URL');
const publishableKey = required('VITE_SUPABASE_PUBLISHABLE_KEY');
const secretKey = required('SUPABASE_SECRET_KEY');
const sql = postgres(required('DATABASE_URL'), { max: 1, onnotice: () => {} });

// supabase-js stores the session under `sb-<first label of the Supabase host>-auth-token`.
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

type Fixtures = {
  /** Signs `target` (default: the test's page) in as a fresh GitHub user and returns their username. */
  signIn: (target?: Page) => Promise<string>;
};

export const test = base.extend<Fixtures>({
  signIn: async ({ page }, use) => {
    const userIds: string[] = [];
    await use(async (target = page) => {
      const username = `e2e-${crypto.randomUUID().slice(0, 8)}`;
      const session = await createSession(`${username}@e2e.test`);
      userIds.push(session.user.id);
      await sql`
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES (${`gh-${username}`}, ${session.user.id},
                ${sql.json({ user_name: username, avatar_url: '' })}, 'github', now(), now())`;
      await injectSession(target, session);
      return username;
    });
    if (userIds.length > 0) await sql`DELETE FROM auth.users WHERE id IN ${sql(userIds)}`;
  },
});

export { expect } from '@playwright/test';

type Session = { access_token: string; user: { id: string } };

/** Creates a confirmed user with the admin API and signs it in via a magic link it generates. */
async function createSession(email: string): Promise<Session> {
  const admin = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  await post('/auth/v1/admin/users', admin, { email, email_confirm: true });
  const link = await post<{ hashed_token: string }>('/auth/v1/admin/generate_link', admin, {
    type: 'magiclink',
    email,
  });
  return post<Session>(
    '/auth/v1/verify',
    { apikey: publishableKey },
    {
      type: 'magiclink',
      token_hash: link.hashed_token,
    },
  );
}

async function post<T>(path: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const res = await fetch(`${supabaseUrl}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function injectSession(page: Page, session: Session) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    storageKey,
    JSON.stringify(session),
  ] as const);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests (run them through make)`);
  return value;
}
