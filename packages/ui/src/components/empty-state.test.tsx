import * as React from "react";
import { render, screen } from "@testing-library/react";
import { AlertCircle } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

describe("EmptyState", () => {
  it("renders default h3 heading", () => {
    render(<EmptyState icon={AlertCircle} title="No trips found" hint="Try another date" />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("No trips found");
    expect(screen.getByText("Try another date")).toBeInTheDocument();
  });

  it("renders h1 when headingLevel is h1", () => {
    render(<EmptyState icon={AlertCircle} title="Forbidden" headingLevel="h1" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Forbidden");
  });
});

describe("ErrorState", () => {
  it("renders default h3 heading", () => {
    render(<ErrorState title="Failed to load" message="Network error" retryLabel="Retry" />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Failed to load");
  });

  it("renders h1 when headingLevel is h1", () => {
    render(
      <ErrorState
        title="Page error"
        message="An unexpected error occurred"
        retryLabel="Retry"
        headingLevel="h1"
      />
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Page error");
  });
});
