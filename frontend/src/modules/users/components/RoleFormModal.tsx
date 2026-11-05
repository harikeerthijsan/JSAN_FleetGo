import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, FormInput, Modal } from '@/components';
import type { NormalizedApiError } from '@/services/apiClient';
import { roleService } from '@/services/roleService';
import type { Permission, Role } from '@/types/auth';
import './RoleFormModal.css';

interface RoleFormModalProps {
  open: boolean;
  role: Role | null; // null => create
  permissions: Permission[];
  grouped: Record<string, Permission[]>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function RoleFormModal({
  open,
  role,
  grouped,
  onClose,
  onSaved,
}: RoleFormModalProps) {
  const isEdit = Boolean(role);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(role?.name ?? '');
    setDisplayName(role?.displayName ?? '');
    setDescription(role?.description ?? '');
    setSelected(new Set(role?.permissionKeys ?? []));
  }, [open, role]);

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const permissionKeys = [...selected];
      if (isEdit && role) {
        await roleService.update(role.id, {
          displayName,
          description: description || null,
          permissionKeys,
        });
        onSaved('Role updated successfully');
      } else {
        await roleService.create({ name, displayName, description, permissionKeys });
        onSaved('Role created successfully');
      }
      onClose();
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Could not save role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit role — ${role?.displayName}` : 'Create role'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" loading={loading}>
            {isEdit ? 'Save changes' : 'Create role'}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit}>
        {error ? (
          <div className="fg-auth__error" style={{ marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        ) : null}
        <div className="fg-roleform__fields">
          {!isEdit ? (
            <FormInput
              label="Role key"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="e.g. REGIONAL_MANAGER"
              hint="UPPER_SNAKE_CASE. Cannot be changed later."
              required
            />
          ) : (
            <FormInput label="Role key" value={name} disabled />
          )}
          <FormInput
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <FormInput
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="fg-roleform__perms-title">
          Permissions ({selected.size} selected)
        </div>
        <div className="fg-roleform__grid">
          {categories.map((cat) => (
            <div key={cat} className="fg-roleform__group">
              <div className="fg-roleform__group-title">{cat}</div>
              {grouped[cat].map((perm) => (
                <label key={perm.key} className="fg-roleform__perm">
                  <input
                    type="checkbox"
                    checked={selected.has(perm.key)}
                    onChange={() => toggle(perm.key)}
                  />
                  <span>
                    <code>{perm.key}</code>
                    <small>{perm.description}</small>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
