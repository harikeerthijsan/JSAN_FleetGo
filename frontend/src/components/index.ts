/**
 * Barrel export for the reusable UI component library. Import from
 * `@/components` across all modules, e.g.:
 *   import { Button, Card, DataTable } from '@/components';
 */
export { Icon } from './ui/Icon/Icon';
export type { IconName, IconProps } from './ui/Icon/Icon';

export { Button } from './ui/Button/Button';
export type { ButtonProps } from './ui/Button/Button';

export { Card } from './ui/Card/Card';
export type { CardProps } from './ui/Card/Card';

export { Spinner } from './ui/Spinner/Spinner';
export type { SpinnerProps } from './ui/Spinner/Spinner';

export { StatusBadge } from './ui/StatusBadge/StatusBadge';
export type { StatusBadgeProps, BadgeTone } from './ui/StatusBadge/StatusBadge';

export { EmptyState, ErrorState } from './ui/States/States';

export { FormInput } from './ui/Form/FormInput';
export type { FormInputProps } from './ui/Form/FormInput';
export { Select } from './ui/Form/Select';
export type { SelectProps, SelectOption } from './ui/Form/Select';
export { DatePicker } from './ui/Form/DatePicker';
export type { DatePickerProps } from './ui/Form/DatePicker';
export { FileUpload } from './ui/Form/FileUpload';
export type { FileUploadProps } from './ui/Form/FileUpload';

export { SearchBar } from './ui/SearchBar/SearchBar';
export type { SearchBarProps } from './ui/SearchBar/SearchBar';

export { FilterPanel } from './ui/FilterPanel/FilterPanel';
export type { FilterPanelProps } from './ui/FilterPanel/FilterPanel';

export { DataTable } from './ui/DataTable/DataTable';
export type { DataTableProps, Column } from './ui/DataTable/DataTable';

export { Pagination } from './ui/Pagination/Pagination';
export type { PaginationProps } from './ui/Pagination/Pagination';

export { Modal } from './ui/Modal/Modal';
export type { ModalProps } from './ui/Modal/Modal';
export { ConfirmDialog } from './ui/Modal/ConfirmDialog';
export type { ConfirmDialogProps } from './ui/Modal/ConfirmDialog';

export { PageTitle } from './ui/PageTitle/PageTitle';
export type { PageTitleProps } from './ui/PageTitle/PageTitle';

export { Breadcrumbs } from './ui/Breadcrumbs/Breadcrumbs';
export type { Crumb, BreadcrumbsProps } from './ui/Breadcrumbs/Breadcrumbs';

export { BarChart, DonutChart } from './ui/Charts/Charts';
export type { ChartDatum } from './ui/Charts/Charts';
