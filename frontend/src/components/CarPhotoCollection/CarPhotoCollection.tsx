import heritage from '@/assets/cars/heritage-drive.jpg';
import mountain from '@/assets/cars/mountain-drive.jpg';
import woodland from '@/assets/cars/woodland-drive.jpg';
import city from '@/assets/cars/city-drive.jpg';
import './CarPhotoCollection.css';

const photographs = [
  { src: mountain, title: 'Open roads', description: 'Fleet car on a mountain road', position: '50% 64%' },
  { src: heritage, title: 'New perspectives', description: 'Fleet car outside a historic building', position: '50% 65%' },
  { src: woodland, title: 'The scenic route', description: 'Fleet car on a tree-lined road', position: '50% 66%' },
  { src: city, title: 'Beyond the everyday', description: 'Fleet car in a town square', position: '50% 70%' },
];

/** Brand photography only, deliberately separate from operational vehicle records. */
export function CarPhotoCollection() {
  return (
    <section className="fg-car-collection" aria-label="FleetGo photo collection">
      <header className="fg-car-collection__header">
        <div><p className="fg-car-collection__eyebrow">THE FLEETGO COLLECTION</p><h2>Driven by the journey.</h2></div>
        <p>Car photography from the road.</p>
      </header>
      <div className="fg-car-collection__grid">
        {photographs.map((photo) => <figure key={photo.src} className="fg-car-collection__photo">
          <img src={photo.src} alt={photo.description} style={{ objectPosition: photo.position }} loading="lazy" decoding="async" width={640} height={440} />
          <figcaption><span>ON THE ROAD</span><strong>{photo.title}</strong></figcaption>
        </figure>)}
      </div>
    </section>
  );
}
