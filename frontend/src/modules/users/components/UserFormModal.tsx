import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) { errorRef.current?.scrollIntoView({ block: 'nearest' }); errorRef.current?.focus(); }
  }, [error]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
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

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((errors) => { const next = { ...errors }; delete next[key]; return next; });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const errors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errors.fullName = 'Enter a full name with at least two characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (!form.roleId) errors.roleId = 'Select a role.';
    if (selectedRole?.name === 'VENDOR_USER' && !organizations.some((org) => org.id === form.organizationId && org.type === 'VEHICLE_VENDOR')) errors.organizationId = 'Select a vehicle-vendor organization for this role.';
    if (!isEdit && form.password && (form.password.length < 8 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)))
      errors.password = 'Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('Check the highlighted fields below.'); return; }
    setLoading(true);
    try {
      if (isEdit && user) {
        await userService.update(user.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone || undefined,
          roleId: form.roleId,
          organizationId: form.organizationId || undefined,
          profile: buildProfile(),
        });
        onSaved('User updated successfully');
      } else {
        const result = await userService.create({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
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
      const apiError = err as NormalizedApiError;
      const issues: Record<string, string> = {};
      if (Array.isArray(apiError.details)) {
        for (const detail of apiError.details) {
          if (detail && typeof detail.field === 'string' && typeof detail.message === 'string') {
            const key = detail.field.replace(/^profile\./, '');
            issues[key] = issues[key] ? `${issues[key]} ${detail.message}` : detail.message;
          }
        }
      }
      setFieldErrors(issues);
      setError(Object.keys(issues).length ? 'Check the highlighted fields below.' : apiError.message ?? 'Could not save user');
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
      <form id="user-form" className="fg-auth__form" noValidate onSubmit={onSubmit}>
        {error ? <div className="fg-auth__error" role="alert" ref={errorRef} tabIndex={-1}>{error}</div> : null}
        <FormInput
          label="Full name"
          error={fieldErrors.fullName}
          value={form.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          required
        />
        <FormInput
          label="Email"
          error={fieldErrors.email}
          type="email"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          required
        />
        <FormInput
          label="Phone"
          error={fieldErrors.phone}
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
        />
        <Select
          label="Role"
          error={fieldErrors.roleId}
          required
          value={form.roleId}
          onChange={(e) => set('roleId')(e.target.value)}
          placeholder="Select a role"
          options={roles.map((r) => ({ label: r.displayName, value: r.id }))}
        />
        <Select
          label="Organization"
          error={fieldErrors.organizationId}
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
            error={fieldErrors.password}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            hint="At least 8 characters with uppercase, lowercase and a number. Leave blank to generate a temporary password."
          />
        ) : null}

        {form.roleId ? (
          <>
            {isDriver ? (
              <>
                <p className="fg-user-form__section">Driver licence</p>
                <FormInput error={fieldErrors.licenseNumber} label="Licence number" value={form.licenseNumber} onChange={(e) => set('licenseNumber')(e.target.value)} />
                <div className="fg-user-form__row">
                  <FormInput error={fieldErrors.licenseClass} label="Licence class" value={form.licenseClass} onChange={(e) => set('licenseClass')(e.target.value)} />
                  <FormInput error={fieldErrors.licenseExpiry} label="Licence expiry" type="date" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry')(e.target.value)} />
                </div>
              </>
            ) : null}

            <p className="fg-user-form__section">{isDriver ? 'Address & emergency contact' : 'Additional details'}</p>
            <FormInput error={fieldErrors.addressLine} label="Address" value={form.addressLine} onChange={(e) => set('addressLine')(e.target.value)} />
            <div className="fg-user-form__row">
              <FormInput error={fieldErrors.city} label="City" value={form.city} onChange={(e) => set('city')(e.target.value)} />
              <FormInput error={fieldErrors.state} label="State" value={form.state} onChange={(e) => set('state')(e.target.value)} />
              <FormInput error={fieldErrors.postalCode} label="Postal code" value={form.postalCode} onChange={(e) => set('postalCode')(e.target.value)} />
            </div>
            <div className="fg-user-form__row">
              <FormInput error={fieldErrors.emergencyContactName} label="Emergency contact name" value={form.emergencyContactName} onChange={(e) => set('emergencyContactName')(e.target.value)} />
              <FormInput error={fieldErrors.emergencyContactPhone} label="Emergency contact number" type="tel" value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone')(e.target.value)} />
            </div>
            {isDriver ? (
              <FormInput error={fieldErrors.dateOfBirth} label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth')(e.target.value)} />
            ) : null}
          </>
        ) : null}
      </form>
    </Modal>
  );
}
