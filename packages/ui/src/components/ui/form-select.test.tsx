import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { FormSelect, FormSelectItem } from "./form-select";

describe("FormSelect", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders the shared trigger styling", () => {
    render(
      <FormSelect value="interval" onValueChange={() => {}}>
        <FormSelectItem value="interval">Repeating Interval</FormSelectItem>
      </FormSelect>,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toContain("rounded-2xl");
    expect(trigger.className).toContain("focus:outline-[var(--ring)]");
    expect(trigger.className).toContain("focus:shadow-[0_0_0_4px_var(--focus)]");
  });

  it("renders shared menu item highlight styling", () => {
    render(
      <FormSelect value="interval" onValueChange={() => {}}>
        <FormSelectItem value="interval">Repeating Interval</FormSelectItem>
        <FormSelectItem value="once">One Time</FormSelectItem>
      </FormSelect>,
    );

    fireEvent.click(screen.getByRole("combobox"));

    const option = screen.getByRole("option", { name: "Repeating Interval" });
    expect(option.className).toContain("rounded-[14px]");
    expect(option.className).toContain("data-[state=checked]:bg-[linear-gradient");
    expect(option.className).toContain("data-[state=checked]:text-black");
  });
});
