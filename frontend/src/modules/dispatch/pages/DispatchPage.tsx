import { ModulePlaceholder } from '@/pages/ModulePlaceholder/ModulePlaceholder';
import { NAV_ITEMS } from '@/routes/navigation';

const nav = NAV_ITEMS.find((item) => item.path === '/dispatch')!;

export function DispatchPage() {
  return (
    <ModulePlaceholder
      title={nav.label}
      description={nav.description}
      phaseNote="Dispatch and trip management will be implemented in a later phase."
    />
  );
}
