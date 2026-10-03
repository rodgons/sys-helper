import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  // PKCE returns a one-time code in the query string, which supabase-js exchanges for the session.
  // The default implicit flow would put the access and refresh tokens in the URL fragment, where
  // history, extensions and screenshots can capture them.
  { auth: { flowType: 'pkce' } },
);
