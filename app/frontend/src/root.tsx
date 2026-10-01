import { Route, Routes, useLocation } from 'react-router';
import { useAuth } from './lib/auth';
import { HomePage } from './pages/home';
import { ProjectsPage } from './pages/projects';
import { UiKitPage } from './pages/ui-kit';
import { Button } from './ui/button';
import { SiteHeader } from './ui/site-header';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/ui-kit', label: 'UI kit' },
];

/** App shell: site header plus the page for the current route. Unknown paths fall back to the home page. */
export function Root() {
  const { pathname } = useLocation();
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <>
      <SiteHeader links={NAV_LINKS} currentPath={normalized} actions={<AuthAction />} />
      <Routes>
        <Route path="/ui-kit" element={<UiKitPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </>
  );
}

function AuthAction() {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  return auth.status === 'signedIn' ? (
    <Button size="sm" variant="ghost" onClick={auth.signOut}>
      Sign out
    </Button>
  ) : (
    <Button size="sm" variant="secondary" onClick={auth.signIn}>
      Sign in
    </Button>
  );
}
