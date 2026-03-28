// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_NAME_MAX_LENGTH } from "../utils/owner-name";
import { OwnerNamePrompt } from "./OwnerNamePrompt";

describe("OwnerNamePrompt", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not render when closed", () => {
    render(<OwnerNamePrompt open={false} onSubmit={vi.fn()} />);

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("caps submitted names at 60 characters and keeps blank submissions disabled", () => {
    const onSubmit = vi.fn();

    render(<OwnerNamePrompt open={true} onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    const submit = screen.getByRole("button", { name: /that's me/i });

    expect(input.getAttribute("maxlength")).toBe(String(OWNER_NAME_MAX_LENGTH));
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "   " } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: `  ${"a".repeat(80)}  ` } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith("a".repeat(OWNER_NAME_MAX_LENGTH));
  });
});
