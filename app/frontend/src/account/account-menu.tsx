import { LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { Avatar } from '../ui/avatar';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '../ui/menu';
import { Text } from '../ui/typography';
import { SettingsDialog } from './settings-dialog';

/** The signed-in User's avatar, opening a menu of account actions: Settings and Sign out. */
export function AccountMenu() {
  const auth = useAuth();
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
        <MenuItem icon={LogOut} onSelect={auth.signOut}>
          Sign out
        </MenuItem>
      </Menu>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
