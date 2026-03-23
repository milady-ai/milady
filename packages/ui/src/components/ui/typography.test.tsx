import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heading, Text } from "./typography";

describe("Text", () => {
  it("renders p by default", () => {
    render(<Text>Hello</Text>);
    const el = screen.getByText("Hello");
    expect(el.tagName).toBe("P");
  });

  it("applies variant classes", () => {
    render(<Text variant="muted">Faded</Text>);
    const el = screen.getByText("Faded");
    expect(el.className).toContain("text-muted");
  });

  it("renders span when asChild", () => {
    render(<Text asChild>Inline</Text>);
    const el = screen.getByText("Inline");
    expect(el.tagName).toBe("SPAN");
  });
});

describe("Heading", () => {
  it("renders correct heading level", () => {
    render(<Heading level="h3">Title</Heading>);
    const el = screen.getByText("Title");
    expect(el.tagName).toBe("H3");
  });

  it("defaults to h1", () => {
    render(<Heading>Big Title</Heading>);
    const el = screen.getByText("Big Title");
    expect(el.tagName).toBe("H1");
  });

  it("applies variant classes", () => {
    render(<Heading level="h2">Sub</Heading>);
    const el = screen.getByText("Sub");
    expect(el.className).toContain("text-3xl");
  });
});
