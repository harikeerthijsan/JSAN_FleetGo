import { Card, PageTitle, StatusBadge } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import './ProfilePage.css';

export function ProfilePage() {
  useDocumentTitle('My Profile');
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <PageTitle
        title="My Profile"
        description="Your account details and effective permissions."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'My Profile' }]}
      />
      <div className="fg-profile">
        <Card title="Account">
          <dl className="fg-profile__list">
            <div><dt>Full name</dt><dd>{user.fullName}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div>
              <dt>Role</dt>
              <dd><StatusBadge tone="info">{user.role.displayName}</StatusBadge></dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{user.organizationType ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Effective Permissions"
          subtitle={`${user.permissions.length} permission(s) granted by your role`}
        >
          <div className="fg-profile__perms">
            {user.permissions.map((p) => (
              <span key={p} className="fg-profile__perm">{p}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
