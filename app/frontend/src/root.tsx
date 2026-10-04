import { matchPath, Route, Routes, useLocation } from 'react-router';
import { AccountMenu } from './account/account-menu';
import { useAuth } from './lib/auth';
import { useCompact } from './lib/compact';
import { setThemeChoice, useThemeChoice } from './lib/theme';
import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import { ProjectsPage } from './pages/projects';
import { UiKitPage } from './pages/ui-kit';
import { WorkspacePage } from './pages/workspace';
import { ButtonRouteLink } from './ui/button';
import { SiteHeader } from './ui/site-header';
import { ThemeMenu } from './ui/theme-menu';
import { Toaster } from './ui/toaster';

// The UI kit (`/ui-kit`) is a reference for developers, so it is reachable only by URL.
const VISITOR_LINKS = [{ href: '/', label: 'Home' }];

/**
 * App shell: site header, the page for the current route and the toasts. Unknown paths fall back to
 * the home page. The compact workspace has its own bar, so there the site header goes.
 */
export function Root() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Signed-in Users work from their projects; the home page is for visitors.
  const links = auth.status === 'signedIn' ? [] : VISITOR_LINKS;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const theme = useThemeChoice();
  const compact = useCompact();
  const ownHeader = compact && matchPath('/p/:slug', normalized) !== null;

  return (
    <>
      {ownHeader ? null : (
        <SiteHeader
          links={links}
          currentPath={normalized}
          tools={<ThemeMenu choice={theme} onChange={setThemeChoice} />}
          actions={normalized === '/login' ? null : <AuthAction />}
        />
      )}
      <Routes>
        <Route path="/ui-kit" element={<UiKitPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/p/:slug" element={<WorkspacePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <Toaster />
    </>
  );
}

function AuthAction() {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  return auth.status === 'signedIn' ? (
    <AccountMenu />
  ) : (
    <ButtonRouteLink to="/login" size="sm" variant="secondary">
      Sign in
    </ButtonRouteLink>
  );
}
