import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  renderMarkdown,
  sanitizeMarkdownHref,
} from "../../src/components/WorkspaceNotesMarkdown";
import { WorkspaceNotesPanel } from "../../src/components/WorkspaceNotesPanel";

type LocalStorageFacade = {
  clear: () => void;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as TestRenderer.ReactTestInstance),
    )
    .join("");
}

function findButtonByLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll((node) => node.type === "button" && nodeText(node) === label);
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

function findTextAreaByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "textarea" && node.props.placeholder === placeholder,
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

function ensureStorage(): void {
  if (typeof localStorage !== "undefined") {
    return;
  }

  const values = new Map<string, string>();

  const storage = {
    clear: () => {
      values.clear();
    },
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
    removeItem: (key: string): void => {
      values.delete(key);
    },
  } as const;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function mockStorage(): void {
  ensureStorage();
  localStorage.setItem("milaidy:workspace-notes", "[]");
}

describe("WorkspaceNotesPanel", () => {
  beforeEach(() => {
    ensureStorage();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads seeded content, switches to split mode, and forwards note actions", async () => {
    const onCreateActionFromNote = vi.fn();
    const onCreateSkillFromNote = vi.fn().mockResolvedValue(undefined);
    mockStorage();

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(WorkspaceNotesPanel, {
          open: true,
          mode: "edit",
          seedText: "## Skill Draft\n- Inputs:\n- Output:",
          onClose: vi.fn(),
          onCreateActionFromNote,
          onCreateSkillFromNote,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const root = tree!.root;
    const editor = findTextAreaByPlaceholder(
      root,
      "Capture workspace notes, action ideas, skill specs...",
    );
    expect(editor.props.value).toContain("## Skill Draft");
    expect(editor.props.value).toContain("- Inputs:");

    const createActionButton = findButtonByLabel(root, "Create Custom Action Prompt");
    const createSkillButton = findButtonByLabel(root, "Create Skill");

    await act(async () => {
      createActionButton.props.onClick();
      createSkillButton.props.onClick();
      await Promise.resolve();
    });

    expect(onCreateActionFromNote).toHaveBeenCalledWith(
      expect.stringContaining("## Skill Draft"),
      expect.any(String),
    );
    expect(onCreateSkillFromNote).toHaveBeenCalledWith(
      expect.stringContaining("## Skill Draft"),
      expect.any(String),
    );

    const splitButton = findButtonByLabel(root, "Split");
    await act(async () => {
      splitButton.props.onClick();
    });

    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(1);
    const heading = root.findAll(
      (node) => node.type === "h2" && nodeText(node) === "Skill Draft",
    );
    expect(heading.length).toBe(1);
  });

  it("supports markdown toolbar actions and preview mode", async () => {
    const onCreateActionFromNote = vi.fn();
    const onCreateSkillFromNote = vi.fn().mockResolvedValue(undefined);
    mockStorage();

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(WorkspaceNotesPanel, {
          open: true,
          mode: "edit",
          onClose: vi.fn(),
          onCreateActionFromNote,
          onCreateSkillFromNote,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const root = tree!.root;
    const editor = findTextAreaByPlaceholder(
      root,
      "Capture workspace notes, action ideas, skill specs...",
    );
    const h1Button = findButtonByLabel(root, "H1");
    const skillTemplateButton = findButtonByLabel(root, "+ Skill");
    const previewButton = findButtonByLabel(root, "Preview");
    const editButton = findButtonByLabel(root, "Edit");

    await act(async () => {
      editor.props.onChange({ target: { value: "capture ideas" } });
    });
    await act(async () => {
      h1Button.props.onClick();
    });
    await act(async () => {
      skillTemplateButton.props.onClick();
    });

    const editorWithTemplate = root.findAll(
      (node) =>
        node.type === "textarea" &&
        node.props.placeholder ===
          "Capture workspace notes, action ideas, skill specs...",
    )[0] as TestRenderer.ReactTestInstance;
    expect(editorWithTemplate.props.value).toContain("## Skill Intent");
    expect(editorWithTemplate.props.value).toContain("capture ideas");

    await act(async () => {
      previewButton.props.onClick();
    });
    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(0);

    const renderNode = root.findAll(
      (node) => node.type === "div" && nodeText(node).includes("Skill Intent"),
    );
    expect(renderNode.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      editButton.props.onClick();
    });
    expect(root.findAll((node) => node.type === "textarea")).toHaveLength(1);
  });

  it("rejects unsafe markdown links and allows safe protocols", async () => {
    const safeMarkup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderMarkdown("[Safe](https://example.com)"),
      ),
    );
    expect(safeMarkup).toContain('<a href="https://example.com"');
    expect(safeMarkup).toContain(">Safe</a>");

    const unsafeMarkup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderMarkdown("[Bad](javascript:alert(1))"),
      ),
    );
    expect(unsafeMarkup).toContain("javascript:alert(1)");
    expect(unsafeMarkup).not.toContain("<a href=\"javascript");

    expect(sanitizeMarkdownHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeMarkdownHref("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeMarkdownHref("data:text/plain,hello")).toBeNull();
  });
});
