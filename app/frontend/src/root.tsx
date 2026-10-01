import { Route, Routes, useLocation } from 'react-router';
import { App } from './app';
import { UiKitPage } from './pages/ui-kit';
import { ButtonLink } from './ui/button';
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
      <SiteHeader
        links={NAV_LINKS}
        currentPath={normalized}
        actions={
          <ButtonLink href="/ui-kit" size="sm" variant="secondary">
            Components
          </ButtonLink>
        }
      />
      <Routes>
        <Route path="/ui-kit" element={<UiKitPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </>
  );
}
