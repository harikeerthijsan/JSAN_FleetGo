import { useLocation } from 'react-router-dom';
import sunset from '@/assets/cars/sunset-drive.jpg';
import highland from '@/assets/cars/highland-drive.jpg';
import coast from '@/assets/cars/coastal-drive.jpg';
import garden from '@/assets/cars/garden-drive.jpg';
import lakeside from '@/assets/cars/lakeside-drive.jpg';
import country from '@/assets/cars/country-drive.jpg';
import './AutomotiveBanner.css';

// Editorial photography only. Never used as vehicle records or inspection evidence.
const scenes: Record<string, { image: string; title: string; caption: string }> = {
  fleet: { image: highland, title: 'A better perspective on every car.', caption: 'Fleet management' },
  inventory: { image: garden, title: 'Every car, in the right place.', caption: 'Inventory management' },
  tickets: { image: coast, title: 'The next journey starts here.', caption: 'Requests and approvals' },
  allocations: { image: highland, title: 'The right car for the road ahead.', caption: 'Vehicle allocation' },
  dispatch: { image: country, title: 'Ready for the road ahead.', caption: 'Dispatch and trips' },
  tracking: { image: coast, title: 'A clearer view of the journey.', caption: 'Live tracking' },
  inspections: { image: lakeside, title: 'Confidence in every handover.', caption: 'Inspections and handover' },
  vendors: { image: garden, title: 'Great journeys take great partners.', caption: 'Vendor management' },
  reports: { image: coast, title: 'See the bigger picture.', caption: 'Reports and insights' },
};

export function AutomotiveBanner() {
  const { pathname } = useLocation();
  const section = pathname.split('/')[1];
  const dashboard = section === 'dashboard';
  const scene = scenes[section] ?? { image: sunset, title: 'Built around the journey.', caption: 'Your automotive workspace' };

  return (
    <section className={`fg-auto-banner${dashboard ? ' fg-auto-banner--dashboard' : ''}`} aria-label="FleetGo automotive collection">
      <div className="fg-auto-banner__visual" aria-hidden="true">
        <img src={dashboard ? sunset : scene.image} alt="" decoding="async" />
      </div>
      <div className="fg-auto-banner__copy">
        <p className="fg-auto-banner__eyebrow"><span /> FLEETGO / ON THE ROAD</p>
        <h2>{dashboard ? <>Every car.<br /><em>Every journey.</em></> : scene.title}</h2>
        <p className="fg-auto-banner__description">{dashboard ? 'Your cars, your people, your operations. One connected workspace.' : scene.caption}</p>
      </div>
      <div className="fg-auto-banner__road" aria-hidden="true">
        <span className="fg-auto-banner__car"><svg viewBox="0 0 72 30" fill="none"><path d="m7 18 5-9 12-2 12-5h15l10 11 7 3v8H5v-6h2Z" fill="currentColor"/><path d="m29 7-6 7h29l-6-7H29Z" fill="#142b30"/><circle cx="19" cy="24" r="5" fill="#142b30" stroke="currentColor" strokeWidth="2"/><circle cx="55" cy="24" r="5" fill="#142b30" stroke="currentColor" strokeWidth="2"/></svg></span>
      </div>
      <span className="fg-auto-banner__credit">Fleet photography</span>
      {dashboard ? <div className="fg-auto-banner__collection" aria-hidden="true">
        <img src={highland} alt="" loading="lazy" decoding="async" />
        <img src={coast} alt="" loading="lazy" decoding="async" />
        <span>A WORLD IN MOTION</span>
      </div> : null}
    </section>
  );
}
