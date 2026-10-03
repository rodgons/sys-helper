import { LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { SettingsDialog } from './account/settings-dialog';
import { useAuth } from './lib/auth';
import { useMe } from './lib/me';
import { setThemeChoice, useThemeChoice } from './lib/theme';
import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import { ProjectsPage } from './pages/projects';
import { UiKitPage } from './pages/ui-kit';
import { WorkspacePage } from './pages/workspace';
import { useSiteHeaderMode } from './pages/workspace-mobile.prototype';
import { Avatar } from './ui/avatar';
import { ButtonRouteLink } from './ui/button';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from './ui/menu';
import { SiteHeader } from './ui/site-header';
import { ThemeMenu } from './ui/theme-menu';
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
  const theme = useThemeChoice();
  const headerMode = useSiteHeaderMode(normalized); // PROTOTYPE (mobile header and drawer)

  return (
    <>
      {headerMode !== 'hidden' && (
        <SiteHeader
          links={links}
          currentPath={normalized}
          tools={
            <>
              <ThemeMenu choice={theme} onChange={setThemeChoice} />
              {headerMode === 'withAvatar' && <AuthAction />}
            </>
          }
          actions={normalized === '/login' || headerMode === 'withAvatar' ? null : <AuthAction />}
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
    <AccountMenu onSignOut={auth.signOut} />
  ) : (
    <ButtonRouteLink to="/login" size="sm" variant="secondary">
      Sign in
    </ButtonRouteLink>
  );
}

/** The User's avatar, opening a menu of account actions. */
export function AccountMenu({ onSignOut }: { onSignOut?: () => void }) {
  const auth = useAuth(); // PROTOTYPE: the compact workspace bars render it without onSignOut
  const signOut = onSignOut ?? (auth.status === 'signedIn' ? auth.signOut : () => {});
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
        <MenuItem icon={LogOut} onSelect={signOut}>
          Sign out
        </MenuItem>
      </Menu>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
