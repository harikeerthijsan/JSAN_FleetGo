import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';
import { AppConfigProvider } from '@/context/AppConfigContext';
import { Header } from '../Header/Header';
import { Sidebar } from '../Sidebar/Sidebar';
import { AutomotiveBanner } from '@/components/AutomotiveBanner/AutomotiveBanner';
import './AppLayout.css';
import '@/styles/automotive.css';

/** Inner shell â€” reads collapse state to offset the main content area. */
function Shell() {
  const { collapsed } = useSidebar();
  const { pathname } = useLocation();
  return (
    <div
      className={`fg-shell ${collapsed ? 'fg-shell--collapsed' : ''} fg-shell--premium`}
    >
      <Sidebar />
      <div className="fg-shell__main">
        <Header />
        <main key={pathname} className="fg-shell__content">
          <AutomotiveBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Application layout: sidebar + header + routed content area. Wraps the shell
 * in the SidebarProvider so collapse/mobile state is shared.
 */
export function AppLayout() {
  return (
    <AppConfigProvider>
      <SidebarProvider>
        <Shell />
      </SidebarProvider>
    </AppConfigProvider>
  );
}
