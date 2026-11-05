import { Icon } from '../Icon/Icon';
import './Pagination.css';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Simple, reusable pagination control driven by total/pageSize. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="fg-pagination">
      <span className="fg-pagination__info">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of{' '}
        <strong>{total}</strong>
      </span>
      <div className="fg-pagination__controls">
        <button
          className="fg-pagination__btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <span className="fg-pagination__page">
          Page {page} of {totalPages}
        </span>
        <button
          className="fg-pagination__btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </div>
  );
}
