import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormInput, Modal, Select } from '@/components';
import type { NormalizedApiError } from '@/services/apiClient';
import { organizationService } from '@/services/organizationService';
import type { EntityStatus, Organization, OrganizationType } from '@/types/auth';

interface OrgFormModalProps {
  open: boolean;
  org: Organization | null; // null => create
  onClose: () => void;
  onSaved: (message: string) => void;
}

const TYPE_OPTIONS = [
  { label: 'CTS', value: 'CTS' },
  { label: 'JSAN', value: 'JSAN' },
  { label: 'Vehicle Vendor', value: 'VEHICLE_VENDOR' },
  { label: 'Transport Partner', value: 'TRANSPORT_PARTNER' },
];

export function OrgFormModal({ open, org, onClose, onSaved }: OrgFormModalProps) {
  const isEdit = Boolean(org);
  const [name, setName] = useState('');
  const [type, setType] = useState<OrganizationType>('VEHICLE_VENDOR');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [status, setStatus] = useState<EntityStatus>('ACTIVE');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(org?.name ?? '');
    setType(org?.type ?? 'VEHICLE_VENDOR');
    setContactName(org?.contactName ?? '');
    setContactEmail(org?.contactEmail ?? '');
    setContactPhone(org?.contactPhone ?? '');
    setStatus(org?.status ?? 'ACTIVE');
  }, [open, org]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        name,
        type,
        contactName: contactName || undefined,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        status,
      };
      if (isEdit && org) {
        await organizationService.update(org.id, payload);
        onSaved('Organization updated successfully');
      } else {
        await organizationService.create(payload);
        onSaved('Organization created successfully');
      }
      onClose();
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Could not save organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit organization' : 'Create organization'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="org-form" loading={loading}>
            {isEdit ? 'Save changes' : 'Create organization'}
          </Button>
        </>
      }
    >
      <form id="org-form" className="fg-auth__form" onSubmit={onSubmit}>
        {error ? <div className="fg-auth__error">{error}</div> : null}
        <FormInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as OrganizationType)}
          options={TYPE_OPTIONS}
          disabled={isEdit}
        />
        <FormInput
          label="Contact name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <FormInput
          label="Contact email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
        <FormInput
          label="Contact phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as EntityStatus)}
          options={[
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Inactive', value: 'INACTIVE' },
          ]}
        />
      </form>
    </Modal>
  );
}
