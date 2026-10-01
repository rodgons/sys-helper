import { Route, Routes, useLocation } from 'react-router';
import { useAuth } from './lib/auth';
import { useMe } from './lib/me';
import { HomePage } from './pages/home';
import { ProjectsPage } from './pages/projects';
import { UiKitPage } from './pages/ui-kit';
import { WorkspacePage } from './pages/workspace';
import { Avatar } from './ui/avatar';
import { Button } from './ui/button';
import { Menu, MenuItem } from './ui/menu';
import { SiteHeader } from './ui/site-header';
import { Toaster } from './ui/toaster';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/ui-kit', label: 'UI kit' },
];

/** App shell: site header, the page for the current route and the toasts. Unknown paths fall back to the home page. */
export function Root() {
  const { pathname } = useLocation();
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <>
      <SiteHeader links={NAV_LINKS} currentPath={normalized} actions={<AuthAction />} />
      <Routes>
        <Route path="/ui-kit" element={<UiKitPage />} />
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
    <AccountMenu onSignOut={auth.signOut} />
  ) : (
    <Button size="sm" variant="secondary" onClick={auth.signIn}>
      Sign in
    </Button>
  );
}

/** The User's GitHub avatar, opening a menu of account actions. */
function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const me = useMe();
  return (
    <Menu
      label="Account"
      trigger={<Avatar name={me.data?.username ?? ''} src={me.data?.avatarUrl} />}
    >
      <MenuItem onSelect={onSignOut}>Sign out</MenuItem>
    </Menu>
  );
}
