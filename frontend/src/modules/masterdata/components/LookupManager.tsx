import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  FormInput,
  Icon,
  Modal,
  SearchBar,
  Select,
  StatusBadge,
  type Column,
} from '@/components';
import type { NormalizedApiError } from '@/services/apiClient';
import {
  masterDataService,
  type MasterResource,
} from '@/services/masterDataService';
import type { MasterRecord } from '@/types/vehicle';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface LookupManagerProps {
  resource: MasterResource;
  title: string;
  singular: string;
  description?: string;
  /** Data columns (before the auto Status + Actions columns). */
  columns: Column<MasterRecord>[];
  /** Form fields for create/edit. */
  fields: FieldDef[];
  statusField: 'isActive' | 'status';
  canManage: boolean;
  /** Bump to force a reload (e.g. after a related list changed). */
  reloadKey?: number;
  onChanged?: () => void;
}

function isRecordActive(r: MasterRecord, statusField: 'isActive' | 'status'): boolean {
  return statusField === 'isActive' ? r.isActive !== false : r.status !== 'INACTIVE';
}

export function LookupManager({
  resource, title, singular, description, columns, fields,
  statusField, canManage, reloadKey = 0, onChanged,
}: LookupManagerProps) {
  const [rows, setRows] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRecord | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<MasterRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await masterDataService.list(resource, {
        pageSize: 200,
        search: search || undefined,
      });
      setRows(res.data);
    } catch (e) {
      setError((e as NormalizedApiError).message);
    } finally {
      setLoading(false);
    }
  }, [resource, search]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setModalOpen(true);
  };
  const openEdit = (r: MasterRecord) => {
    setEditing(r);
    const f: Record<string, string> = {};
    for (const field of fields) {
      const val = (r as unknown as Record<string, unknown>)[field.name];
      f[field.name] = val === null || val === undefined ? '' : String(val);
    }
    setModalOpen(true);
    setForm(f);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        const v = form[field.name]?.trim() ?? '';
        if (v === '') continue;
        payload[field.name] = field.type === 'number' ? Number(v) : v;
      }
      if (editing) await masterDataService.update(resource, editing.id, payload);
      else await masterDataService.create(resource, payload);
      setModalOpen(false);
      setNotice(`${singular} ${editing ? 'updated' : 'created'}.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError((err as NormalizedApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (r: MasterRecord) => {
    const active = isRecordActive(r, statusField);
    try {
      await masterDataService.setStatus(resource, r.id, !active);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as NormalizedApiError).message);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await masterDataService.remove(resource, toDelete.id);
      setToDelete(null);
      setNotice(`${singular} deleted.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as NormalizedApiError).message);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const allColumns: Column<MasterRecord>[] = [
    ...columns,
    {
      key: '_status', header: 'Status',
      render: (r) =>
        isRecordActive(r, statusField) ? (
          <StatusBadge tone="success">Active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Inactive</StatusBadge>
        ),
    },
    ...(canManage
      ? [{
          key: '_actions', header: '', align: 'right' as const,
          render: (r: MasterRecord) => (
            <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)}>
                {isRecordActive(r, statusField) ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>Delete</Button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <Card
      title={title}
      subtitle={description}
      actions={canManage ? (
        <Button size="sm" leftIcon={<Icon name="settings" size={14} />} onClick={openCreate}>
          Add {singular.toLowerCase()}
        </Button>
      ) : undefined}
      flush
    >
      <div style={{ padding: 'var(--space-4)' }}>
        <SearchBar placeholder={`Search ${title.toLowerCase()}…`} value={search} onValueChange={setSearch} />
      </div>
      {notice ? (
        <div className="fg-auth__notice" style={{ margin: '0 var(--space-4) var(--space-3)', cursor: 'pointer' }} onClick={() => setNotice(null)}>{notice}</div>
      ) : null}
      {error ? (
        <div className="fg-auth__error" style={{ margin: '0 var(--space-4) var(--space-3)' }}>{error}</div>
      ) : null}

      <DataTable
        columns={allColumns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyTitle={`No ${title.toLowerCase()}`}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="lookup-form" loading={saving}>{editing ? 'Save' : 'Create'}</Button>
          </>
        }
      >
        <form id="lookup-form" className="fg-auth__form" onSubmit={submit}>
          {fields.map((f) =>
            f.type === 'select' ? (
              <Select key={f.name} label={f.label} required={f.required}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                placeholder={f.placeholder ?? '—'}
                options={f.options ?? []} />
            ) : (
              <FormInput key={f.name} label={f.label} required={f.required}
                type={f.type === 'number' ? 'number' : 'text'}
                value={form[f.name] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} />
            ),
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete ${singular.toLowerCase()}`}
        message={`Delete "${toDelete?.name}"? If it is referenced by vehicles this will be blocked — deactivate it instead.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
