import type { ReactNode } from 'react';
import { Icon } from '@/components';
import { useHealth } from '@/hooks/useHealth';
import sunsetDrive from '@/assets/cars/sunset-drive.jpg';
import './AuthShell.css';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

function JsanBrand() {
  return <span className="fg-auth__jsan" aria-label="JSAN">
    <svg viewBox="0 0 56 56" fill="currentColor" aria-hidden="true"><path d="M3 3h50v12H15v38H3zM33 27h20v26H27V41h14V27z" /></svg>
    <span>JSAN</span>
  </span>;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const { data, loading, error } = useHealth();
  const online = !loading && !error && data?.status === 'ok';
  const status = loading ? 'Checking server' : online ? 'Server online' : error ? 'Server unavailable' : 'Limited service';
  return (
    <main className="fg-auth fg-auth--jsan">
      <div className="fg-auth__scenery" aria-hidden="true"><img src={sunsetDrive} alt="" fetchPriority="high" /></div>
      <div className="fg-auth__ribbon fg-auth__ribbon--top" aria-hidden="true" />
      <div className="fg-auth__ribbon fg-auth__ribbon--bottom" aria-hidden="true" />
      <section className="fg-auth__intro" aria-label="About FleetGo">
        <a className="fg-auth__company" href="/login" aria-label="FleetGo sign in"><JsanBrand /></a>
        <p className="fg-auth__tagline">PEOPLE | TECHNOLOGY | PLACES</p>
        <div className="fg-auth__identity">
          <span className="fg-auth__car-icon"><Icon name="fleet" size={76} /></span>
          <div><div className="fg-auth__wordmark">Fleet<span>Go</span></div><p>Global Fleet Logistics Control Tower</p></div>
        </div>
        <p className="fg-auth__promise">Every vehicle. Every movement. One clear view.</p>
        <div className="fg-auth__accent" />
        <ul className="fg-auth__capabilities">
          <li><Icon name="fleet" size={30} /><span>Vehicle<br />Inventory</span></li>
          <li><Icon name="inspections" size={30} /><span>Requests &amp;<br />Approvals</span></li>
          <li><Icon name="dispatch" size={30} /><span>Dispatch &amp;<br />Tracking</span></li>
          <li><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></svg><span>Handover &amp;<br />Claims</span></li>
        </ul>
      </section>
      <section className="fg-auth__card" aria-label={title}>
        <div className="fg-auth__card-top"><JsanBrand /><span className={`fg-auth__status${online ? ' is-online' : ''}`} role="status"><span />{status}</span></div>
        <h1 className="fg-auth__title">{title === 'Sign in to FleetGo' ? <>Sign in to <span>FleetGo</span></> : title}</h1>
        {subtitle ? <p className="fg-auth__subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="fg-auth__footer">{footer}</div> : null}
        <div className="fg-auth__support"><span aria-hidden="true">i</span><p>Need help? <strong>Contact your IT administrator</strong></p></div>
      </section>
    </main>
  );
}
