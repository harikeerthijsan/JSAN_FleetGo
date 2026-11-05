import { Icon } from '../Icon/Icon';
import './Field.css';

export interface FileUploadProps {
  label?: string;
  hint?: string;
  /**
   * Phase 1 is a visual placeholder only — actual upload handling (and the
   * backend storage wiring) arrives with the module that needs it. The
   * control is intentionally disabled so it cannot be mistaken for a working
   * uploader.
   */
  disabled?: boolean;
}

/** File upload placeholder (readiness only — no upload occurs in Phase 1). */
export function FileUpload({
  label = 'Upload files',
  hint = 'Photo and document upload will be enabled in a later phase.',
  disabled = true,
}: FileUploadProps) {
  return (
    <div className="fg-field">
      {label ? <span className="fg-field__label">{label}</span> : null}
      <div
        className="fg-fileupload"
        aria-disabled={disabled}
        role="button"
        tabIndex={disabled ? -1 : 0}
      >
        <Icon name="upload" size={24} />
        <span>Drag &amp; drop or click to browse</span>
        <span className="fg-fileupload__hint">{hint}</span>
      </div>
    </div>
  );
}
