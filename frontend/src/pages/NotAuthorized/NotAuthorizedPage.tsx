import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotAuthorizedPage() {
  useDocumentTitle('Access Denied');
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Card>
        <EmptyState
          icon="alert"
          title="403 — Access denied"
          description="You do not have permission to view this page. If you believe this is an error, contact your administrator."
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
