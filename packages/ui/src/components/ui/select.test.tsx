import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";
import {
  SELECT_FLOATING_LAYER_CLASSNAME,
  SELECT_FLOATING_LAYER_NAME,
} from "../../lib/floating-layers";

describe("Select", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders trigger with placeholder", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("trigger has combobox role", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">X</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("can be opened via click", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
          <SelectItem value="two">Two</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    // After opening, the listbox should appear
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("mounts the listbox on the shared floating layer outside clipping shells", () => {
    const { getByTestId } = render(
      <div
        data-testid="clipping-shell"
        className="overflow-hidden rounded-[30px] border border-border"
      >
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
            <SelectItem value="two">Two</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );

    fireEvent.click(screen.getByRole("combobox"));

    const shell = getByTestId("clipping-shell");
    const floatingLayer = document.body.querySelector(
      `[data-floating-layer="${SELECT_FLOATING_LAYER_NAME}"]`,
    ) as HTMLElement | null;

    expect(floatingLayer).not.toBeNull();
    expect(floatingLayer).toHaveClass(SELECT_FLOATING_LAYER_CLASSNAME);
    expect(shell.contains(floatingLayer!)).toBe(false);
    expect(screen.getByRole("listbox")).toBe(floatingLayer);
  });
});
