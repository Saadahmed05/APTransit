"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { cn } from "../cn";
export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  numeric?: boolean;
}
export interface DataTableProps<T> {
  label: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  filters?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  pagination?: {
    hasNext: boolean;
    hasPrevious: boolean;
    onNext: () => void;
    onPrevious: () => void;
    nextLabel: string;
    previousLabel: string;
  };
}
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  loading,
  empty,
  filters,
  onRowClick,
  rowActions,
  pagination,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: "ascending" | "descending" } | null>(
    null,
  );
  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort?.id);
    if (!column?.sortValue || !sort) return rows;
    return [...rows].sort((a, b) => {
      const x = column.sortValue!(a),
        y = column.sortValue!(b);
      const delta =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""));
      return sort.direction === "ascending" ? delta : -delta;
    });
  }, [rows, columns, sort]);
  const count = columns.length + (rowActions && !onRowClick ? 1 : 0);
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={label}
      aria-busy={loading || undefined}
    >
      {filters}
      <div className="max-w-full overflow-x-auto rounded-lg border border-default bg-surface">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 z-header bg-surface-raised">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.sortValue
                      ? sort?.id === column.id
                        ? sort.direction
                        : "none"
                      : undefined
                  }
                  className={cn(
                    "border-b border-default px-4 py-2 text-left font-semibold",
                    column.numeric && "text-right tabular-nums",
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 text-left",
                        column.numeric && "justify-end",
                      )}
                      onClick={() =>
                        setSort({
                          id: column.id,
                          direction:
                            sort?.id === column.id && sort.direction === "ascending"
                              ? "descending"
                              : "ascending",
                        })
                      }
                    >
                      <span className="whitespace-normal">{column.header}</span>
                      {sort?.id === column.id ? (
                        sort.direction === "ascending" ? (
                          <ArrowUp className="size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-4 shrink-0" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="size-4 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions && !onRowClick && (
                <th scope="col">
                  <span className="sr-only">{label}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {Array.from({ length: count }, (_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length ? (
              sorted.map((row) => (
                <tr key={rowKey(row)} className="border-b border-default last:border-0">
                  {columns.map((column, i) => (
                    <td
                      key={column.id}
                      className={cn(
                        "min-h-11 px-4 py-3 align-middle",
                        column.numeric && "text-right tabular-nums",
                      )}
                    >
                      {onRowClick && i === 0 ? (
                        <button
                          type="button"
                          className="min-h-11 text-left text-primary underline underline-offset-4"
                          onClick={() => onRowClick(row)}
                        >
                          {column.cell(row)}
                        </button>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                  {rowActions && !onRowClick && <td className="px-4 py-3">{rowActions(row)}</td>}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={count} className="p-6">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={loading || !pagination.hasPrevious}
            onClick={pagination.onPrevious}
          >
            {pagination.previousLabel}
          </Button>
          <Button
            variant="secondary"
            disabled={loading || !pagination.hasNext}
            onClick={pagination.onNext}
          >
            {pagination.nextLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
