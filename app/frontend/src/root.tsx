import { LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { SettingsDialog } from './account/settings-dialog';
import { useAuth } from './lib/auth';
import { useMe } from './lib/me';
import { HomePage } from './pages/home';
import { ProjectsPage } from './pages/projects';
import { UiKitPage } from './pages/ui-kit';
import { WorkspacePage } from './pages/workspace';
import { Avatar } from './ui/avatar';
import { Button } from './ui/button';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from './ui/menu';
import { SiteHeader } from './ui/site-header';
import { Toaster } from './ui/toaster';
import { Text } from './ui/typography';

// The UI kit (`/ui-kit`) is a reference for developers, so it is reachable only by URL.
const VISITOR_LINKS = [{ href: '/', label: 'Home' }];

/** App shell: site header, the page for the current route and the toasts. Unknown paths fall back to the home page. */
export function Root() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Signed-in Users work from their projects; the home page is for visitors.
  const links = auth.status === 'signedIn' ? [] : VISITOR_LINKS;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return (
    <>
      <SiteHeader links={links} currentPath={normalized} actions={<AuthAction />} />
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

/** The User's avatar, opening a menu of account actions. */
function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const me = useMe();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <Menu
        label="Account"
        trigger={<Avatar name={me.data?.displayName ?? ''} src={me.data?.avatarUrl} />}
      >
        {me.data && (
          <>
            <MenuHeader>
              <Text size="sm" tone="muted">
                Signed in as
              </Text>
              {me.data.displayName}
            </MenuHeader>
            <MenuSeparator />
          </>
        )}
        <MenuItem icon={Settings} onSelect={() => setSettingsOpen(true)}>
          Settings
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={LogOut} onSelect={onSignOut}>
          Sign out
        </MenuItem>
      </Menu>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
