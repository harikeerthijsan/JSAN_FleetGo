import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useSidebar } from '@/context/SidebarContext';
import { NAV_ITEMS } from '@/routes/navigation';
import './Header.css';

/** Top navigation bar: sidebar toggles, current section title, user menu. */
export function Header() {
  const { toggleCollapsed, openMobile } = useSidebar();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current;
    const items = () => Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      const buttons = items();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); menuButtonRef.current?.focus(); }
      if (event.key === 'Tab') setMenuOpen(false);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    menu?.addEventListener('keydown', onKey);
    return () => menu?.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const current = NAV_ITEMS.find((item) =>
    location.pathname.startsWith(item.path),
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="fg-header">
      <div className="fg-header__left">
        <button
          className="fg-header__icon-btn fg-header__icon-btn--desktop"
          onClick={toggleCollapsed}
          aria-label="Toggle sidebar"
        >
          <Icon name="menu" size={20} />
        </button>
        <button
          className="fg-header__icon-btn fg-header__icon-btn--mobile"
          onClick={openMobile}
          aria-label="Open navigation"
        >
          <Icon name="menu" size={20} />
        </button>
        <Link className="fg-header__wordmark" to="/dashboard" aria-label="FleetGo home">Fleet<span>Go</span></Link>
        <div className="fg-header__identity"><span>Global Fleet Logistics Control Tower</span><span className="fg-header__section">{current?.label ?? 'FleetGo'}</span></div>
      </div>

      <div className="fg-header__right">
        <div className="fg-header__user-wrap" ref={menuRef}>
          <button
            ref={menuButtonRef}
            className="fg-header__user"
            onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenuOpen(true); } }}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="fg-header__avatar">
              {(user?.fullName ?? 'FleetGo User').split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase()}
            </span>
            <span className="fg-header__user-meta">
              <span className="fg-header__user-name">
                {user?.fullName ?? 'FleetGo User'}
              </span>
              <span className="fg-header__user-role">
                {user?.role.displayName ?? '—'}
              </span>
            </span>
            <Icon name="chevron-down" size={16} />
          </button>

          {menuOpen ? (
            <div className="fg-header__menu" role="menu">
              <div className="fg-header__menu-head">
                <strong>{user?.fullName}</strong>
                <span>{user?.email}</span>
                <span className="fg-header__menu-role">
                  {user?.role.displayName}
                </span>
              </div>
              <button
                role="menuitem"
                className="fg-header__menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/profile');
                }}
              >
                <Icon name="user-circle" size={16} /> My Profile
              </button>
              <button
                role="menuitem"
                className="fg-header__menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/change-password');
                }}
              >
                <Icon name="settings" size={16} /> Change Password
              </button>
              <button
                role="menuitem"
                className="fg-header__menu-item fg-header__menu-item--danger"
                onClick={handleLogout}
              >
                <Icon name="close" size={16} /> Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
