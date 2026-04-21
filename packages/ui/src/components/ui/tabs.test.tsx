import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

describe("Tabs", () => {
  it("renders tab triggers", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">Tab 1</TabsTrigger>
          <TabsTrigger value="two">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Content 1</TabsContent>
        <TabsContent value="two">Content 2</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("shows correct content for default tab", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">Tab 1</TabsTrigger>
          <TabsTrigger value="two">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Content 1</TabsContent>
        <TabsContent value="two">Content 2</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Content 1")).toBeInTheDocument();
  });

  it("tab triggers have correct role", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
  });
});
