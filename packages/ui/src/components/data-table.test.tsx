import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataTable } from "./data-table";
describe("DataTable", () => {
  const columns = [
    {
      id: "n",
      header: "Count",
      cell: (r: { id: string; n: number }) => r.n,
      sortValue: (r: { n: number }) => r.n,
      numeric: true,
    },
  ];
  it("sorts numbers and announces direction", () => {
    render(
      <DataTable
        label="Rows"
        columns={columns}
        rows={[
          { id: "a", n: 12 },
          { id: "b", n: 2 },
        ]}
        rowKey={(r) => r.id}
        empty="Empty"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("cell")[0]).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
  });
  it("uses a keyboard button for row activation and omits conflicting actions", () => {
    const click = vi.fn();
    render(
      <DataTable
        label="Rows"
        columns={columns}
        rows={[{ id: "a", n: 12 }]}
        rowKey={(r) => r.id}
        empty="Empty"
        onRowClick={click}
        rowActions={() => "Action"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByText("Action")).toBeNull();
  });
  it("renders loading and empty states", () => {
    const { rerender } = render(
      <DataTable
        label="Rows"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="Empty"
        loading
      />,
    );
    expect(screen.getByRole("region")).toHaveAttribute("aria-busy", "true");
    rerender(
      <DataTable label="Rows" columns={columns} rows={[]} rowKey={(r) => r.id} empty="Empty" />,
    );
    expect(screen.getByText("Empty")).toBeVisible();
  });
});
