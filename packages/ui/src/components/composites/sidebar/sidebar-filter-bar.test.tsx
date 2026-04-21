import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarFilterBar } from "./sidebar-filter-bar";

describe("SidebarFilterBar", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders the current option and fires the action callbacks", () => {
    const onSelectValueChange = vi.fn();
    const onSortDirectionToggle = vi.fn();
    const onRefresh = vi.fn();

    render(
      <SidebarFilterBar
        selectValue="name"
        selectOptions={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
        ]}
        onSelectValueChange={onSelectValueChange}
        selectAriaLabel="Sort by"
        sortDirection="asc"
        onSortDirectionToggle={onSortDirectionToggle}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Name");

    fireEvent.click(screen.getByLabelText("Sort ascending"));
    fireEvent.click(screen.getByLabelText("Refresh"));

    expect(onSortDirectionToggle).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Date" }));

    expect(onSelectValueChange).toHaveBeenCalledWith("date");
  });
});
