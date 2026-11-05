import type { ReactNode } from 'react';
import { Icon } from '@/components';
import lakesideDrive from '@/assets/cars/lakeside-drive.jpg';
import './AuthShell.css';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="fg-auth fg-auth--fullscreen">
      <section className="fg-auth__panel" aria-label={title}>
        <div className="fg-auth__panel-backdrop" aria-hidden="true">
          <img src={lakesideDrive} alt="" decoding="async" />
        </div>
        <div className="fg-auth__panel-top">
          <a className="fg-auth__brand" href="/login" aria-label="FleetGo sign in">
            <span className="fg-auth__logo"><Icon name="fleet" size={25} /></span>
            <span className="fg-auth__brand-text">Fleet<span>Go</span></span>
          </a>
          <span className="fg-auth__secure">&#9671; Secure access</span>
        </div>
        <div className="fg-auth__form-area">
          <div className="fg-auth__card">
            <div className="fg-auth__welcome">LET’S GET YOU MOVING</div>
            <h1 className="fg-auth__title">{title}</h1>
            {subtitle ? <p className="fg-auth__subtitle">{subtitle}</p> : null}
            {children}
            {footer ? <div className="fg-auth__footer">{footer}</div> : null}
          </div>
          <p className="fg-auth__access-note">Access is managed by your organization.<br />Need an account? Contact your administrator.</p>
        </div>
        <p className="fg-auth__legal">FleetGo &copy; {new Date().getFullYear()}<span>Enterprise Fleet Logistics</span></p>
      </section>
    </main>
  );
}
