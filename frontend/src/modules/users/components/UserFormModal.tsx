import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormInput, Modal, Select } from '@/components';
import type { NormalizedApiError } from '@/services/apiClient';
import { userService } from '@/services/userService';
import type { ManagedUser, Organization, Role } from '@/types/auth';
import './UserFormModal.css';

interface UserFormModalProps {
  open: boolean;
  user: ManagedUser | null; // null => create mode
  roles: Role[];
  organizations: Organization[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  organizationId: string;
  password: string;
  // Role-specific profile details.
  licenseNumber: string;
  licenseExpiry: string;
  licenseClass: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  dateOfBirth: string;
}

const EMPTY: FormState = {
  fullName: '',
  email: '',
  phone: '',
  roleId: '',
  organizationId: '',
  password: '',
  licenseNumber: '',
  licenseExpiry: '',
  licenseClass: '',
  addressLine: '',
  city: '',
  state: '',
  postalCode: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  dateOfBirth: '',
};

export function UserFormModal({
  open,
  user,
  roles,
  organizations,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const isEdit = Boolean(user);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (user) {
      const p = user.profile;
      setForm({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? '',
        roleId: user.role.id,
        organizationId: user.organization?.id ?? '',
        password: '',
        licenseNumber: p?.licenseNumber ?? '',
        licenseExpiry: p?.licenseExpiry ? p.licenseExpiry.slice(0, 10) : '',
        licenseClass: p?.licenseClass ?? '',
        addressLine: p?.addressLine ?? '',
        city: p?.city ?? '',
        state: p?.state ?? '',
        postalCode: p?.postalCode ?? '',
        emergencyContactName: p?.emergencyContactName ?? '',
        emergencyContactPhone: p?.emergencyContactPhone ?? '',
        dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, user]);

  // Determine the selected role's machine name to drive role-specific fields.
  const selectedRole = roles.find((r) => r.id === form.roleId);
  const isDriver = selectedRole?.name === 'TRANSPORTER_DRIVER';

  const buildProfile = () => ({
    addressLine: form.addressLine || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    postalCode: form.postalCode || undefined,
    emergencyContactName: form.emergencyContactName || undefined,
    emergencyContactPhone: form.emergencyContactPhone || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    // Licence details only for drivers.
    licenseNumber: isDriver ? form.licenseNumber || undefined : undefined,
    licenseExpiry: isDriver ? form.licenseExpiry || undefined : undefined,
    licenseClass: isDriver ? form.licenseClass || undefined : undefined,
  });

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isEdit && user) {
        await userService.update(user.id, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || undefined,
          roleId: form.roleId,
          organizationId: form.organizationId || undefined,
          profile: buildProfile(),
        });
        onSaved('User updated successfully');
      } else {
        const result = await userService.create({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || undefined,
          roleId: form.roleId,
          organizationId: form.organizationId || undefined,
          password: form.password || undefined,
          profile: buildProfile(),
        });
        onSaved(
          result.tempPassword
            ? `User created. Temporary password: ${result.tempPassword}`
            : 'User created successfully',
        );
      }
      onClose();
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Could not save user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit user' : 'Create user'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={loading}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" className="fg-auth__form" onSubmit={onSubmit}>
        {error ? <div className="fg-auth__error">{error}</div> : null}
        <FormInput
          label="Full name"
          value={form.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          required
        />
        <FormInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          required
        />
        <FormInput
          label="Phone"
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
        />
        <Select
          label="Role"
          required
          value={form.roleId}
          onChange={(e) => set('roleId')(e.target.value)}
          placeholder="Select a role"
          options={roles.map((r) => ({ label: r.displayName, value: r.id }))}
        />
        <Select
          label="Organization"
          value={form.organizationId}
          onChange={(e) => set('organizationId')(e.target.value)}
          options={[
            { label: 'None', value: '' },
            ...organizations.map((o) => ({
              label: `${o.name} (${o.type})`,
              value: o.id,
            })),
          ]}
        />
        {!isEdit ? (
          <FormInput
            label="Initial password"
            type="password"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            hint="Leave blank to auto-generate a temporary password."
          />
        ) : null}

        {form.roleId ? (
          <>
            {isDriver ? (
              <>
                <p className="fg-user-form__section">Driver licence</p>
                <FormInput label="Licence number" value={form.licenseNumber} onChange={(e) => set('licenseNumber')(e.target.value)} />
                <div className="fg-user-form__row">
                  <FormInput label="Licence class" value={form.licenseClass} onChange={(e) => set('licenseClass')(e.target.value)} />
                  <FormInput label="Licence expiry" type="date" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry')(e.target.value)} />
                </div>
              </>
            ) : null}

            <p className="fg-user-form__section">{isDriver ? 'Address & emergency contact' : 'Additional details'}</p>
            <FormInput label="Address" value={form.addressLine} onChange={(e) => set('addressLine')(e.target.value)} />
            <div className="fg-user-form__row">
              <FormInput label="City" value={form.city} onChange={(e) => set('city')(e.target.value)} />
              <FormInput label="State" value={form.state} onChange={(e) => set('state')(e.target.value)} />
              <FormInput label="Postal code" value={form.postalCode} onChange={(e) => set('postalCode')(e.target.value)} />
            </div>
            <div className="fg-user-form__row">
              <FormInput label="Emergency contact name" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName')(e.target.value)} />
              <FormInput label="Emergency contact number" type="tel" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone')(e.target.value)} />
            </div>
            {isDriver ? (
              <FormInput label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth')(e.target.value)} />
            ) : null}
          </>
        ) : null}
      </form>
    </Modal>
  );
}
