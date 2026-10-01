import { test as base, type Page } from '@playwright/test';
import postgres from 'postgres';

// Real GitHub OAuth can't run in tests. Instead: sign up a throwaway email user through Supabase
// Auth (local email confirmation is off), link a GitHub identity row directly in the database, and
// hand the session to supabase-js through localStorage. The API still verifies the token and reads
// the identity for real. Make exports these from the root .env.
const supabaseUrl = required('VITE_SUPABASE_URL');
const publishableKey = required('VITE_SUPABASE_PUBLISHABLE_KEY');
const sql = postgres(required('DATABASE_URL'), { max: 1, onnotice: () => {} });

// supabase-js stores the session under `sb-<first label of the Supabase host>-auth-token`.
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

type Fixtures = {
  /** Signs `page` in as a fresh GitHub user and returns their GitHub username. */
  signIn: () => Promise<string>;
};

export const test = base.extend<Fixtures>({
  signIn: async ({ page }, use) => {
    const userIds: string[] = [];
    await use(async () => {
      const username = `e2e-${crypto.randomUUID().slice(0, 8)}`;
      const session = await signUp(`${username}@e2e.test`);
      userIds.push(session.user.id);
      await sql`
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES (${`gh-${username}`}, ${session.user.id},
                ${sql.json({ user_name: username, avatar_url: '' })}, 'github', now(), now())`;
      await injectSession(page, session);
      return username;
    });
    if (userIds.length > 0) await sql`DELETE FROM auth.users WHERE id IN ${sql(userIds)}`;
  },
});

export { expect } from '@playwright/test';

type Session = { access_token: string; user: { id: string } };

async function signUp(email: string): Promise<Session> {
  const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error(`sign up failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Session;
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
