import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";

describe("Dialog", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders trigger button", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("opens content on trigger click", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Title</DialogTitle>
            <DialogDescription>My Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Description")).toBeInTheDocument();
  });

  it("shows title and description", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Title</DialogTitle>
            <DialogDescription>Test Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("close button is rendered inside content", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("can hide the default close button", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText("Close")).toBeNull();
  });
});
