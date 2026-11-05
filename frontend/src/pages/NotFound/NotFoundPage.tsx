import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Not Found');
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Card>
        <EmptyState
          icon="alert"
          title="404 — Page not found"
          description="The page you are looking for doesn’t exist or has moved."
          action={
            <Button onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          }
        />
      </Card>
    </div>
  );
}
