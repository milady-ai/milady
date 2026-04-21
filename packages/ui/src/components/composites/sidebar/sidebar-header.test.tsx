import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarHeader } from "./sidebar-header";

describe("SidebarHeader", () => {
  it("renders the shared search field and optional header content", () => {
    render(
      <SidebarHeader
        search={{
          "aria-label": "Search chats",
          onChange: () => {},
          placeholder: "Search chats",
          value: "",
        }}
      >
        <button type="button">New chat</button>
      </SidebarHeader>,
    );

    expect(screen.getByRole("textbox", { name: "Search chats" })).toHaveAttribute(
      "placeholder",
      "Search chats...",
    );
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
  });
});
