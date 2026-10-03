import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './lib/auth';
import { createQueryClient } from './lib/query-client';
import { supabase } from './lib/supabase';
import { initTheme } from './lib/theme';
import { Root } from './root';
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import './global.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

initTheme();
const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Cached projects and conversations belong to the User who signed out. */}
      <AuthProvider client={supabase.auth} onSignedOut={() => queryClient.clear()}>
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
