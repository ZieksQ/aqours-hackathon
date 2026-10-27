import type { ReactNode } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { Button } from "./Controls";

export function Table({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className="ui-table-scroll">
      <table aria-label={label} className={`ui-table ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  count,
  noun,
  onChange,
  disabled = false,
  compact = false,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  count: number;
  noun: string;
  onChange: (page: number) => void;
  disabled?: boolean;
  compact?: boolean;
  onPageSizeChange?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const numbers = [
    ...new Set([
      1,
      ...Array.from({ length: 3 }, (_, i) =>
        Math.min(pages, Math.max(1, page - 1) + i),
      ),
      pages,
    ]),
  ]
    .filter((n) => n <= pages)
    .sort((a, b) => a - b);
  return (
    <nav
      className={`ui-pagination${compact ? " ui-pagination-compact" : ""}`}
      aria-label={`${noun} pages`}
    >
      <p>
        Showing{" "}
        <strong>
          {count ? (page - 1) * pageSize + 1 : 0}–
          {count ? (page - 1) * pageSize + count : 0}
        </strong>{" "}
        of <strong>{total}</strong> {noun}
      </p>
      {onPageSizeChange && (
        <label className="ui-page-size">
          Rows per page
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[20, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      )}
      <div>
        {onPageSizeChange && (
          <span className="muted">
            Page {page} of {pages}
          </span>
        )}
        <Button
          variant="secondary"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <FiChevronLeft aria-hidden="true" />
          <span>Previous</span>
        </Button>
        {!compact &&
          numbers.map((n, i) => (
            <span key={n} className="ui-page-number">
              {i > 0 && n > numbers[i - 1] + 1 && (
                <span aria-hidden="true">…</span>
              )}
              <Button
                variant={page === n ? "primary" : "ghost"}
                aria-label={`Page ${n}`}
                aria-current={page === n ? "page" : undefined}
                disabled={disabled}
                onClick={() => onChange(n)}
              >
                {n}
              </Button>
            </span>
          ))}
        <Button
          variant="secondary"
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <span>Next</span>
          <FiChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
