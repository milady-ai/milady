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
    expect(screen.getByText("Faded")).toHaveClass("text-muted");
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
    expect(screen.getByText("Title").tagName).toBe("H3");
  });

  it("defaults to h1", () => {
    render(<Heading>Big Title</Heading>);
    expect(screen.getByText("Big Title").tagName).toBe("H1");
  });

  it("applies variant classes", () => {
    render(<Heading level="h2">Sub</Heading>);
    expect(screen.getByText("Sub")).toHaveClass("text-3xl");
  });
});
