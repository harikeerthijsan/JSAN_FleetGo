import { Card, EmptyState, PageTitle, StatusBadge } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import './ModulePlaceholder.css';

export interface ModulePlaceholderProps {
  title: string;
  description: string;
  /** The phase in which this module is scheduled to be implemented. */
  phaseNote?: string;
}

/**
 * Generic placeholder rendered by every not-yet-implemented module. Keeps the
 * shell, navigation and page chrome consistent while clearly communicating
 * that business functionality is intentionally out of scope for Phase 1.
 */
export function ModulePlaceholder({
  title,
  description,
  phaseNote = 'Business functionality for this module is planned for a later phase.',
}: ModulePlaceholderProps) {
  useDocumentTitle(title);

  return (
    <div>
      <PageTitle
        title={title}
        description={description}
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: title }]}
        actions={<StatusBadge tone="info">Phase 1 · Placeholder</StatusBadge>}
      />
      <Card>
        <EmptyState
          title="Module scaffolded — not yet implemented"
          description={phaseNote}
        />
      </Card>
    </div>
  );
}
