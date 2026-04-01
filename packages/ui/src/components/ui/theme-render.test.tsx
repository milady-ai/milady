import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { ChatEmptyState } from "./chat-atoms";
import { ConfirmDialog } from "./confirm-dialog";
import { TagEditor } from "./tag-editor";
import { ThemedSelect } from "./themed-select";

function renderWithTheme(theme: "light" | "dark", ui: ReactElement) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  return render(
    <div data-theme={theme} className={theme === "dark" ? "dark" : undefined}>
      {ui}
    </div>,
  );
}

describe.each(["light", "dark"] as const)("theme %s", (theme) => {
  it("renders primary buttons with semantic theme tokens", () => {
    renderWithTheme(theme, <Button>Continue</Button>);

    expect(
      screen.getByRole("button", { name: "Continue" }).className,
    ).toContain("text-accent");
    expect(
      screen.getByRole("button", { name: "Continue" }).className,
    ).toContain("dark:text-accent");
    expect(
      screen.getByRole("button", { name: "Continue" }).className,
    ).toContain("bg-accent/18");
  });

  it("keeps warning confirmations readable on both themes", () => {
    renderWithTheme(
      theme,
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Proceed?"
        confirmLabel="Proceed"
        tone="warn"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Proceed" }).className).toContain(
      "bg-warn/92",
    );
  });

  it("renders themed select menus with semantic surface tokens", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      theme,
      <ThemedSelect
        value={null}
        onChange={vi.fn()}
        groups={[
          {
            label: "Providers",
            items: [{ id: "openai", text: "OpenAI" }],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Providers").className).toContain("bg-bg-accent");
    expect(screen.getByRole("option", { name: /OpenAI/ }).className).toContain(
      "text-txt",
    );
  });

  it("renders chat and tag chips without hardcoded light-only colors", () => {
    renderWithTheme(
      theme,
      <div>
        <ChatEmptyState agentName="Milady" suggestions={["Hello"]} />
        <TagEditor label="Tags" items={["alpha"]} onChange={vi.fn()} />
      </div>,
    );

    expect(screen.getByText(/Send a message to/).className).toContain(
      "font-[var(--font-chat)]",
    );
    expect(screen.getByText("alpha").parentElement?.className).toContain(
      "bg-bg-accent",
    );
  });
});
